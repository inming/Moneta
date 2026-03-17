#!/usr/bin/env node

/**
 * Moneta MCP Server 入口
 * 
 * 启动方式:
 * 1. 通过 Claude Desktop 调用（配置在 claude_desktop_config.json 中）
 * 2. 手动调试: node src/mcp/index.ts --mcp
 */

import { MonetaMcpServer } from './server'

async function main(): Promise<void> {
  // 检查是否是 MCP 模式
  const isMcpMode = process.argv.includes('--mcp')
  
  if (!isMcpMode) {
    console.error('Usage: moneta-mcp --mcp')
    console.error('')
    console.error('This is the MCP server for Moneta.')
    console.error('It should be started by Claude Desktop via stdio.')
    process.exit(1)
  }

  const server = new MonetaMcpServer()
  
  // 处理优雅关闭
  process.on('SIGINT', async () => {
    console.error('Received SIGINT, shutting down...')
    await server.stop()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.error('Received SIGTERM, shutting down...')
    await server.stop()
    process.exit(0)
  })

  // 启动服务器
  await server.start()
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
