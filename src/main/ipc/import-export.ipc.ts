import { ipcMain, dialog, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { getDatabase } from '../database/connection'
import { parseExcel, executeImport } from '../services/import-export.service'

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
    return executeImport(db, preview)
  })
}
