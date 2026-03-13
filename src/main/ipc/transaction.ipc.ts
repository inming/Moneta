import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { getDatabase } from '../database/connection'
import * as transactionRepo from '../database/repositories/transaction.repo'
import type { TransactionListParams, CreateTransactionDTO } from '../../shared/types'

export function registerTransactionHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.TRANSACTION_LIST, (_event, params: TransactionListParams) => {
    const db = getDatabase()
    return transactionRepo.findAll(db, params)
  })

  ipcMain.handle(IPC_CHANNELS.TRANSACTION_BATCH_CREATE, (_event, items: CreateTransactionDTO[]) => {
    const db = getDatabase()
    transactionRepo.batchCreate(db, items)
    return { count: items.length }
  })
}
