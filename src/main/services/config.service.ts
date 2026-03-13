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
}

/** 内置模型列表，后续新增模型只需往这里加一项 */
const BUILTIN_MODELS: Omit<StoredProvider, 'apiKeyEncrypted'>[] = [
  {
    id: 'glm-4.5v',
    name: 'GLM-4.5V',
    format: 'openai',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4.5v'
  }
]

function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_NAME)
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

function createDefaultConfig(): AppConfig {
  return {
    aiProviders: BUILTIN_MODELS.map((m) => ({ ...m, apiKeyEncrypted: '' })),
    defaultProviderId: BUILTIN_MODELS.length === 1 ? BUILTIN_MODELS[0].id : ''
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
