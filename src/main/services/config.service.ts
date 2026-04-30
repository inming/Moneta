import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { CONFIG_NAME } from '../../shared/constants/config'
import type { ThemeMode } from '../../shared/types'

interface StoredSyncConfig {
  enabled: boolean
  provider: 'aws' | 'aliyun' | 'custom'
  endpoint: string
  region: string
  bucket: string
  prefix: string
  pathStyle: boolean
  s3AccessKeyEncrypted: string
  s3SecretKeyEncrypted: string
  deviceId: string
  cursor: {
    manifestVersion: number
    manifestEtag: string
    localSha256: string
    syncedAt: string
  } | null
  lastSyncAt: string | null
  lastSyncError: string | null
  autoSyncIntervalMinutes?: number
}

interface AppConfig {
  pinEncrypted: string
  pinFailCount: number
  pinLockedUntil: string
  autoLockMinutes: number
  language?: string
  dbKeyEncrypted?: string
  dbMigrationState?: 'pending' | 'done'
  theme?: 'system' | 'light' | 'dark'
  sync?: StoredSyncConfig
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_NAME)
}

export function encryptString(plain: string): string {
  if (!plain) return ''
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(plain)
    return encrypted.toString('base64')
  }
  console.warn('[config] safeStorage encryption not available, storing as base64 only')
  return Buffer.from(plain).toString('base64')
}

export function decryptString(encrypted: string): string {
  if (!encrypted) return ''
  if (safeStorage.isEncryptionAvailable()) {
    const buffer = Buffer.from(encrypted, 'base64')
    try {
      return safeStorage.decryptString(buffer)
    } catch {
      // Legacy fallback: value was stored as plain base64 when safeStorage
      // was unavailable on a previous launch. Decode and let migration re-wrap.
      return Buffer.from(encrypted, 'base64').toString()
    }
  }
  return Buffer.from(encrypted, 'base64').toString()
}

function detectSystemLanguage(): string {
  const locale = app.getLocale().toLowerCase()

  // 所有中文变体（zh、zh-CN、zh-TW、zh-Hans、zh-Hant）默认简体中文
  if (locale.startsWith('zh')) {
    return 'zh-CN'
  }

  // 所有英文变体默认美式英文
  if (locale.startsWith('en')) {
    return 'en-US'
  }

  // 其他语言默认英文
  return 'en-US'
}

function createDefaultConfig(): AppConfig {
  return {
    pinEncrypted: '',
    pinFailCount: 0,
    pinLockedUntil: '',
    autoLockMinutes: 30,
    language: detectSystemLanguage(),
    theme: 'system'
  }
}

export function loadConfig(): AppConfig {
  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) {
    const config = createDefaultConfig()
    saveConfig(config)
    return config
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    const config: AppConfig = JSON.parse(raw)

    // Forward-compatibility: ensure PIN fields exist (for upgrades from older versions)
    if (config.pinEncrypted === undefined) config.pinEncrypted = ''
    if (config.pinFailCount === undefined) config.pinFailCount = 0
    if (config.pinLockedUntil === undefined) config.pinLockedUntil = ''
    if (config.autoLockMinutes === undefined) config.autoLockMinutes = 30
    if (config.language === undefined) config.language = detectSystemLanguage()

    // Forward-compatibility: database encryption fields
    if (config.dbKeyEncrypted === undefined) config.dbKeyEncrypted = ''

    // Forward-compatibility: theme setting
    if (config.theme === undefined) config.theme = 'system'

    saveConfig(config)
    return config
  } catch {
    const config = createDefaultConfig()
    saveConfig(config)
    return config
  }
}

export function saveConfig(config: AppConfig): void {
  const configPath = getConfigPath()
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * One-shot migration: re-wrap any secrets that were stored as plain base64
 * (when safeStorage was unavailable on a previous launch) using safeStorage now
 * that it is available. Idempotent — only re-encrypts entries that fail
 * safeStorage.decryptString.
 */
export function migrateLegacyEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) return

  const isLegacy = (encrypted: string): boolean => {
    if (!encrypted) return false
    try {
      safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      return false
    } catch {
      return true
    }
  }
  const reencrypt = (encrypted: string): string => {
    const plain = Buffer.from(encrypted, 'base64').toString()
    return safeStorage.encryptString(plain).toString('base64')
  }

  const config = loadConfig()
  let changed = 0

  if (config.dbKeyEncrypted && isLegacy(config.dbKeyEncrypted)) {
    config.dbKeyEncrypted = reencrypt(config.dbKeyEncrypted)
    changed++
  }
  if (config.pinEncrypted && isLegacy(config.pinEncrypted)) {
    config.pinEncrypted = reencrypt(config.pinEncrypted)
    changed++
  }
  if (config.sync) {
    if (config.sync.s3AccessKeyEncrypted && isLegacy(config.sync.s3AccessKeyEncrypted)) {
      config.sync.s3AccessKeyEncrypted = reencrypt(config.sync.s3AccessKeyEncrypted)
      changed++
    }
    if (config.sync.s3SecretKeyEncrypted && isLegacy(config.sync.s3SecretKeyEncrypted)) {
      config.sync.s3SecretKeyEncrypted = reencrypt(config.sync.s3SecretKeyEncrypted)
      changed++
    }
  }

  if (changed > 0) {
    saveConfig(config)
    console.log(`[config] migrated ${changed} legacy plaintext-base64 secret(s) to safeStorage`)
  }
}

export function getTheme(): ThemeMode {
  const config = loadConfig()
  return config.theme ?? 'system'
}

export function setTheme(theme: ThemeMode): void {
  const config = loadConfig()
  config.theme = theme
  saveConfig(config)
}
