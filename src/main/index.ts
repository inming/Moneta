import { app, BrowserWindow } from 'electron'
import { createWindow } from './window'
import { getDatabase, closeDatabase } from './database/connection'
import { runMigrations } from './database/migrator'
import { registerImportExportHandlers } from './ipc/import-export.ipc'
import { registerTransactionHandlers } from './ipc/transaction.ipc'
import { registerCategoryHandlers } from './ipc/category.ipc'
import { registerOperatorHandlers } from './ipc/operator.ipc'
import { registerAIProviderHandlers } from './ipc/ai-provider.ipc'
import { registerAIHandlers } from './ipc/ai.ipc'
import { registerAuthHandlers } from './ipc/auth.ipc'
import { registerStatsHandlers } from './ipc/stats.ipc'
import { registerMCPConfigHandlers, registerMCPHttpStatusListener } from './ipc/mcp-config.ipc'
import { registerMCPImportHandlers } from './ipc/mcp-import.ipc'
import { registerDraftHandlers } from './ipc/draft.ipc'
import { setupI18nHandlers } from './ipc/i18n.ipc'
import { setMCPMainWindow, mcpHttpServer } from './services/mcp-http-server'
import { IPC_CHANNELS } from '../shared/ipc-channels'

app.whenReady().then(() => {
  // Initialize database and run migrations
  const db = getDatabase()
  runMigrations(db)

  // Register IPC handlers
  registerImportExportHandlers()
  registerTransactionHandlers()
  registerCategoryHandlers()
  registerOperatorHandlers()
  registerAIProviderHandlers()
  registerAIHandlers()
  registerAuthHandlers()
  registerStatsHandlers()
  registerMCPConfigHandlers()
  registerMCPImportHandlers()
  registerDraftHandlers()
  setupI18nHandlers()

  const mainWindow = createWindow()

  // 设置 MCP HTTP Server 使用的主窗口
  setMCPMainWindow(mainWindow)

  // 自动启动 MCP HTTP Server
  mcpHttpServer.start().catch((err) => {
    console.error('[Main] Failed to auto-start MCP HTTP Server:', err.message)
  })

  // 注册 MCP HTTP Server 状态监听器，将状态推送到渲染进程
  registerMCPHttpStatusListener((status) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.MCP_HTTP_STATUS_CHANGED, status)
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
