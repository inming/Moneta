/**
 * MCP (Model Context Protocol) 类型定义
 */

export interface MCPTextContent {
  type: 'text'
  text: string
}

export type MCPContent = MCPTextContent

export interface MCPCallToolResult {
  content: MCPContent[]
  isError?: boolean
  // MCP SDK 需要的额外字段
  _meta?: Record<string, unknown>
}

export interface MCPTransaction {
  date: string
  type: 'expense' | 'income' | 'investment'
  amount: number
  category_id?: number
  category_name?: string
  description: string
  operator_id?: number
  operator_name?: string
}

export interface MCPGetCategoriesParams {
  type?: 'expense' | 'income' | 'investment'
}

export interface MCPSendTransactionsParams {
  transactions: MCPTransaction[]
  source: string
}
