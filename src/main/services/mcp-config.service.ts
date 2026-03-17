import { app } from 'electron'
import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import * as path from 'path'
import * as os from 'os'
import { mcpHttpServer } from './mcp-http-server'

interface MCPConfigResult {
  success: boolean
  message: string
  needsRestart: boolean
}

interface MCPStatus {
  configured: boolean
  serverRunning: boolean
  port: number
  serverError?: string
}

/**
 * 获取 Claude Desktop 配置文件路径
 */
function getClaudeConfigPath(): string {
  const platform = os.platform()
  const homeDir = os.homedir()

  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  } else if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')
  }

  throw new Error(`不支持的平台: ${platform}`)
}

/**
 * 获取 MCP Server 可执行文件路径
 */
function getMCPServerPath(): string {
  const isDev = !app.isPackaged
  if (isDev) {
    // 开发环境：使用 electron-vite 的输出目录
    return path.join(process.cwd(), 'out', 'main', 'mcp.js')
  }
  // 生产环境：使用 app.getAppPath() 获取应用路径
  // electron-builder 打包后，out/main 目录在 app.asar 内或同级
  const appPath = app.getAppPath()
  // 尝试多个可能的位置
  const possiblePaths = [
    path.join(appPath, 'out', 'main', 'mcp.js'),                    // asar 内或未打包
    path.join(path.dirname(appPath), 'out', 'main', 'mcp.js'),      // asar 同级
    path.join(app.getPath('exe'), '..', 'resources', 'app', 'out', 'main', 'mcp.js'), // Windows
    path.join(app.getPath('exe'), '..', '..', 'Resources', 'app', 'out', 'main', 'mcp.js') // macOS
  ]
  
  // 返回第一个存在的路径，或默认返回第一个
  for (const p of possiblePaths) {
    if (fsSync.existsSync(p)) {
      return p
    }
  }
  
  // 默认返回 asar 内的路径（最常见情况）
  return possiblePaths[0]
}

/**
 * 读取现有的 Claude Desktop 配置
 */
async function readClaudeConfig(): Promise<Record<string, unknown>> {
  const configPath = getClaudeConfigPath()
  try {
    const content = await fs.readFile(configPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

/**
 * 写入 Claude Desktop 配置
 */
async function writeClaudeConfig(config: Record<string, unknown>): Promise<void> {
  const configPath = getClaudeConfigPath()
  const configDir = path.dirname(configPath)
  await fs.mkdir(configDir, { recursive: true })
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * 检查是否已配置 MCP
 */
export async function isMCPConfigured(): Promise<boolean> {
  try {
    const config = await readClaudeConfig()
    const servers = (config.mcpServers as Record<string, unknown> | undefined) || {}
    return 'moneta' in servers
  } catch {
    return false
  }
}

/**
 * 获取 MCP 状态
 */
export async function getMCPStatus(): Promise<MCPStatus> {
  const configured = await isMCPConfigured()
  const port = mcpHttpServer.getPort()
  
  // 尝试检查服务器是否实际在运行（通过检查端口是否被占用）
  const isRunning = await checkPortInUse(port)
  
  return {
    configured,
    serverRunning: isRunning,
    port
  }
}

import * as net from 'net'

/**
 * 检查端口是否被占用
 */
async function checkPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer()
    
    tester.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true)
      } else {
        resolve(false)
      }
    })
    
    tester.once('listening', () => {
      tester.close()
      resolve(false)
    })
    
    tester.listen(port, '127.0.0.1')
  })
}

/**
 * 获取 HTTP Server 配置
 */
export function getHTTPServerConfig(): { port: number } {
  return { port: mcpHttpServer.getConfiguredPort() }
}

/**
 * 更新 HTTP Server 端口
 */
export async function updateHTTPServerPort(port: number): Promise<{ success: boolean; message: string }> {
  try {
    const oldPort = mcpHttpServer.getConfiguredPort()
    
    // 保存新端口到配置
    mcpHttpServer.setPort(port)
    
    // 如果服务器正在运行，尝试重启
    const isRunning = await checkPortInUse(oldPort)
    if (isRunning) {
      try {
        await mcpHttpServer.restart()
        return {
          success: true,
          message: `端口已更新为 ${port}，服务器已重启`
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return {
          success: false,
          message: `端口已保存，但重启失败: ${msg}`
        }
      }
    }
    
    return {
      success: true,
      message: `端口已更新为 ${port}，下次启动时生效`
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      message: `更新端口失败: ${msg}`
    }
  }
}

/**
 * 启动 MCP HTTP Server
 */
export async function startMCPHttpServer(): Promise<MCPConfigResult> {
  try {
    await mcpHttpServer.start()
    const port = mcpHttpServer.getPort()
    return {
      success: true,
      message: `MCP HTTP 服务器已启动（端口: ${port}）`,
      needsRestart: false
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('已被占用') || msg.includes('already in use')) {
      return {
        success: false,
        message: `端口被占用: ${msg}。请修改端口后重试。`,
        needsRestart: false
      }
    }
    return {
      success: false,
      message: `启动失败: ${msg}`,
      needsRestart: false
    }
  }
}

/**
 * 配置 Claude Desktop MCP
 * 
 * 1. 确保 HTTP Server 在配置的端口上运行
 * 2. 写入 MCP Server 配置到 claude_desktop_config.json
 */
export async function configureClaudeDesktop(): Promise<MCPConfigResult> {
  try {
    // 1. 获取配置端口和当前运行端口
    const configuredPort = mcpHttpServer.getConfiguredPort()
    const currentPort = mcpHttpServer.getPort()
    const isServerRunning = mcpHttpServer.isRunning()

    // 2. 如果 HTTP Server 在运行但端口不一致，需要重启
    if (isServerRunning && configuredPort !== currentPort) {
      console.log(`[MCP Config] Port changed from ${currentPort} to ${configuredPort}, restarting server...`)
      try {
        await mcpHttpServer.stop()
      } catch {
        // 忽略停止错误
      }
    }

    // 3. 如果 HTTP Server 没运行，启动它
    if (!mcpHttpServer.isRunning()) {
      try {
        await mcpHttpServer.start()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return {
          success: false,
          message: `HTTP 服务启动失败: ${msg}。请检查端口设置。`,
          needsRestart: false
        }
      }
    }

    // 4. 读取现有配置
    const config = await readClaudeConfig()

    // 5. 准备 MCP Server 配置
    const mcpServerPath = getMCPServerPath()
    const port = mcpHttpServer.getPort()

    // 使用 node 运行 MCP Server（开发环境和生产环境都需要 node）
    // 通过环境变量传递 HTTP 端口给 MCP Server
    const serverConfig: Record<string, unknown> = {
      command: 'node',
      args: [mcpServerPath, '--mcp'],
      env: {
        MONETA_MCP_PORT: String(port)
      }
    }

    // 6. 合并配置（不覆盖其他 MCP 服务器）
    const existingServers = (config.mcpServers as Record<string, Record<string, unknown>> | undefined) || {}
    const newConfig = {
      ...config,
      mcpServers: {
        ...existingServers,
        moneta: serverConfig
      }
    }

    // 7. 写入配置
    await writeClaudeConfig(newConfig)

    return {
      success: true,
      message: `Claude Desktop 配置已写入（端口: ${port}），请重启 Claude Desktop`,
      needsRestart: true
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      message: `配置失败: ${errorMessage}`,
      needsRestart: false
    }
  }
}

/**
 * 获取配置文件路径信息（用于展示给用户）
 */
export function getConfigPaths(): {
  claudeConfigPath: string
  mcpServerPath: string
} {
  return {
    claudeConfigPath: getClaudeConfigPath(),
    mcpServerPath: getMCPServerPath()
  }
}
