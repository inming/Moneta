import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import {
  getSyncConfig,
  saveSyncConfig,
  setCredentials,
  clearCredentials,
  isSafeStorageAvailable
} from '../services/sync/syncStore'
import {
  getStatus,
  syncNow,
  testConnection,
  resolveConflict,
  inspectCloud,
  setupInitial,
  setupJoin,
  setupAdoptLocal,
  changePassphrase,
  resetCloud
} from '../services/sync/syncEngine'
import { restartAutoSyncTimer } from '../services/sync/scheduler'
import type {
  SaveSyncConfigDTO,
  SetCredentialsDTO,
  SetupSyncDTO,
  ConflictResolution
} from '../../shared/types'

export function registerSyncHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SYNC_CONFIG_GET, () => {
    return {
      config: getSyncConfig(),
      safeStorageAvailable: isSafeStorageAvailable()
    }
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_CONFIG_SET, (_e, dto: SaveSyncConfigDTO) => {
    const result = saveSyncConfig(dto)
    restartAutoSyncTimer()
    return result
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_CREDENTIALS_SET, (_e, dto: SetCredentialsDTO) => {
    setCredentials(dto.accessKeyId, dto.secretAccessKey)
    restartAutoSyncTimer()
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_CREDENTIALS_CLEAR, () => {
    clearCredentials()
    restartAutoSyncTimer()
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_TEST, async () => {
    return testConnection()
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_NOW, async () => {
    return syncNow()
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_STATUS, () => {
    return getStatus()
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_RESOLVE_CONFLICT, async (_e, resolution: ConflictResolution) => {
    return resolveConflict(resolution)
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_INSPECT, async () => {
    return inspectCloud()
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_SETUP_INITIAL, async (_e, dto: SetupSyncDTO) => {
    const result = await setupInitial(dto.passphrase)
    restartAutoSyncTimer()
    return result
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_SETUP_JOIN, async (_e, dto: SetupSyncDTO) => {
    const result = await setupJoin(dto.passphrase)
    restartAutoSyncTimer()
    return result
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_SETUP_ADOPT_LOCAL, async (_e, dto: SetupSyncDTO) => {
    const result = await setupAdoptLocal(dto.passphrase)
    restartAutoSyncTimer()
    return result
  })

  ipcMain.handle(
    IPC_CHANNELS.SYNC_CHANGE_PASSPHRASE,
    async (_e, dto: { oldPassphrase: string; newPassphrase: string }) => {
      return changePassphrase(dto.oldPassphrase, dto.newPassphrase)
    }
  )

  ipcMain.handle(IPC_CHANNELS.SYNC_RESET_CLOUD, async () => {
    const result = await resetCloud()
    restartAutoSyncTimer()
    return result
  })
}
