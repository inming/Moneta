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

  createWindow()

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
