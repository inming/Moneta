import crypto from 'crypto'
import { safeStorage } from 'electron'
import { loadConfig, saveConfig } from '../config.service'
import type {
  S3Provider,
  SyncConfig,
  SyncCursor,
  SaveSyncConfigDTO
} from '../../../shared/types'

const ENDPOINT_PRESETS: Record<S3Provider, { endpoint: string; region: string; pathStyle: boolean }> = {
  aws: { endpoint: 'https://s3.amazonaws.com', region: 'us-east-1', pathStyle: false },
  aliyun: { endpoint: 'https://oss-cn-hangzhou.aliyuncs.com', region: 'oss-cn-hangzhou', pathStyle: false },
  custom: { endpoint: '', region: 'us-east-1', pathStyle: true }
}

function defaultDeviceId(): string {
  return `dev-${crypto.randomBytes(6).toString('hex')}`
}

function getOrInitSyncBlock(): NonNullable<ReturnType<typeof loadConfig>['sync']> {
  const config = loadConfig()
  if (!config.sync) {
    const preset = ENDPOINT_PRESETS.aws
    config.sync = {
      enabled: false,
      provider: 'aws',
      endpoint: preset.endpoint,
      region: preset.region,
      bucket: '',
      prefix: 'moneta/',
      pathStyle: preset.pathStyle,
      s3AccessKeyEncrypted: '',
      s3SecretKeyEncrypted: '',
      deviceId: defaultDeviceId(),
      cursor: null,
      lastSyncAt: null,
      lastSyncError: null
    }
    saveConfig(config)
  }
  return config.sync
}

export function getSyncConfig(): SyncConfig {
  const stored = getOrInitSyncBlock()
  return {
    enabled: stored.enabled,
    s3: {
      provider: stored.provider,
      endpoint: stored.endpoint,
      region: stored.region,
      bucket: stored.bucket,
      prefix: stored.prefix,
      pathStyle: stored.pathStyle
    },
    hasCredentials: Boolean(stored.s3AccessKeyEncrypted && stored.s3SecretKeyEncrypted),
    deviceId: stored.deviceId,
    cursor: stored.cursor,
    lastSyncAt: stored.lastSyncAt,
    lastSyncError: stored.lastSyncError
  }
}

export function saveSyncConfig(dto: SaveSyncConfigDTO): SyncConfig {
  const config = loadConfig()
  const sync = getOrInitSyncBlock()
  sync.provider = dto.provider
  sync.endpoint = dto.endpoint.trim()
  sync.region = dto.region.trim()
  sync.bucket = dto.bucket.trim()
  sync.prefix = normalizePrefix(dto.prefix)
  sync.pathStyle = dto.pathStyle
  sync.enabled = Boolean(sync.bucket && sync.endpoint)
  config.sync = sync
  saveConfig(config)
  return getSyncConfig()
}

function normalizePrefix(prefix: string): string {
  let p = (prefix || '').trim().replace(/^\/+/, '')
  if (p && !p.endsWith('/')) p += '/'
  return p
}

export function setCredentials(accessKeyId: string, secretAccessKey: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('SAFE_STORAGE_UNAVAILABLE')
  }
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('凭证不能为空')
  }
  const config = loadConfig()
  const sync = getOrInitSyncBlock()
  sync.s3AccessKeyEncrypted = safeStorage.encryptString(accessKeyId).toString('base64')
  sync.s3SecretKeyEncrypted = safeStorage.encryptString(secretAccessKey).toString('base64')
  config.sync = sync
  saveConfig(config)
}

export function clearCredentials(): void {
  const config = loadConfig()
  const sync = getOrInitSyncBlock()
  sync.s3AccessKeyEncrypted = ''
  sync.s3SecretKeyEncrypted = ''
  config.sync = sync
  saveConfig(config)
}

export function getDecryptedCredentials(): { accessKeyId: string; secretAccessKey: string } | null {
  const sync = getOrInitSyncBlock()
  if (!sync.s3AccessKeyEncrypted || !sync.s3SecretKeyEncrypted) return null
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('SAFE_STORAGE_UNAVAILABLE')
  }
  try {
    return {
      accessKeyId: safeStorage.decryptString(Buffer.from(sync.s3AccessKeyEncrypted, 'base64')),
      secretAccessKey: safeStorage.decryptString(Buffer.from(sync.s3SecretKeyEncrypted, 'base64'))
    }
  } catch {
    return null
  }
}

export function setCursor(cursor: SyncCursor | null): void {
  const config = loadConfig()
  const sync = getOrInitSyncBlock()
  sync.cursor = cursor
  config.sync = sync
  saveConfig(config)
}

export function recordSyncResult(success: boolean, error?: string): void {
  const config = loadConfig()
  const sync = getOrInitSyncBlock()
  sync.lastSyncAt = new Date().toISOString()
  sync.lastSyncError = success ? null : (error ?? 'unknown')
  config.sync = sync
  saveConfig(config)
}

export function isSafeStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export { ENDPOINT_PRESETS }
