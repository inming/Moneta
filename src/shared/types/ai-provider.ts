export type AIProviderFormat = 'openai'

export interface AIProviderConfig {
  id: string
  name: string
  format: AIProviderFormat
  endpoint: string
  apiKey: string
  model: string
  isDefault: boolean
}

export interface UpdateAIProviderDTO {
  endpoint?: string
  apiKey?: string
  model?: string
}

export interface AIProviderView {
  id: string
  name: string
  format: AIProviderFormat
  endpoint: string
  apiKeyMasked: string
  model: string
  isDefault: boolean
}

export interface AITestResult {
  success: boolean
  modelName?: string
  error?: string
}
