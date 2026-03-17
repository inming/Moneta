import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import * as mcpConfigService from '../services/mcp-config.service'
import { mcpHttpServer } from '../services/mcp-http-server'

export function registerMCPConfigHandlers(): void {
  // 启动 MCP HTTP Server
  ipcMain.handle(IPC_CHANNELS.MCP_START_SERVER, async () => {
    return mcpConfigService.startMCPHttpServer()
  })

  // 配置 Claude Desktop
  ipcMain.handle(IPC_CHANNELS.MCP_CONFIGURE_CLAUDE, async () => {
    return mcpConfigService.configureClaudeDesktop()
  })

  // 获取 MCP 状态
  ipcMain.handle(IPC_CHANNELS.MCP_GET_STATUS, async () => {
    return mcpConfigService.getMCPStatus()
  })

  // 获取 HTTP Server 配置
  ipcMain.handle(IPC_CHANNELS.MCP_GET_HTTP_CONFIG, async () => {
    return mcpConfigService.getHTTPServerConfig()
  })

  // 更新 HTTP Server 端口
  ipcMain.handle(IPC_CHANNELS.MCP_UPDATE_PORT, async (_event, port: number) => {
    return mcpConfigService.updateHTTPServerPort(port)
  })

  // 获取配置文件路径
  ipcMain.handle(IPC_CHANNELS.MCP_GET_PATHS, async () => {
    return mcpConfigService.getConfigPaths()
  })
}

/**
 * 注册 MCP HTTP Server 状态监听器
 * 用于将服务器状态变化推送到渲染进程
 */
export function registerMCPHttpStatusListener(sendStatus: (status: {
  running: boolean
  port: number
  error?: string
}) => void): void {
  mcpHttpServer.addStatusListener(sendStatus)
}
