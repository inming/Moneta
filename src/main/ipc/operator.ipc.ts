import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { getDatabase } from '../database/connection'
import * as operatorRepo from '../database/repositories/operator.repo'

export function registerOperatorHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.OPERATOR_LIST, () => {
    const db = getDatabase()
    return operatorRepo.findAll(db)
  })
}
