import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { loadConfig, saveConfig } from '../services/config.service'

export function setupI18nHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.I18N_GET_LANGUAGE, () => {
    const config = loadConfig()
    return config.language || 'zh-CN'
  })

  ipcMain.handle(IPC_CHANNELS.I18N_SET_LANGUAGE, (_event, language: string) => {
    const config = loadConfig()
    config.language = language
    saveConfig(config)
    return language
  })
}
