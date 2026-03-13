import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { getDatabase } from '../database/connection'
import * as transactionRepo from '../database/repositories/transaction.repo'
import type {
  TransactionListParams,
  CreateTransactionDTO,
  UpdateTransactionDTO
} from '../../shared/types'

export function registerTransactionHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.TRANSACTION_LIST, (_event, params: TransactionListParams) => {
    const db = getDatabase()
    return transactionRepo.findAll(db, params)
  })

  ipcMain.handle(IPC_CHANNELS.TRANSACTION_CREATE, (_event, data: CreateTransactionDTO) => {
    const db = getDatabase()
    return transactionRepo.create(db, data)
  })

  ipcMain.handle(IPC_CHANNELS.TRANSACTION_UPDATE, (_event, id: number, data: UpdateTransactionDTO) => {
    const db = getDatabase()
    return transactionRepo.update(db, id, data)
  })

  ipcMain.handle(IPC_CHANNELS.TRANSACTION_DELETE, (_event, id: number) => {
    const db = getDatabase()
    transactionRepo.remove(db, id)
  })

  ipcMain.handle(IPC_CHANNELS.TRANSACTION_BATCH_CREATE, (_event, items: CreateTransactionDTO[]) => {
    const db = getDatabase()
    transactionRepo.batchCreate(db, items)
    return { count: items.length }
  })

  ipcMain.handle(IPC_CHANNELS.TRANSACTION_BATCH_DELETE, (_event, ids: number[]) => {
    const db = getDatabase()
    const count = transactionRepo.batchDelete(db, ids)
    return { count }
  })
}
