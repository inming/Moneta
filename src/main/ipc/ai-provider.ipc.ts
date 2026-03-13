import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import * as configService from '../services/config.service'
import { testConnection } from '../services/ai-recognition.service'
import type { UpdateAIProviderDTO } from '../../shared/types'

export function registerAIProviderHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AI_PROVIDER_LIST, () => {
    return configService.getProviders()
  })

  ipcMain.handle(IPC_CHANNELS.AI_PROVIDER_UPDATE, (_event, id: string, dto: UpdateAIProviderDTO) => {
    return configService.updateProvider(id, dto)
  })

  ipcMain.handle(IPC_CHANNELS.AI_PROVIDER_SET_DEFAULT, (_event, id: string) => {
    configService.setDefaultProvider(id)
  })

  ipcMain.handle(IPC_CHANNELS.AI_PROVIDER_TEST, async (_event, id: string) => {
    return testConnection(id)
  })
}
