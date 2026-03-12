import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { getDatabase } from '../database/connection'
import * as operatorRepo from '../database/repositories/operator.repo'

export function registerOperatorHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.OPERATOR_LIST, () => {
    const db = getDatabase()
    return operatorRepo.findAll(db)
  })

  ipcMain.handle(IPC_CHANNELS.OPERATOR_CREATE, (_event, name: string) => {
    const db = getDatabase()
    try {
      return operatorRepo.create(db, name)
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
        throw new Error('该操作人名称已存在')
      }
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.OPERATOR_UPDATE, (_event, id: number, name: string) => {
    const db = getDatabase()
    try {
      return operatorRepo.update(db, id, name)
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
        throw new Error('该操作人名称已存在')
      }
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.OPERATOR_DELETE, (_event, id: number) => {
    const db = getDatabase()
    operatorRepo.remove(db, id)
  })
}
