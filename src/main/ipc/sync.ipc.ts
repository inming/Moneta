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
  resetCloud
} from '../services/sync/syncEngine'
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
    return saveSyncConfig(dto)
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_CREDENTIALS_SET, (_e, dto: SetCredentialsDTO) => {
    setCredentials(dto.accessKeyId, dto.secretAccessKey)
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_CREDENTIALS_CLEAR, () => {
    clearCredentials()
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
    return setupInitial(dto.passphrase)
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_SETUP_JOIN, async (_e, dto: SetupSyncDTO) => {
    return setupJoin(dto.passphrase)
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_SETUP_ADOPT_LOCAL, async (_e, dto: SetupSyncDTO) => {
    return setupAdoptLocal(dto.passphrase)
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_RESET_CLOUD, async () => {
    return resetCloud()
  })
}
