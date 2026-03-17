import type { MCPCallToolResult, MCPGetCategoriesParams } from '../types'
import { queryMainApp } from '../http-client'

export const name: string = 'get_categories'

export const description = `获取 Moneta 记账软件中的交易分类列表。

使用场景：
1. 当用户想要导入账单文件时，先获取分类列表以便智能匹配
2. 根据分类的 name 和 description 字段进行语义匹配
3. 返回的分类包含 id、name、type、description（AI 描述）、sort_order

示例匹配规则：
- "美团外卖" → 匹配 name="正餐"（description 包含"外卖"）
- "滴滴出行" → 匹配 name="交通"（description 包含"打车"）
- "工资" → 匹配 name="工资"（收入分类）

参数：
- type: 可选，筛选特定类型（expense/income/investment），不填返回全部分类

返回：分类对象数组，每个对象包含 id、name、type、description、sort_order`

export const inputSchema: object = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['expense', 'income', 'investment'],
      description: '分类类型筛选（可选）'
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(params?: Record<string, any>): Promise<MCPCallToolResult> {
  const typedParams: MCPGetCategoriesParams = params || {}

  try {
    // 通过 HTTP 向主应用查询分类
    const categories = await queryMainApp('/api/categories', typedParams.type ? { type: typedParams.type } : undefined)

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(categories, null, 2)
      }]
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{
        type: 'text',
        text: `获取分类失败: ${message}`
      }],
      isError: true
    }
  }
}
