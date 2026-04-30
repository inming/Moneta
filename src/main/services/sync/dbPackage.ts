import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { app } from 'electron'
import { pipeline } from 'stream/promises'
import { DB_NAME } from '../../../shared/constants/config'
import { closeDatabase, getDatabase } from '../../database/connection'

export interface PackagedDb {
  filePath: string
  size: number
  sha256: string
}

export function getDbPath(): string {
  return path.join(app.getPath('userData'), DB_NAME)
}

function getTmpDir(): string {
  const dir = path.join(app.getPath('userData'), 'sync-tmp')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Quiesce DB writes via WAL checkpoint, then gzip the main db file into a tmp path.
 * Returns the tmp gz file path along with size + sha256 for manifest.
 */
export async function packageDatabase(): Promise<PackagedDb> {
  const db = getDatabase()
  db.pragma('wal_checkpoint(TRUNCATE)')

  const dbPath = getDbPath()
  if (!fs.existsSync(dbPath)) {
    throw new Error(`数据库文件不存在: ${dbPath}`)
  }

  const tmpGz = path.join(getTmpDir(), `upload-${Date.now()}.sqlite.gz`)
  await pipeline(
    fs.createReadStream(dbPath),
    zlib.createGzip({ level: zlib.constants.Z_BEST_SPEED }),
    fs.createWriteStream(tmpGz)
  )

  const stat = fs.statSync(tmpGz)
  const sha256 = await sha256File(tmpGz)
  return { filePath: tmpGz, size: stat.size, sha256 }
}

/**
 * Compute sha256 of the live db file (without packaging) to detect dirty state cheaply.
 * Note: callers should run wal_checkpoint first if accuracy matters across processes;
 * here we rely on better-sqlite3 single-process WAL semantics.
 */
export async function liveDbSha256(): Promise<string> {
  const db = getDatabase()
  db.pragma('wal_checkpoint(TRUNCATE)')
  return sha256File(getDbPath())
}

/**
 * Fingerprint of the SQLCipher key as a way to detect cross-PIN remote.
 * We use SHA-256 of the hex key string. Only the fingerprint travels in manifest.
 */
export function keyFingerprint(hexKey: string): string {
  return crypto.createHash('sha256').update(hexKey).digest('hex').slice(0, 32)
}

/**
 * Replace the local db file with a downloaded gz file.
 * Caller must have already verified sha256 of the gz file matches manifest.
 * On any error, restores the previous db.
 */
export async function installDatabase(downloadedGzPath: string): Promise<void> {
  const dbPath = getDbPath()
  const walPath = `${dbPath}-wal`
  const shmPath = `${dbPath}-shm`
  const backupPath = `${dbPath}.sync.bak`

  closeDatabase()

  // Backup current files
  for (const f of [walPath, shmPath]) {
    if (fs.existsSync(f)) fs.unlinkSync(f)
  }
  if (fs.existsSync(dbPath)) {
    fs.renameSync(dbPath, backupPath)
  }

  try {
    await pipeline(
      fs.createReadStream(downloadedGzPath),
      zlib.createGunzip(),
      fs.createWriteStream(dbPath)
    )
    // Try opening to validate (caller will reopen via getDatabase())
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath)
  } catch (e) {
    // Roll back
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
    if (fs.existsSync(backupPath)) fs.renameSync(backupPath, dbPath)
    throw e
  }
}

export function cleanupTmp(filePath: string): void {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    // ignore
  }
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}
