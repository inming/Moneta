import { ipcMain, dialog, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { ExportConfig, TransactionListParams } from '../../shared/types'
import { getDatabase } from '../database/connection'
import { parseExcel, executeImport, exportToExcel, exportToCsv } from '../services/import-export.service'
import * as transactionRepo from '../database/repositories/transaction.repo'
import * as operatorRepo from '../database/repositories/operator.repo'
import * as categoryRepo from '../database/repositories/category.repo'
import { invalidateCache as invalidateForecastCache } from '../services/forecast.service'

export function registerImportExportHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_FILE, async (_event, filters: Electron.FileFilter[]) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters
    })

    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_SAVE_FILE, async (_event, filters: Electron.FileFilter[], defaultName: string) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null

    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultName,
      filters
    })

    return result.canceled ? null : result.filePath ?? null
  })

  ipcMain.handle(IPC_CHANNELS.IMPORT_PREVIEW, (_event, filePath: string) => {
    return parseExcel(filePath)
  })

  ipcMain.handle(IPC_CHANNELS.IMPORT_EXECUTE, (_event, filePath: string) => {
    const db = getDatabase()
    const preview = parseExcel(filePath)
    const result = executeImport(db, preview)
    invalidateForecastCache()
    return result
  })

  ipcMain.handle(IPC_CHANNELS.EXPORT_COUNT, (_event, params: TransactionListParams) => {
    const db = getDatabase()
    return transactionRepo.countForExport(db, params)
  })

  ipcMain.handle(IPC_CHANNELS.EXPORT_EXECUTE, (_event, config: ExportConfig) => {
    const db = getDatabase()
    const rows = transactionRepo.findAllForExport(db, config)
    if (config.format === 'csv') {
      exportToCsv(config.filePath, rows)
    } else {
      exportToExcel(config.filePath, rows)
    }
    return { exported: rows.length, filePath: config.filePath }
  })

  ipcMain.handle(IPC_CHANNELS.DATA_CLEAR_TRANSACTIONS, () => {
    const db = getDatabase()
    const run = db.transaction(() => {
      transactionRepo.deleteAll(db)
      operatorRepo.deleteAll(db)
    })
    run()
    invalidateForecastCache()
  })

  ipcMain.handle(IPC_CHANNELS.DATA_FACTORY_RESET, () => {
    const db = getDatabase()
    const run = db.transaction(() => {
      transactionRepo.deleteAll(db)
      operatorRepo.deleteAll(db)
      categoryRepo.deleteAllCustom(db)
      categoryRepo.resetSystemCategories(db)
    })
    run()
    invalidateForecastCache()
  })
}
