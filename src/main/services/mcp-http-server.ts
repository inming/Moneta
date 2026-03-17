import * as http from 'http'
import type { MCPSendTransactionsParams } from '../../mcp/types'
import { app, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import {
  setPendingImportRequest,
  notifyRendererToOpenImport
} from '../ipc/mcp-import.ipc'
import { getDatabase } from '../database/connection'

interface MCPImportRequest {
  transactions: MCPSendTransactionsParams['transactions']
  source: string
}

interface MCPHttpServerStatus {
  running: boolean
  port: number
  error?: string
}

// 默认端口
const DEFAULT_PORT = 9615

// 存储主窗口引用，用于通知渲染进程
let mainWindow: BrowserWindow | null = null

/**
 * 设置主窗口引用
 */
export function setMCPMainWindow(window: BrowserWindow): void {
  mainWindow = window
  console.log('[MCP HTTP] Main window set')
}

// 配置文件路径
function getConfigPath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'mcp-config.json')
}

/**
 * 读取 MCP 配置
 */
function readConfig(): { port: number } {
  try {
    const configPath = getConfigPath()
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (config.port && Number.isInteger(config.port) && config.port > 1024 && config.port <= 65535) {
        return { port: config.port }
      }
    }
  } catch {
    // 忽略错误，使用默认配置
  }
  return { port: DEFAULT_PORT }
}

/**
 * 保存 MCP 配置
 */
function saveConfig(config: { port: number }): void {
  const configPath = getConfigPath()
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * MCP HTTP Server
 * 
 * 用于 MCP Server 与主应用之间的通信
 * - 接收 send_transactions 通知，打开确认界面
 * - 提供 /api/categories 和 /api/operators 查询接口
 */
export class MCPHttpServer {
  private server: http.Server | null = null
  private port: number = DEFAULT_PORT
  private statusListeners: ((status: MCPHttpServerStatus) => void)[] = []

  /**
   * 添加状态监听器
   */
  addStatusListener(listener: (status: MCPHttpServerStatus) => void): void {
    this.statusListeners.push(listener)
  }

  /**
   * 移除状态监听器
   */
  removeStatusListener(listener: (status: MCPHttpServerStatus) => void): void {
    const index = this.statusListeners.indexOf(listener)
    if (index > -1) {
      this.statusListeners.splice(index, 1)
    }
  }

  /**
   * 通知状态变更
   */
  private notifyStatus(status: MCPHttpServerStatus): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status)
      } catch {
        // 忽略监听器错误
      }
    }
  }

  /**
   * 获取当前端口
   */
  getPort(): number {
    return this.port
  }

  /**
   * 获取配置中的端口
   */
  getConfiguredPort(): number {
    return readConfig().port
  }

  /**
   * 检查服务器是否正在运行
   */
  isRunning(): boolean {
    return this.server !== null && this.server.listening
  }

  /**
   * 设置端口（保存到配置，下次启动生效）
   */
  setPort(port: number): void {
    if (!Number.isInteger(port) || port <= 1024 || port > 65535) {
      throw new Error('端口号必须是 1025-65535 之间的整数')
    }
    saveConfig({ port })
  }

  /**
   * 启动 HTTP 服务器
   */
  async start(): Promise<void> {
    // 读取配置中的端口
    const config = readConfig()
    this.port = config.port
    console.log(`[MCP HTTP] Starting server on port ${this.port}...`)

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res)
      })

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          const errorMsg = `端口 ${this.port} 已被占用`
          console.error(`MCP HTTP Server ${errorMsg}`)
          this.notifyStatus({ running: false, port: this.port, error: errorMsg })
          reject(new Error(errorMsg))
        } else {
          this.notifyStatus({ running: false, port: this.port, error: err.message })
          reject(err)
        }
      })

      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`MCP HTTP Server listening on 127.0.0.1:${this.port}`)
        this.notifyStatus({ running: true, port: this.port })
        resolve()
      })
    })
  }

  /**
   * 停止 HTTP 服务器
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('MCP HTTP Server stopped')
          this.notifyStatus({ running: false, port: this.port })
          resolve()
        })
        this.server = null
      } else {
        this.notifyStatus({ running: false, port: this.port })
        resolve()
      }
    })
  }

  /**
   * 重启 HTTP 服务器（用于端口变更后）
   */
  async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    const url = req.url || ''

    // 路由分发
    if (url === '/mcp-import' && req.method === 'POST') {
      this.handleImportRequest(req, res)
    } else if (url === '/api/categories') {
      this.handleCategoriesRequest(req, res)
    } else if (url === '/api/operators') {
      this.handleOperatorsRequest(req, res)
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
    }
  }

  /**
   * 处理导入请求
   */
  private handleImportRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })

    req.on('end', () => {
      console.log('[MCP HTTP] Received import request, body length:', body.length)
      try {
        const data = JSON.parse(body) as MCPImportRequest
        
        // 验证数据
        if (!Array.isArray(data.transactions) || !data.source) {
          console.error('[MCP HTTP] Invalid request data')
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid request data' }))
          return
        }

        console.log(`[MCP HTTP] Import request valid: ${data.transactions.length} transactions from ${data.source}`)
        console.log(`[MCP HTTP] mainWindow is ${mainWindow ? 'set' : 'null'}`)

        // 存储导入请求并通知渲染进程
        setPendingImportRequest(data)
        if (mainWindow) {
          console.log('[MCP HTTP] Notifying renderer to open import window')
          notifyRendererToOpenImport(mainWindow)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } else {
          console.error('[MCP HTTP] Main window not available')
          res.writeHead(503, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Main window not available' }))
        }
      } catch (err) {
        console.error('[MCP HTTP] Invalid JSON:', err)
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
  }

  /**
   * 处理分类查询请求
   */
  private handleCategoriesRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    try {
      const db = getDatabase()
      let sql = `
        SELECT id, name, type, description, sort_order
        FROM categories
        WHERE is_active = 1
      `
      const args: (string | number)[] = []

      // 解析查询参数
      const url = new URL(req.url || '', `http://127.0.0.1:${this.port}`)
      const type = url.searchParams.get('type')
      
      if (type) {
        sql += ' AND type = ?'
        args.push(type)
      }

      sql += ' ORDER BY type, sort_order'

      const categories = db.prepare(sql).all(...args)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(categories))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: message }))
    }
  }

  /**
   * 处理操作人查询请求
   */
  private handleOperatorsRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    try {
      const db = getDatabase()
      const sql = `
        SELECT id, name
        FROM operators
        ORDER BY name
      `

      const operators = db.prepare(sql).all()

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(operators))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: message }))
    }
  }
}

// 单例实例
export const mcpHttpServer = new MCPHttpServer()
