import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { getDatabase } from '../database/connection'
import * as draftRepo from '../database/repositories/draft.repo'
import type { SaveDraftDTO } from '../../shared/types'

export function registerDraftHandlers(): void {
  /**
   * 获取草稿
   */
  ipcMain.handle(IPC_CHANNELS.DRAFT_GET, () => {
    const db = getDatabase()
    return draftRepo.findOne(db)
  })

  /**
   * 保存草稿
   */
  ipcMain.handle(IPC_CHANNELS.DRAFT_SAVE, (_event, dto: SaveDraftDTO) => {
    const db = getDatabase()
    return draftRepo.save(db, dto)
  })

  /**
   * 删除草稿
   */
  ipcMain.handle(IPC_CHANNELS.DRAFT_DELETE, () => {
    const db = getDatabase()
    draftRepo.remove(db)
  })

  /**
   * 获取草稿摘要
   */
  ipcMain.handle(IPC_CHANNELS.DRAFT_GET_SUMMARY, () => {
    const db = getDatabase()
    return draftRepo.getSummary(db)
  })
}
