import * as getCategories from './get-categories'
import * as getOperators from './get-operators'
import * as sendTransactions from './send-transactions'
import type { MCPCallToolResult } from '../types'

export interface ToolModule {
  name: string
  description: string
  inputSchema: object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (params?: any) => Promise<MCPCallToolResult>
}

export const tools: ToolModule[] = [
  getCategories as ToolModule,
  getOperators as ToolModule,
  sendTransactions as ToolModule
]

export function getTool(name: string): ToolModule | undefined {
  return tools.find(t => t.name === name)
}
