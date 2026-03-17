import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { MCPSendTransactionsParams } from '../../mcp/types'
import { getDatabase } from '../database/connection'
import * as transactionRepo from '../database/repositories/transaction.repo'
import type { CreateTransactionDTO } from '../../shared/types'

// 存储待处理的导入请求（用于主进程和渲染进程之间传递）
let pendingImportRequest: MCPSendTransactionsParams | null = null

/**
 * 设置待处理的导入请求
 * 由 MCP HTTP Server 调用
 */
export function setPendingImportRequest(request: MCPSendTransactionsParams): void {
  pendingImportRequest = request
}

/**
 * 获取待处理的导入请求（不清除）
 */
export function getPendingImportRequest(): MCPSendTransactionsParams | null {
  return pendingImportRequest
}

/**
 * 清除待处理的导入请求
 */
export function clearPendingImportRequest(): void {
  pendingImportRequest = null
}

/**
 * 通知渲染进程打开 MCP 导入确认界面
 */
export function notifyRendererToOpenImport(window: BrowserWindow): void {
  console.log('[MCP Import] Sending MCP_IMPORT_OPEN to renderer')
  if (!window.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.MCP_IMPORT_OPEN)
    console.log('[MCP Import] Event sent successfully')
  } else {
    console.error('[MCP Import] Window is destroyed')
  }
}

export function registerMCPImportHandlers(): void {
  // 获取待导入数据
  ipcMain.handle(IPC_CHANNELS.MCP_IMPORT_GET_DATA, () => {
    return getPendingImportRequest()
  })

  // 清除待导入数据（导入成功后调用）
  ipcMain.handle(IPC_CHANNELS.MCP_IMPORT_CLEAR_DATA, () => {
    clearPendingImportRequest()
    return { success: true }
  })

  // 确认导入
  ipcMain.handle(IPC_CHANNELS.MCP_IMPORT_CONFIRM, async (_event, transactions: unknown[]) => {
    try {
      const db = getDatabase()
      
      // 转换数据格式
      const items: CreateTransactionDTO[] = (transactions as Array<{
        date: string
        type: string
        amount: number
        category_id: number
        description: string
        operator_id?: number
      }>).map((tx) => ({
        date: tx.date,
        type: tx.type as CreateTransactionDTO['type'],
        amount: tx.amount,
        category_id: tx.category_id,
        description: tx.description || '',
        operator_id: tx.operator_id
      }))
      
      // 批量创建
      transactionRepo.batchCreate(db, items)
      
      return { success: true, count: items.length }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })
}
