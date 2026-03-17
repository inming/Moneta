import type { MCPCallToolResult } from '../types'
import { queryMainApp } from '../http-client'

export const name: string = 'get_operators'

export const description = `获取 Moneta 记账软件中的操作人列表。

使用场景：
1. 当用户导入账单时，需要知道有哪些操作人可供选择
2. 将交易记录关联到特定的操作人

返回：操作人对象数组，每个对象包含 id、name`

export const inputSchema: object = {
  type: 'object',
  properties: {}
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handler(_params?: Record<string, unknown>): Promise<MCPCallToolResult> {
  try {
    // 通过 HTTP 向主应用查询操作人
    const operators = await queryMainApp('/api/operators')

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(operators, null, 2)
      }]
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{
        type: 'text',
        text: `获取操作人失败: ${message}`
      }],
      isError: true
    }
  }
}
