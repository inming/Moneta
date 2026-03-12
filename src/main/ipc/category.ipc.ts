import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { getDatabase } from '../database/connection'
import * as categoryRepo from '../database/repositories/category.repo'
import type { CreateCategoryDTO, UpdateCategoryDTO, TransactionType } from '../../shared/types'

export function registerCategoryHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CATEGORY_LIST, (_event, type?: TransactionType) => {
    const db = getDatabase()
    return categoryRepo.findAll(db, type)
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_LIST_ALL, (_event, type?: TransactionType) => {
    const db = getDatabase()
    return categoryRepo.findAllIncludeInactive(db, type)
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_CREATE, (_event, dto: CreateCategoryDTO) => {
    const db = getDatabase()
    try {
      return categoryRepo.create(db, dto)
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
        throw new Error('该分类名称已存在')
      }
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_UPDATE, (_event, id: number, dto: UpdateCategoryDTO) => {
    const db = getDatabase()
    try {
      return categoryRepo.update(db, id, dto)
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
        throw new Error('该分类名称已存在')
      }
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_DELETE, (_event, id: number) => {
    const db = getDatabase()
    return categoryRepo.remove(db, id)
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_REORDER, (_event, type: TransactionType, ids: number[]) => {
    const db = getDatabase()
    categoryRepo.reorder(db, type, ids)
  })
}
