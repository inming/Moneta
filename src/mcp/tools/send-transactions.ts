import type { MCPCallToolResult, MCPSendTransactionsParams } from '../types'
import * as http from 'http'

// 从环境变量读取端口，默认为 9615
const MCP_HTTP_PORT = process.env.MONETA_MCP_PORT 
  ? parseInt(process.env.MONETA_MCP_PORT, 10) 
  : 9615

export const name: string = 'send_transactions'

export const description = `将转换好的交易数据发送给 Moneta，打开确认界面供用户审核。

使用场景：
1. AI 分析完账单文件后，将解析好的交易数据发送到 Moneta
2. 用户会在 Moneta 应用中看到一个确认界面，可以编辑、删除或补充分类
3. 用户确认后，数据才会正式写入数据库

参数：
- transactions: 交易记录数组，每项包含：
  - date: 日期 (YYYY-MM-DD)
  - type: 类型 (expense/income/investment)
  - amount: 金额（正数或负数，负数表示退款/冲正）
  - category_id: 分类 ID（可选，不确定时留空）
  - category_name: 分类名称（用于显示建议）
  - description: 描述
  - operator_id: 操作人 ID（可选）
  - operator_name: 操作人名称（可选）
- source: 数据来源描述（如 "支付宝账单 2024-01"）

注意：
- 金额支持正数和负数，负数表示退款/冲正
- 金额不能为 0
- 未匹配的分类可以留空 category_id，用户在确认界面补充`

export const inputSchema: object = {
  type: 'object',
  properties: {
    transactions: {
      type: 'array',
      description: '交易记录数组',
      items: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: '日期，格式 YYYY-MM-DD'
          },
          type: {
            type: 'string',
            enum: ['expense', 'income', 'investment'],
            description: '交易类型'
          },
          amount: {
            type: 'number',
            description: '金额，正数或负数（负数表示退款）'
          },
          category_id: {
            type: 'number',
            description: '分类 ID（可选）'
          },
          category_name: {
            type: 'string',
            description: '分类名称建议（可选）'
          },
          description: {
            type: 'string',
            description: '交易描述'
          },
          operator_id: {
            type: 'number',
            description: '操作人 ID（可选）'
          },
          operator_name: {
            type: 'string',
            description: '操作人名称（可选）'
          }
        },
        required: ['date', 'type', 'amount', 'description']
      }
    },
    source: {
      type: 'string',
      description: '数据来源描述'
    }
  },
  required: ['transactions', 'source']
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(params: Record<string, any>): Promise<MCPCallToolResult> {
  const typedParams: MCPSendTransactionsParams = params as MCPSendTransactionsParams

/**
 * 通知主应用打开 MCP 导入确认界面
 */
async function notifyMainApp(params: MCPSendTransactionsParams): Promise<void> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(params)
    
    const options = {
      hostname: '127.0.0.1',
      port: MCP_HTTP_PORT,  // Moneta MCP 内部通信端口
      path: '/mcp-import',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 5000
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve()
        } else {
          reject(new Error(`主应用返回错误: ${res.statusCode} ${data}`))
        }
      })
    })

    req.on('error', (err) => {
      reject(new Error(`无法连接到 Moneta 主应用: ${err.message}`))
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('连接 Moneta 主应用超时'))
    })

    req.write(postData)
    req.end()
  })
}

  try {
    // 数据校验
    if (!Array.isArray(typedParams.transactions) || typedParams.transactions.length === 0) {
      return {
        content: [{
          type: 'text',
          text: '错误: transactions 必须是非空数组'
        }],
        isError: true
      }
    }

    // 校验每条记录
    for (const tx of typedParams.transactions) {
      if (!tx.date || !tx.type || tx.amount === undefined || !tx.description) {
        return {
          content: [{
            type: 'text',
            text: '错误: 每条交易记录必须包含 date、type、amount、description 字段'
          }],
          isError: true
        }
      }
      if (tx.amount === 0) {
        return {
          content: [{
            type: 'text',
            text: '错误: 金额不能为 0'
          }],
          isError: true
        }
      }
      if (!['expense', 'income', 'investment'].includes(tx.type)) {
        return {
          content: [{
            type: 'text',
            text: `错误: 无效的类型 "${tx.type}"，必须是 expense、income 或 investment`
          }],
          isError: true
        }
      }
    }

    // 通知主应用打开确认界面
    await notifyMainApp(typedParams)

    return {
      content: [{
        type: 'text',
        text: `成功发送 ${typedParams.transactions.length} 条交易记录到 Moneta。\n\n请在 Moneta 应用的确认界面中审核数据，补充未匹配的分类后确认导入。\n\n数据来源: ${typedParams.source}`
      }]
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{
        type: 'text',
        text: `发送失败: ${message}\n\n请确保 Moneta 应用正在运行。`
      }],
      isError: true
    }
  }
}
