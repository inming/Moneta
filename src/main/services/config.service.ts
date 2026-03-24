import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { CONFIG_NAME } from '../../shared/constants/config'
import type {
  AIProviderConfig,
  AIProviderView,
  AIProviderFormat,
  UpdateAIProviderDTO
} from '../../shared/types'

interface StoredProvider {
  id: string
  name: string
  format: AIProviderFormat
  endpoint: string
  apiKeyEncrypted: string
  model: string
}

interface AppConfig {
  aiProviders: StoredProvider[]
  defaultProviderId: string
  pinEncrypted: string
  pinFailCount: number
  pinLockedUntil: string
  autoLockMinutes: number
  language?: string
}

/** 内置模型列表，后续新增模型只需往这里加一项 */
const BUILTIN_MODELS: Omit<StoredProvider, 'apiKeyEncrypted'>[] = [
  {
    id: 'glm-4.5v',
    name: 'GLM-4.5V',
    format: 'openai',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4.5v'
  },
  {
    id: 'doubao-seed-2-0',
    name: 'Doubao Seed 2.0',
    format: 'openai',
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3',
    model: ''
  }
]

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
    return safeStorage.decryptString(buffer)
  }
  return Buffer.from(encrypted, 'base64').toString()
}

function encryptApiKey(plainKey: string): string {
  if (!plainKey) return ''
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(plainKey)
    return encrypted.toString('base64')
  }
  console.warn('[config] safeStorage encryption not available, storing API key as base64 only')
  return Buffer.from(plainKey).toString('base64')
}

function decryptApiKey(encryptedKey: string): string {
  if (!encryptedKey) return ''
  if (safeStorage.isEncryptionAvailable()) {
    const buffer = Buffer.from(encryptedKey, 'base64')
    return safeStorage.decryptString(buffer)
  }
  return Buffer.from(encryptedKey, 'base64').toString()
}

export function maskApiKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '****'
  const prefix = key.slice(0, 3)
  const suffix = key.slice(-4)
  return `${prefix}****${suffix}`
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
    aiProviders: BUILTIN_MODELS.map((m) => ({ ...m, apiKeyEncrypted: '' })),
    defaultProviderId: BUILTIN_MODELS.length === 1 ? BUILTIN_MODELS[0].id : '',
    pinEncrypted: '',
    pinFailCount: 0,
    pinLockedUntil: '',
    autoLockMinutes: 30,
    language: detectSystemLanguage()
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

    const builtinIds = new Set(BUILTIN_MODELS.map((m) => m.id))

    // Ensure all built-in models exist (app updates may add new models)
    for (const model of BUILTIN_MODELS) {
      const existing = config.aiProviders.find((p) => p.id === model.id)
      if (!existing) {
        config.aiProviders.push({ ...model, apiKeyEncrypted: '' })
      } else {
        // Sync only name and format from built-in definition
        // Keep user's endpoint, model, and apiKey (all user-editable)
        existing.name = model.name
        existing.format = model.format
      }
    }

    // Remove providers that are no longer in the built-in list (cleanup from old versions)
    config.aiProviders = config.aiProviders.filter((p) => builtinIds.has(p.id))

    // Forward-compatibility: ensure PIN fields exist (for upgrades from older versions)
    if (config.pinEncrypted === undefined) config.pinEncrypted = ''
    if (config.pinFailCount === undefined) config.pinFailCount = 0
    if (config.pinLockedUntil === undefined) config.pinLockedUntil = ''
    if (config.autoLockMinutes === undefined) config.autoLockMinutes = 30
    if (config.language === undefined) config.language = detectSystemLanguage()

    // Validate default provider
    if (!config.defaultProviderId || !config.aiProviders.find((p) => p.id === config.defaultProviderId)) {
      config.defaultProviderId = BUILTIN_MODELS.length === 1 ? BUILTIN_MODELS[0].id : ''
    }

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

function toView(stored: StoredProvider, defaultProviderId: string): AIProviderView {
  const decryptedKey = decryptApiKey(stored.apiKeyEncrypted)
  return {
    id: stored.id,
    name: stored.name,
    format: stored.format,
    endpoint: stored.endpoint,
    apiKeyMasked: maskApiKey(decryptedKey),
    model: stored.model,
    isDefault: stored.id === defaultProviderId
  }
}

export function getProviders(): AIProviderView[] {
  const config = loadConfig()
  return config.aiProviders.map((p) => toView(p, config.defaultProviderId))
}

export function getProviderDecrypted(id: string): AIProviderConfig {
  const config = loadConfig()
  const stored = config.aiProviders.find((p) => p.id === id)
  if (!stored) {
    throw new Error(`模型不存在: ${id}`)
  }
  return {
    id: stored.id,
    name: stored.name,
    format: stored.format,
    endpoint: stored.endpoint,
    apiKey: decryptApiKey(stored.apiKeyEncrypted),
    model: stored.model,
    isDefault: stored.id === config.defaultProviderId
  }
}

export function updateProvider(id: string, dto: UpdateAIProviderDTO): AIProviderView {
  const config = loadConfig()
  const stored = config.aiProviders.find((p) => p.id === id)
  if (!stored) {
    throw new Error(`模型不存在: ${id}`)
  }
  if (dto.endpoint !== undefined) stored.endpoint = dto.endpoint
  if (dto.model !== undefined) stored.model = dto.model
  if (dto.apiKey !== undefined) {
    stored.apiKeyEncrypted = encryptApiKey(dto.apiKey)
  }
  saveConfig(config)
  return toView(stored, config.defaultProviderId)
}

export function setDefaultProvider(id: string): void {
  const config = loadConfig()
  const provider = config.aiProviders.find((p) => p.id === id)
  if (!provider) {
    throw new Error(`模型不存在: ${id}`)
  }
  config.defaultProviderId = id
  saveConfig(config)
}
