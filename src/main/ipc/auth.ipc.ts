import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import * as pinService from '../services/pin.service'

export function registerAuthHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AUTH_HAS_PIN, () => {
    return pinService.hasPIN()
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_SET_PIN, (_event, pin: string) => {
    pinService.setPIN(pin)
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_VERIFY_PIN, (_event, pin: string) => {
    return pinService.verifyPIN(pin)
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_CHANGE_PIN, (_event, currentPin: string, newPin: string) => {
    return pinService.changePIN(currentPin, newPin)
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_GET_AUTO_LOCK, () => {
    return pinService.getAutoLockMinutes()
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_SET_AUTO_LOCK, (_event, minutes: number) => {
    pinService.setAutoLockMinutes(minutes)
  })
}
