import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest
} from '@modelcontextprotocol/sdk/types.js'
import { tools, getTool } from './tools'
import type { MCPContent } from './types'

export class MonetaMcpServer {
  private server: Server
  private transport: StdioServerTransport | null = null

  constructor() {
    this.server = new Server(
      {
        name: 'moneta-mcp',
        version: '0.5.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    )

    this.setupHandlers()
  }

  private setupHandlers(): void {
    // 注册工具列表处理器
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema
        }))
      }
    })

    // 注册工具调用处理器
    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params

      const tool = getTool(name)
      if (!tool) {
        return {
          content: [{
            type: 'text',
            text: `未知工具: ${name}`
          } as MCPContent],
          isError: true
        }
      }

      try {
        const result = await tool.handler(args)
        return {
          content: result.content,
          isError: result.isError
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: [{
            type: 'text',
            text: `工具执行错误: ${message}`
          } as MCPContent],
          isError: true
        }
      }
    })
  }

  async start(): Promise<void> {
    this.transport = new StdioServerTransport()
    await this.server.connect(this.transport)
    
    // 向 stderr 输出日志（stdout 用于 MCP 通信）
    console.error('Moneta MCP Server started')
  }

  async stop(): Promise<void> {
    if (this.transport) {
      await this.transport.close()
      this.transport = null
    }
  }
}
