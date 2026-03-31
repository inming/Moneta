import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { ThemeMode } from '../../shared/types'
import { getTheme, setTheme } from '../services/config.service'

export function registerThemeIPC(): void {
  ipcMain.handle(IPC_CHANNELS.THEME_GET, () => {
    return getTheme()
  })

  ipcMain.handle(IPC_CHANNELS.THEME_SET, (_event, theme: ThemeMode) => {
    setTheme(theme)
  })
}
