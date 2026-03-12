import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { getDatabase } from '../database/connection'
import * as categoryRepo from '../database/repositories/category.repo'
import type { TransactionType } from '../../shared/types'

export function registerCategoryHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CATEGORY_LIST, (_event, type?: TransactionType) => {
    const db = getDatabase()
    return categoryRepo.findAll(db, type)
  })
}
