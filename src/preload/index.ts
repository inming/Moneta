import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'

const api = {
  transaction: {
    list: (params: unknown) => ipcRenderer.invoke(IPC_CHANNELS.TRANSACTION_LIST, params),
    create: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.TRANSACTION_CREATE, data),
    update: (id: number, data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.TRANSACTION_UPDATE, id, data),
    delete: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.TRANSACTION_DELETE, id),
    batchCreate: (items: unknown[]) => ipcRenderer.invoke(IPC_CHANNELS.TRANSACTION_BATCH_CREATE, items)
  },
  category: {
    list: (type?: string) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_LIST, type),
    create: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_CREATE, data),
    update: (id: number, data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_UPDATE, id, data),
    delete: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_DELETE, id),
    reorder: (ids: number[]) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_REORDER, ids)
  },
  operator: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.OPERATOR_LIST),
    create: (name: string) => ipcRenderer.invoke(IPC_CHANNELS.OPERATOR_CREATE, name)
  },
  stats: {
    crossTable: (params: unknown) => ipcRenderer.invoke(IPC_CHANNELS.STATS_CROSS_TABLE, params),
    summary: (params: unknown) => ipcRenderer.invoke(IPC_CHANNELS.STATS_SUMMARY, params),
    trend: (params: unknown) => ipcRenderer.invoke(IPC_CHANNELS.STATS_TREND, params)
  },
  importExport: {
    preview: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.IMPORT_PREVIEW, filePath),
    executeImport: (config: unknown) => ipcRenderer.invoke(IPC_CHANNELS.IMPORT_EXECUTE, config),
    executeExport: (config: unknown) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_EXECUTE, config)
  },
  ai: {
    recognize: (imageBase64: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_RECOGNIZE, imageBase64)
  },
  dialog: {
    openFile: (filters: unknown[]) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, filters),
    saveFile: (filters: unknown[], defaultName: string) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SAVE_FILE, filters, defaultName)
  }
}

contextBridge.exposeInMainWorld('api', api)
