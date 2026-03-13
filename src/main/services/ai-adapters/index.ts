import type { AIProviderConfig, AIProviderFormat, AITestResult } from '../../../shared/types'
import { OpenAIAdapter } from './openai.adapter'

export interface AIAdapter {
  recognize(config: AIProviderConfig, images: string[], prompt: string): Promise<string>
  test(config: AIProviderConfig): Promise<AITestResult>
}

/** 带超时的 fetch，默认 300 秒（多图识别或大图可能较慢） */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 300_000
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`请求超时 (${timeoutMs / 1000}s)，请检查网络连接或 API 服务是否可用`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export function getAdapter(_format: AIProviderFormat): AIAdapter {
  // 当前所有内置模型均使用 OpenAI 兼容格式
  return new OpenAIAdapter()
}
