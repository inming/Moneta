import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { recognize, getLastLogs } from '../services/ai-recognition.service'
import type { RecognizeRequest } from '../../shared/types'

export function registerAIHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AI_RECOGNIZE, async (_event, request: RecognizeRequest) => {
    return recognize(request)
  })

  ipcMain.handle(IPC_CHANNELS.AI_RECOGNIZE_LOGS, () => {
    return getLastLogs()
  })
}
