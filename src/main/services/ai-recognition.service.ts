import { getDatabase } from '../database/connection'
import * as categoryRepo from '../database/repositories/category.repo'
import * as configService from './config.service'
import { getAdapter } from './ai-adapters'
import type {
  RecognizeRequest,
  RecognizeResponse,
  AIRecognizedItem,
  RecognitionResultRow,
  AITestResult,
  Category,
  TransactionType
} from '../../shared/types'

// --- 请求取消 ---
let currentAbortController: AbortController | null = null

export function abortRecognition(): void {
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
}

// --- 日志收集 ---
let lastLogs: string[] = []

function log(msg: string): void {
  const now = new Date()
  const ts = now.toTimeString().slice(0, 8) + '.' + String(now.getMilliseconds()).padStart(3, '0')
  lastLogs.push(`[${ts}] ${msg}`)
}

export function getLastLogs(): string[] {
  return [...lastLogs]
}

function buildPrompt(categories: Category[]): string {
  const grouped: Record<string, Array<{ name: string; description?: string }>> = {
    消费: [],
    收入: [],
    投资: []
  }
  const typeLabel: Record<TransactionType, string> = {
    expense: '消费',
    income: '收入',
    investment: '投资'
  }

  for (const cat of categories) {
    const label = typeLabel[cat.type]
    if (grouped[label]) {
      const item: { name: string; description?: string } = { name: cat.name }
      if (cat.description) {
        item.description = cat.description
      }
      grouped[label].push(item)
    }
  }

  const categoryList = Object.entries(grouped)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => `[${label}]:\n${JSON.stringify(items)}`)
    .join('\n')

  return `你是一个记账助手。请从提供的图片中提取所有交易记录。
不需要提取日期，日期由用户单独指定。

每条交易输出以下字段：
- amount: 正数金额（数值类型）
- description: 交易描述，保留原始信息（如商品名、商家名等），不要过度精简
- type: "expense" | "income" | "investment"
- suggestedCategory: 从下方分类中选最匹配的，不确定则为 null

可用分类：
${categoryList}

仅输出 JSON 数组，不要其他文字。示例格式：
[{"amount": 25.5, "description": "午餐", "type": "expense", "suggestedCategory": "正餐"}]`
}

function extractArray(obj: unknown): unknown[] | null {
  if (Array.isArray(obj)) return obj
  if (obj && typeof obj === 'object') {
    for (const value of Object.values(obj as Record<string, unknown>)) {
      const found = extractArray(value)
      if (found) return found
    }
  }
  return null
}

function parseAIResponse(responseText: string): AIRecognizedItem[] {
  let text = responseText.trim()

  // Strip XML-style tags (e.g. <tool_call>...</tool_call>, <output>...</output>)
  text = text.replace(/<\/?[a-zA-Z_][a-zA-Z0-9_-]*>/g, '').trim()

  // Try to extract JSON from markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim()
  }

  // Extract JSON array by locating the first '[' and last ']'
  // This handles any wrapper text, special tokens, or formatting from various models
  const firstBracket = text.indexOf('[')
  const lastBracket = text.lastIndexOf(']')
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    // Try parsing the array slice first
    const arraySlice = text.slice(firstBracket, lastBracket + 1)
    try {
      const parsed = JSON.parse(arraySlice)
      if (Array.isArray(parsed)) {
        return toItems(parsed)
      }
    } catch {
      // Array slice failed — fall through to full-text parse
    }
  }

  // Fallback: parse the entire text (may be a JSON object containing a nested array)
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1)
  }

  const parsed = JSON.parse(text)
  const arr = extractArray(parsed)
  if (!arr) {
    throw new Error('AI 返回的数据中未找到数组')
  }
  return toItems(arr)
}

function toItems(arr: unknown[]): AIRecognizedItem[] {
  return arr.map((item: unknown) => {
    const obj = item as Record<string, unknown>
    return {
      amount: Number(obj.amount) || 0,
      description: String(obj.description || ''),
      type: validateType(String(obj.type || 'expense')),
      suggestedCategory: obj.suggestedCategory ? String(obj.suggestedCategory) : null
    }
  })
}

function validateType(type: string): TransactionType {
  if (type === 'expense' || type === 'income' || type === 'investment') {
    return type
  }
  return 'expense'
}

function matchCategory(
  suggestedName: string | null,
  type: TransactionType,
  categories: Category[]
): number | null {
  if (!suggestedName) return null

  const normalized = suggestedName.trim()

  // Exact match by name and type
  const exact = categories.find((c) => c.name === normalized && c.type === type)
  if (exact) return exact.id

  // Case-insensitive match
  const lower = normalized.toLowerCase()
  const caseMatch = categories.find(
    (c) => c.name.toLowerCase() === lower && c.type === type
  )
  if (caseMatch) return caseMatch.id

  // Substring match (category name contained in suggested name or vice versa)
  const substringMatch = categories.find(
    (c) =>
      c.type === type &&
      (c.name.includes(normalized) || normalized.includes(c.name))
  )
  if (substringMatch) return substringMatch.id

  return null
}

export async function recognize(request: RecognizeRequest): Promise<RecognizeResponse> {
  // Abort any previous in-flight request
  if (currentAbortController) {
    currentAbortController.abort()
  }
  currentAbortController = new AbortController()
  const { signal } = currentAbortController

  lastLogs = []
  log(`开始 AI 识别, 图片数: ${request.images.length}`)

  const config = configService.loadConfig()

  const providerId = request.providerId || config.defaultProviderId
  if (!providerId) {
    log('错误: 未配置默认 AI 模型')
    throw new Error('请先配置 AI 模型')
  }

  const providerConfig = configService.getProviderDecrypted(providerId)
  log(`加载模型配置: ${providerConfig.name} (${providerConfig.format})`)

  if (!providerConfig.apiKey) {
    log(`错误: 模型 "${providerConfig.name}" 未配置 API Key`)
    throw new Error(`模型 "${providerConfig.name}" 未配置 API Key`)
  }

  const db = getDatabase()
  const categories = categoryRepo.findAll(db)
  const expenseCount = categories.filter((c) => c.type === 'expense').length
  const incomeCount = categories.filter((c) => c.type === 'income').length
  const investmentCount = categories.filter((c) => c.type === 'investment').length
  log(`加载分类数据: 消费 ${expenseCount} / 收入 ${incomeCount} / 投资 ${investmentCount}`)

  const prompt = buildPrompt(categories)
  log(`构建 prompt 完成, 长度: ${prompt.length} 字符`)

  const adapter = getAdapter(providerConfig.format)
  log(`发送 API 请求: ${providerConfig.endpoint}, 模型: ${providerConfig.model}, 图片数: ${request.images.length}`)

  const responseText = await adapter.recognize(providerConfig, request.images, prompt, signal)
  log(`收到 API 响应, 长度: ${responseText.length} 字符`)

  const warnings: string[] = []
  let items: AIRecognizedItem[]

  try {
    items = parseAIResponse(responseText)
    log(`解析结果: ${items.length} 条交易`)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    log(`错误: AI 返回数据解析失败 - ${errMsg}`)
    log(`原始响应内容: ${responseText.slice(0, 500)}`)
    throw new Error(`AI 返回数据解析失败: ${errMsg}`)
  }

  if (items.length === 0) {
    warnings.push('未从图片中识别到任何交易记录')
  }

  const resultRows: RecognitionResultRow[] = items.map((item, index) => ({
    key: `ai-${Date.now()}-${index}`,
    type: item.type,
    amount: item.amount,
    description: item.description,
    category_id: matchCategory(item.suggestedCategory, item.type, categories),
    operator_id: null
  }))

  const matchedCount = resultRows.filter((r) => r.category_id !== null).length
  log(`分类匹配: ${matchedCount}/${resultRows.length} 条成功匹配`)

  const unmatchedCount = resultRows.length - matchedCount
  if (unmatchedCount > 0) {
    warnings.push(`${unmatchedCount} 条交易未能自动匹配分类，请手动选择`)
  }

  log('识别完成')
  return { items: resultRows, warnings }
}

export async function testConnection(providerId: string): Promise<AITestResult> {
  try {
    const providerConfig = configService.getProviderDecrypted(providerId)
    if (!providerConfig.apiKey) {
      return { success: false, error: '未配置 API Key' }
    }
    const adapter = getAdapter(providerConfig.format)
    return await adapter.test(providerConfig)
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
