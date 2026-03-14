import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { recognize, abortRecognition, getLastLogs, buildPrompt } from '../services/ai-recognition.service'
import { getDatabase } from '../database/connection'
import * as categoryRepo from '../database/repositories/category.repo'
import type { RecognizeRequest } from '../../shared/types'

export function registerAIHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AI_RECOGNIZE, async (_event, request: RecognizeRequest) => {
    return recognize(request)
  })

  ipcMain.handle(IPC_CHANNELS.AI_RECOGNIZE_ABORT, () => {
    abortRecognition()
  })

  ipcMain.handle(IPC_CHANNELS.AI_RECOGNIZE_LOGS, () => {
    return getLastLogs()
  })

  ipcMain.handle(IPC_CHANNELS.AI_PROMPT_PREVIEW, () => {
    const db = getDatabase()
    const categories = categoryRepo.findAll(db)
    return buildPrompt(categories)
  })
}
