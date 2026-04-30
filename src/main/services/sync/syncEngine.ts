import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import type { S3Client } from '@aws-sdk/client-s3'
import { app, BrowserWindow } from 'electron'
import {
  createS3Client,
  uploadFile,
  downloadFile,
  listObjects,
  deleteObject,
  headObject,
  type S3Credentials
} from './s3Client'
import {
  fetchManifest,
  buildManifest,
  commitManifest,
  PreconditionFailedError,
  MANIFEST_KEY,
  DB_OBJECT_KEY
} from './manifest'
import {
  packageDatabase,
  installDatabase,
  liveDbSha256,
  cleanupTmp,
  getDbPath
} from './dbPackage'
import {
  getSyncConfig,
  getDecryptedCredentials,
  setCursor,
  recordSyncResult,
  isSafeStorageAvailable
} from './syncStore'
import {
  fetchKeyEnvelope,
  putKeyEnvelope,
  wrapDbKey,
  unwrapDbKey,
  WrongPassphraseError,
  KEYENV_KEY
} from './keyEnvelope'
import { runMigrations } from '../../database/migrator'
import {
  getDatabase,
  getDbKeyFingerprint,
  getDbKeyHex,
  replaceDbKey,
  closeDatabase
} from '../../database/connection'
import { getCurrentSchemaVersion } from '../../database/migrator'
import { IPC_CHANNELS } from '../../../shared/ipc-channels'
import type {
  ConflictInfo,
  ConflictResolution,
  RemoteManifest,
  S3Config,
  SyncCloudInspect,
  SyncCursor,
  SyncRunResult,
  SyncStatus,
  SyncTestResult
} from '../../../shared/types'

const BACKUP_RETENTION = 7
const CAS_RETRY_LIMIT = 3

let currentStatus: SyncStatus = {
  phase: 'idle',
  message: '',
  lastSyncAt: null,
  lastSyncError: null
}

let isRunning = false
let pendingConflict: { info: ConflictInfo; client: S3Client; config: S3Config } | null = null

function setStatus(patch: Partial<SyncStatus>): void {
  currentStatus = { ...currentStatus, ...patch }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.SYNC_EVENT, currentStatus)
    }
  }
}

export function getStatus(): SyncStatus {
  const cfg = getSyncConfig()
  return {
    ...currentStatus,
    lastSyncAt: cfg.lastSyncAt,
    lastSyncError: cfg.lastSyncError
  }
}

export function isSyncRunning(): boolean {
  return isRunning
}

/**
 * Wait until any in-flight sync settles, up to timeoutMs.
 * Returns true if it became idle in time, false on timeout.
 */
export async function waitForSyncIdle(timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (isRunning && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 100))
  }
  return !isRunning
}

function ensureClient(): { client: S3Client; config: S3Config; creds: S3Credentials } {
  if (!isSafeStorageAvailable()) {
    throw new Error('SAFE_STORAGE_UNAVAILABLE')
  }
  const cfg = getSyncConfig()
  if (!cfg.s3.bucket || !cfg.s3.endpoint) {
    throw new Error('S3 配置不完整')
  }
  const creds = getDecryptedCredentials()
  if (!creds) {
    throw new Error('未配置 S3 凭证')
  }
  const client = createS3Client(cfg.s3, creds)
  return { client, config: cfg.s3, creds }
}

export async function testConnection(): Promise<SyncTestResult> {
  if (!isSafeStorageAvailable()) {
    return {
      ok: false,
      message: '操作系统密钥环不可用，无法安全保存凭证。请在 Linux 启用 keyring 后再试。',
      canRead: false,
      canWrite: false
    }
  }
  let client: S3Client
  let config: S3Config
  try {
    const ensured = ensureClient()
    client = ensured.client
    config = ensured.config
  } catch (e) {
    return {
      ok: false,
      message: (e as Error).message,
      canRead: false,
      canWrite: false
    }
  }

  let canRead = false
  let canWrite = false
  try {
    await listObjects(client, config, '')
    canRead = true
  } catch (e) {
    return {
      ok: false,
      message: `读取失败: ${(e as Error).message}`,
      canRead,
      canWrite
    }
  }

  const probeKey = `.moneta-probe-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
  try {
    const tmpFile = path.join(app.getPath('userData'), 'sync-tmp')
    if (!fs.existsSync(tmpFile)) fs.mkdirSync(tmpFile, { recursive: true })
    const tmpPath = path.join(tmpFile, 'probe.bin')
    fs.writeFileSync(tmpPath, 'moneta-probe')
    await uploadFile(client, config, probeKey, tmpPath, 'application/octet-stream')
    canWrite = true
    await deleteObject(client, config, probeKey).catch(() => undefined)
    fs.unlinkSync(tmpPath)
  } catch (e) {
    return {
      ok: false,
      message: `写入失败: ${(e as Error).message}`,
      canRead,
      canWrite
    }
  }

  return { ok: true, message: '连接成功', canRead, canWrite }
}

export async function syncNow(): Promise<SyncRunResult> {
  if (isRunning) {
    return { outcome: 'error', message: '已有同步任务在进行中', error: 'busy' }
  }
  if (pendingConflict) {
    return {
      outcome: 'conflict',
      message: '存在未处理的冲突',
      conflict: pendingConflict.info
    }
  }
  isRunning = true
  setStatus({ phase: 'preparing', message: '准备中…' })
  try {
    const result = await runSync()
    if (result.outcome === 'error') {
      recordSyncResult(false, result.error ?? result.message)
      setStatus({ phase: 'error', message: result.message })
    } else if (result.outcome === 'conflict') {
      setStatus({ phase: 'conflict', message: '检测到冲突，请选择处理方式' })
    } else if (
      result.outcome === 'needs-setup-initial' ||
      result.outcome === 'needs-setup-join'
    ) {
      setStatus({ phase: 'idle', message: result.message })
    } else {
      recordSyncResult(true)
      setStatus({ phase: 'success', message: result.message })
    }
    return result
  } catch (e) {
    const msg = (e as Error).message
    recordSyncResult(false, msg)
    setStatus({ phase: 'error', message: msg })
    return { outcome: 'error', message: msg, error: msg }
  } finally {
    isRunning = false
  }
}

async function runSync(): Promise<SyncRunResult> {
  const { client, config } = ensureClient()
  setStatus({ phase: 'fetching-manifest', message: '获取远端版本信息…' })
  const [remote, envelope] = await Promise.all([
    fetchManifest(client, config),
    fetchKeyEnvelope(client, config)
  ])
  const cfg = getSyncConfig()
  const cursor = cfg.cursor
  const localFp = getDbKeyFingerprint()

  // Cloud is empty — needs initial setup
  if (!remote && !envelope) {
    return {
      outcome: 'needs-setup-initial',
      message: '云端为空，请先设置同步口令'
    }
  }

  // Cloud has manifest but no envelope — corrupt state
  if (remote && !envelope) {
    return {
      outcome: 'error',
      message: '云端缺少密钥信封（keyenv.json），请重置云端后重新设置',
      error: 'missing-keyenv'
    }
  }

  // Cloud has envelope — verify local key matches
  if (envelope && envelope.body.keyFingerprint !== localFp) {
    return {
      outcome: 'needs-setup-join',
      message: '本地密钥与云端不匹配，请输入同步口令以加入云端'
    }
  }

  // Cloud has envelope but no manifest — initial upload (envelope was set up
  // earlier but db never uploaded). Proceed to upload.
  if (envelope && !remote) {
    return await uploadFlow(client, config, null, true)
  }

  // Both present and key matches — normal sync flow
  if (!remote) {
    // Should not happen, defensive
    return { outcome: 'error', message: '远端状态异常', error: 'inconsistent-state' }
  }

  // Schema version compatibility check
  const localSchema = getCurrentSchemaVersion(getDatabase())
  if (remote.body.schemaVersion > localSchema) {
    return {
      outcome: 'error',
      message: `远端数据使用了更新版本的应用（schema ${remote.body.schemaVersion}），请先升级 Moneta 后再同步`,
      error: 'schema-mismatch'
    }
  }

  const localHash = await liveDbSha256()
  const isLocalDirty = !cursor || cursor.localSha256 !== localHash

  // Branch B: same version on both ends
  if (cursor && remote.body.version === cursor.manifestVersion) {
    if (isLocalDirty) {
      return await uploadFlow(client, config, remote, false)
    }
    return { outcome: 'noop', message: '已是最新' }
  }

  // Branch C: remote is newer
  if (!cursor || remote.body.version > cursor.manifestVersion) {
    if (isLocalDirty) {
      const conflict: ConflictInfo = {
        localChangedAt: cfg.lastSyncAt,
        localSha256: localHash,
        remote: remote.body,
        remoteEtag: remote.etag
      }
      pendingConflict = { info: conflict, client, config }
      return { outcome: 'conflict', message: '检测到冲突', conflict }
    }
    return await downloadFlow(client, config, remote, localHash)
  }

  // Branch D: cursor ahead of remote — abnormal, refuse to clobber silently
  return {
    outcome: 'error',
    message: '远端版本异常（低于本地已同步版本），请检查 bucket 配置是否被更换',
    error: 'remote-rolled-back'
  }
}

async function uploadFlow(
  client: S3Client,
  config: S3Config,
  remote: { body: RemoteManifest; etag: string } | null,
  isInitial: boolean
): Promise<SyncRunResult> {
  setStatus({ phase: 'preparing', message: '打包数据库…' })
  const cfg = getSyncConfig()
  const pkg = await packageDatabase()
  const dbHash = await liveDbSha256()
  const schemaVersion = getCurrentSchemaVersion(getDatabase())

  try {
    setStatus({ phase: 'uploading', message: '上传数据库…' })
    await uploadFile(client, config, DB_OBJECT_KEY, pkg.filePath, 'application/gzip')

    // Archive the previous remote db (best effort, only when overwriting)
    if (!isInitial) {
      try {
        const ts = new Date().toISOString().replace(/[:.]/g, '-')
        const archiveKey = `backups/db-${ts}.sqlite.gz`
        await copyDbToBackup(client, config, archiveKey, pkg.filePath)
        await pruneBackups(client, config)
      } catch (e) {
        console.warn('[sync] backup archive failed (non-fatal):', e)
      }
    }

    setStatus({ phase: 'finalizing', message: '更新版本信息…' })
    const manifest = buildManifest({
      previousVersion: remote?.body.version ?? 0,
      deviceId: cfg.deviceId,
      schemaVersion,
      size: pkg.size,
      sha256: pkg.sha256,
      keyFingerprint: getDbKeyFingerprint()
    })

    let attempt = 0
    let etag = ''
    let manifestEtag = remote?.etag
    let manifestVersion = manifest.version
    while (true) {
      try {
        const res = await commitManifest(client, config, manifest, manifestEtag)
        etag = res.etag
        break
      } catch (e) {
        if (e instanceof PreconditionFailedError && attempt < CAS_RETRY_LIMIT) {
          attempt++
          // Re-fetch manifest, recompute version
          const fresh = await fetchManifest(client, config)
          if (!fresh) {
            // Object disappeared — try once more as initial create
            manifestEtag = undefined
            continue
          }
          manifest.version = fresh.body.version + 1
          manifestVersion = manifest.version
          manifestEtag = fresh.etag
          continue
        }
        throw e
      }
    }

    const cursor: SyncCursor = {
      manifestVersion,
      manifestEtag: etag,
      localSha256: dbHash,
      syncedAt: new Date().toISOString()
    }
    setCursor(cursor)
    return {
      outcome: isInitial ? 'initial-uploaded' : 'uploaded',
      message: isInitial ? '已首次上传到云端' : '已上传到云端'
    }
  } finally {
    cleanupTmp(pkg.filePath)
  }
}

async function downloadFlow(
  client: S3Client,
  config: S3Config,
  remote: { body: RemoteManifest; etag: string },
  preLocalHash: string
): Promise<SyncRunResult> {
  setStatus({ phase: 'downloading', message: '下载数据库…' })
  const tmpDir = path.join(app.getPath('userData'), 'sync-tmp')
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
  const tmpGz = path.join(tmpDir, `download-${Date.now()}.sqlite.gz`)

  try {
    await downloadFile(client, config, DB_OBJECT_KEY, tmpGz)
    const stat = fs.statSync(tmpGz)
    if (stat.size !== remote.body.size) {
      throw new Error(`文件大小不匹配（预期 ${remote.body.size}，实际 ${stat.size}）`)
    }
    const downloadedHash = await sha256OfFile(tmpGz)
    if (downloadedHash !== remote.body.sha256) {
      throw new Error('下载文件校验失败（sha256 不匹配）')
    }
    setStatus({ phase: 'finalizing', message: '替换本地数据库…' })
    await installDatabase(tmpGz)

    // Reopen DB so subsequent reads work
    getDatabase()
    const newLocalHash = await liveDbSha256()

    const cursor: SyncCursor = {
      manifestVersion: remote.body.version,
      manifestEtag: remote.etag,
      localSha256: newLocalHash,
      syncedAt: new Date().toISOString()
    }
    setCursor(cursor)
    return {
      outcome: 'downloaded',
      message: `已从云端拉取（v${remote.body.version}）`
    }
  } catch (e) {
    return {
      outcome: 'error',
      message: `下载失败: ${(e as Error).message}（本地数据未变更，原 sha256: ${preLocalHash.slice(0, 8)}…）`,
      error: (e as Error).message
    }
  } finally {
    cleanupTmp(tmpGz)
  }
}

export async function resolveConflict(resolution: ConflictResolution): Promise<SyncRunResult> {
  if (!pendingConflict) {
    return { outcome: 'noop', message: '无待处理冲突' }
  }
  const { client, config, info } = pendingConflict
  pendingConflict = null

  if (resolution === 'cancel') {
    setStatus({ phase: 'idle', message: '已取消' })
    return { outcome: 'aborted', message: '已取消' }
  }

  isRunning = true
  try {
    if (resolution === 'use-remote') {
      // Verify key fingerprint
      if (info.remote.keyFingerprint && info.remote.keyFingerprint !== getDbKeyFingerprint()) {
        const msg = '远端使用了不同的 PIN/加密密钥，无法覆盖本地'
        setStatus({ phase: 'error', message: msg })
        return { outcome: 'error', message: msg, error: 'key-mismatch' }
      }
      const result = await downloadFlow(client, config, { body: info.remote, etag: info.remoteEtag }, info.localSha256)
      if (result.outcome === 'downloaded') {
        recordSyncResult(true)
        setStatus({ phase: 'success', message: result.message })
      } else {
        recordSyncResult(false, result.error ?? result.message)
        setStatus({ phase: 'error', message: result.message })
      }
      return result
    }
    // use-local
    const result = await uploadFlow(client, config, { body: info.remote, etag: info.remoteEtag }, false)
    if (result.outcome === 'uploaded' || result.outcome === 'initial-uploaded') {
      recordSyncResult(true)
      setStatus({ phase: 'success', message: result.message })
    } else {
      recordSyncResult(false, result.error ?? result.message)
      setStatus({ phase: 'error', message: result.message })
    }
    return result
  } catch (e) {
    const msg = (e as Error).message
    recordSyncResult(false, msg)
    setStatus({ phase: 'error', message: msg })
    return { outcome: 'error', message: msg, error: msg }
  } finally {
    isRunning = false
  }
}

async function copyDbToBackup(
  client: S3Client,
  config: S3Config,
  archiveKey: string,
  localGzPath: string
): Promise<void> {
  // Re-upload the same packaged file to a backup key
  await uploadFile(client, config, archiveKey, localGzPath, 'application/gzip')
}

async function pruneBackups(client: S3Client, config: S3Config): Promise<void> {
  const items = await listObjects(client, config, 'backups/')
  const sorted = items
    .filter((it) => it.key.endsWith('.sqlite.gz'))
    .sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0))
  const toDelete = sorted.slice(BACKUP_RETENTION)
  for (const item of toDelete) {
    try {
      await deleteObject(client, config, item.key)
    } catch (e) {
      console.warn('[sync] failed to delete old backup', item.key, e)
    }
  }
}

async function sha256OfFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (c) => hash.update(c))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

// Suppress lint warnings for headObject (kept for future use)
void headObject

export async function inspectCloud(): Promise<SyncCloudInspect> {
  const { client, config } = ensureClient()
  const [remote, envelope] = await Promise.all([
    fetchManifest(client, config),
    fetchKeyEnvelope(client, config)
  ])
  const localFp = getDbKeyFingerprint()
  const envelopeFp = envelope?.body.keyFingerprint ?? null
  return {
    hasManifest: !!remote,
    hasKeyEnvelope: !!envelope,
    envelopeFingerprint: envelopeFp,
    localFingerprint: localFp,
    fingerprintMatches: !!envelope && envelope.body.keyFingerprint === localFp,
    remoteVersion: remote?.body.version ?? null,
    remoteWriterDeviceId: remote?.body.writerDeviceId ?? null,
    remoteWrittenAt: remote?.body.writtenAt ?? null,
    envelopeCreatedAt: envelope?.body.createdAt ?? null
  }
}

export async function setupInitial(passphrase: string): Promise<SyncRunResult> {
  if (isRunning) return { outcome: 'error', message: '已有同步任务在进行中', error: 'busy' }
  isRunning = true
  setStatus({ phase: 'preparing', message: '准备首次设置…' })
  try {
    const { client, config } = ensureClient()
    const existing = await fetchKeyEnvelope(client, config)
    if (existing) {
      // Cloud already has an envelope — refuse to overwrite silently
      return {
        outcome: 'error',
        message: '云端已存在密钥信封，如需重置请先点击「重置云端」',
        error: 'envelope-exists'
      }
    }

    const localKey = getDbKeyHex()
    const envelope = wrapDbKey(localKey, passphrase)
    await putKeyEnvelope(client, config, envelope)

    // Now run normal upload flow (initial)
    const result = await uploadFlow(client, config, null, true)
    if (result.outcome === 'initial-uploaded') {
      recordSyncResult(true)
      setStatus({ phase: 'success', message: '首次设置完成，已上传到云端' })
    } else if (result.outcome === 'error') {
      recordSyncResult(false, result.error ?? result.message)
      setStatus({ phase: 'error', message: result.message })
    }
    return result
  } catch (e) {
    const msg = (e as Error).message
    recordSyncResult(false, msg)
    setStatus({ phase: 'error', message: msg })
    return { outcome: 'error', message: msg, error: msg }
  } finally {
    isRunning = false
  }
}

export async function setupJoin(passphrase: string): Promise<SyncRunResult> {
  if (isRunning) return { outcome: 'error', message: '已有同步任务在进行中', error: 'busy' }
  isRunning = true
  setStatus({ phase: 'preparing', message: '加入云端同步…' })
  const dbPath = getDbPath()
  const oldKey = getDbKeyHex()
  let backedUpDb = false
  const backupPath = `${dbPath}.sync.preinstall.bak`

  try {
    const { client, config } = ensureClient()
    const envelope = await fetchKeyEnvelope(client, config)
    if (!envelope) {
      return {
        outcome: 'error',
        message: '云端没有密钥信封，请改用「首次设置」',
        error: 'no-envelope'
      }
    }

    // Unwrap with passphrase
    let newKey: string
    try {
      newKey = unwrapDbKey(envelope.body, passphrase)
    } catch (e) {
      if (e instanceof WrongPassphraseError) {
        return { outcome: 'error', message: '同步口令错误', error: 'wrong-passphrase' }
      }
      throw e
    }

    // Need to fetch remote db; if no manifest, we just install a fresh empty
    // local db using the new key (so subsequent local writes are encrypted with new key).
    const remote = await fetchManifest(client, config)

    if (remote) {
      // Schema check
      const localSchema = getCurrentSchemaVersion(getDatabase())
      if (remote.body.schemaVersion > localSchema) {
        return {
          outcome: 'error',
          message: `远端数据使用了更新版本的应用（schema ${remote.body.schemaVersion}），请先升级 Moneta 后再同步`,
          error: 'schema-mismatch'
        }
      }

      setStatus({ phase: 'downloading', message: '下载远端数据库…' })
      const tmpGz = path.join(app.getPath('userData'), 'sync-tmp', `join-${Date.now()}.sqlite.gz`)
      const tmpDir = path.dirname(tmpGz)
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

      try {
        await downloadFile(client, config, DB_OBJECT_KEY, tmpGz)
        const stat = fs.statSync(tmpGz)
        if (stat.size !== remote.body.size) {
          throw new Error(`文件大小不匹配（预期 ${remote.body.size}，实际 ${stat.size}）`)
        }
        const downloadedHash = await sha256OfFile(tmpGz)
        if (downloadedHash !== remote.body.sha256) {
          throw new Error('下载文件校验失败（sha256 不匹配）')
        }

        // Backup local db
        closeDatabase()
        if (fs.existsSync(dbPath)) {
          fs.renameSync(dbPath, backupPath)
          backedUpDb = true
        }
        for (const f of [`${dbPath}-wal`, `${dbPath}-shm`]) {
          if (fs.existsSync(f)) fs.unlinkSync(f)
        }

        setStatus({ phase: 'finalizing', message: '替换本地密钥与数据库…' })
        replaceDbKey(newKey)
        await installDatabase(tmpGz)

        // Reopen with new key (getDatabase uses config which now has new key)
        const db = getDatabase()
        runMigrations(db)
        const newLocalHash = await liveDbSha256()

        const cursor: SyncCursor = {
          manifestVersion: remote.body.version,
          manifestEtag: remote.etag,
          localSha256: newLocalHash,
          syncedAt: new Date().toISOString()
        }
        setCursor(cursor)
        recordSyncResult(true)
        setStatus({ phase: 'success', message: `已加入云端（v${remote.body.version}）` })

        if (backedUpDb && fs.existsSync(backupPath)) fs.unlinkSync(backupPath)
        cleanupTmp(tmpGz)
        return { outcome: 'downloaded', message: `已加入云端（v${remote.body.version}）` }
      } catch (e) {
        // Roll back: restore old key + old db
        try {
          replaceDbKey(oldKey)
          if (backedUpDb && fs.existsSync(backupPath)) {
            if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
            fs.renameSync(backupPath, dbPath)
          }
          getDatabase()
        } catch (rollbackErr) {
          console.error('[sync] rollback failed:', rollbackErr)
        }
        cleanupTmp(tmpGz)
        const msg = (e as Error).message
        recordSyncResult(false, msg)
        setStatus({ phase: 'error', message: msg })
        return { outcome: 'error', message: `加入失败: ${msg}`, error: msg }
      }
    }

    // No remote db yet — just adopt the new key. Wipe local db so future
    // operations use the new key from scratch.
    closeDatabase()
    for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      if (fs.existsSync(f)) fs.unlinkSync(f)
    }
    replaceDbKey(newKey)
    const db = getDatabase()
    runMigrations(db)
    setCursor(null)
    recordSyncResult(true)
    setStatus({ phase: 'success', message: '已加入云端，等待数据同步' })
    return { outcome: 'downloaded', message: '已加入云端（云端尚无数据）' }
  } catch (e) {
    const msg = (e as Error).message
    recordSyncResult(false, msg)
    setStatus({ phase: 'error', message: msg })
    return { outcome: 'error', message: msg, error: msg }
  } finally {
    isRunning = false
  }
}

/**
 * "Use local" branch of join setup: take this device's local SQLCipher key as
 * the source of truth. Replace the cloud's keyenv + manifest + db.sqlite.gz
 * (existing remote data is wiped — caller has confirmed via UI).
 */
export async function setupAdoptLocal(passphrase: string): Promise<SyncRunResult> {
  if (isRunning) return { outcome: 'error', message: '已有同步任务在进行中', error: 'busy' }
  if (!passphrase || passphrase.length < 8) {
    return { outcome: 'error', message: 'PASSPHRASE_TOO_SHORT', error: 'PASSPHRASE_TOO_SHORT' }
  }
  isRunning = true
  setStatus({ phase: 'preparing', message: '替换云端数据为本机数据…' })
  try {
    const { client, config } = ensureClient()

    // Wrap local key with new passphrase
    const localKey = getDbKeyHex()
    const envelope = wrapDbKey(localKey, passphrase)

    // Wipe existing keyenv + manifest (best effort) so uploadFlow restarts at v1
    await deleteObject(client, config, KEYENV_KEY).catch(() => undefined)
    await deleteObject(client, config, 'manifest.json').catch(() => undefined)

    // Upload new envelope
    await putKeyEnvelope(client, config, envelope)

    // Upload db + new manifest as initial
    const result = await uploadFlow(client, config, null, true)

    if (result.outcome === 'initial-uploaded') {
      recordSyncResult(true)
      setStatus({ phase: 'success', message: '已用本机数据替换云端' })
      return {
        outcome: 'uploaded',
        message: '已用本机数据替换云端，云端版本重置为 v1'
      }
    }
    if (result.outcome === 'error') {
      recordSyncResult(false, result.error ?? result.message)
      setStatus({ phase: 'error', message: result.message })
    }
    return result
  } catch (e) {
    const msg = (e as Error).message
    recordSyncResult(false, msg)
    setStatus({ phase: 'error', message: msg })
    return { outcome: 'error', message: msg, error: msg }
  } finally {
    isRunning = false
  }
}

export async function changePassphrase(
  oldPassphrase: string,
  newPassphrase: string
): Promise<{ ok: boolean; message: string; error?: string }> {
  if (!newPassphrase || newPassphrase.length < 8) {
    return { ok: false, message: '新口令至少需要 8 位', error: 'PASSPHRASE_TOO_SHORT' }
  }
  if (oldPassphrase === newPassphrase) {
    return { ok: false, message: '新口令与旧口令相同', error: 'SAME_PASSPHRASE' }
  }
  if (isRunning) return { ok: false, message: '已有同步任务在进行中', error: 'busy' }
  isRunning = true
  setStatus({ phase: 'preparing', message: '修改同步口令…' })
  try {
    const { client, config } = ensureClient()

    const envelope = await fetchKeyEnvelope(client, config)
    if (!envelope) {
      return { ok: false, message: '云端没有密钥信封，无法修改口令', error: 'no-envelope' }
    }

    if (envelope.body.keyFingerprint !== getDbKeyFingerprint()) {
      return {
        ok: false,
        message: '本机尚未加入云端，请先完成「加入云端」再修改口令',
        error: 'not-joined'
      }
    }

    let hexKey: string
    try {
      hexKey = unwrapDbKey(envelope.body, oldPassphrase)
    } catch (e) {
      if (e instanceof WrongPassphraseError) {
        return { ok: false, message: '旧口令错误', error: 'wrong-passphrase' }
      }
      throw e
    }

    const newEnvelope = wrapDbKey(hexKey, newPassphrase)
    await deleteObject(client, config, KEYENV_KEY).catch(() => undefined)
    await putKeyEnvelope(client, config, newEnvelope)

    setStatus({ phase: 'success', message: '同步口令已修改' })
    return { ok: true, message: '同步口令已修改' }
  } catch (e) {
    const msg = (e as Error).message
    setStatus({ phase: 'error', message: msg })
    return { ok: false, message: msg, error: msg }
  } finally {
    isRunning = false
  }
}

export async function resetCloud(): Promise<{ ok: boolean; message: string }> {
  if (isRunning) return { ok: false, message: '已有同步任务在进行中' }
  isRunning = true
  setStatus({ phase: 'preparing', message: '清理云端数据…' })
  try {
    const { client, config } = ensureClient()
    const items = await listObjects(client, config, '')
    for (const it of items) {
      try {
        await deleteObject(client, config, it.key)
      } catch (e) {
        console.warn('[sync] failed to delete', it.key, e)
      }
    }
    setCursor(null)
    setStatus({ phase: 'idle', message: '云端已清理' })
    return { ok: true, message: '云端数据已清理' }
  } catch (e) {
    const msg = (e as Error).message
    setStatus({ phase: 'error', message: msg })
    return { ok: false, message: msg }
  } finally {
    isRunning = false
  }
}
