/** MCP 导入相关类型（前端 MCPImport 页面消费后端 mcp_import_get_data 的数据） */

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

export interface MCPSendTransactionsParams {
  transactions: MCPTransaction[]
  source: string
}
