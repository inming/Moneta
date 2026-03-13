import { fetchWithTimeout, type AIAdapter } from './index'
import type { AIProviderConfig, AITestResult } from '../../../shared/types'

interface ContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

export class OpenAIAdapter implements AIAdapter {
  async recognize(config: AIProviderConfig, images: string[], prompt: string): Promise<string> {
    const content: ContentPart[] = [{ type: 'text', text: prompt }]
    for (const img of images) {
      content.push({
        type: 'image_url',
        image_url: { url: img }
      })
    }

    const response = await fetchWithTimeout(`${config.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content }],
        max_tokens: 4096
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    return data.choices[0].message.content
  }

  async test(config: AIProviderConfig): Promise<AITestResult> {
    try {
      const response = await fetchWithTimeout(`${config.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'Hello, respond with your model name only.' }],
          max_tokens: 50
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, error: `HTTP ${response.status}: ${errorText}` }
      }

      const data = await response.json()
      const modelName = data.model || config.model
      return { success: true, modelName }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
