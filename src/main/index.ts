import { app, BrowserWindow, safeStorage } from 'electron'
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
import { registerThemeIPC } from './ipc/theme.ipc'
import { registerSyncHandlers } from './ipc/sync.ipc'
import { setMCPMainWindow, mcpHttpServer } from './services/mcp-http-server'
import { migrateLegacyEncryption } from './services/config.service'
import { IPC_CHANNELS } from '../shared/ipc-channels'

app.whenReady().then(() => {
  // Diagnose safeStorage availability — surfaces issues with macOS Keychain /
  // Windows DPAPI / Linux libsecret early so the warnings make sense.
  const ssAvailable = safeStorage.isEncryptionAvailable()
  console.log(
    `[startup] safeStorage.isEncryptionAvailable() = ${ssAvailable} ` +
      `(platform=${process.platform}, electron=${process.versions.electron})`
  )
  if (!ssAvailable) {
    if (process.platform === 'darwin') {
      console.warn(
        '[startup] macOS Keychain not accessible. Likely causes:\n' +
          '  1. The app was launched in dev mode and Keychain Access denied the request\n' +
          '  2. The keychain is locked (run `security unlock-keychain`)\n' +
          '  3. The Electron binary in node_modules is unsigned and macOS rejected access\n' +
          '  Cloud sync requires safeStorage; existing PIN/API keys fall back to base64 (insecure).'
      )
    } else if (process.platform === 'linux') {
      console.warn(
        '[startup] Linux libsecret/Secret Service not available. Install gnome-keyring or kwallet.'
      )
    }
  }

  // Migrate any legacy plaintext-base64 secrets (from sessions where
  // safeStorage was unavailable) to safeStorage now that it works.
  if (ssAvailable) {
    try {
      migrateLegacyEncryption()
    } catch (e) {
      console.error('[startup] legacy encryption migration failed:', e)
    }
  }

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
  registerThemeIPC()
  registerSyncHandlers()

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
