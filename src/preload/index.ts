import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'

const api = {
  transaction: {
    list: (params: unknown) => ipcRenderer.invoke(IPC_CHANNELS.TRANSACTION_LIST, params),
    create: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.TRANSACTION_CREATE, data),
    update: (id: number, data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.TRANSACTION_UPDATE, id, data),
    delete: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.TRANSACTION_DELETE, id),
    batchCreate: (items: unknown[]) => ipcRenderer.invoke(IPC_CHANNELS.TRANSACTION_BATCH_CREATE, items),
    batchDelete: (ids: number[]) => ipcRenderer.invoke(IPC_CHANNELS.TRANSACTION_BATCH_DELETE, ids)
  },
  category: {
    list: (type?: string) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_LIST, type),
    listAll: (type?: string) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_LIST_ALL, type),
    create: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_CREATE, data),
    update: (id: number, data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_UPDATE, id, data),
    delete: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_DELETE, id),
    reorder: (type: string, ids: number[]) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_REORDER, type, ids)
  },
  operator: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.OPERATOR_LIST),
    create: (name: string) => ipcRenderer.invoke(IPC_CHANNELS.OPERATOR_CREATE, name),
    update: (id: number, name: string) => ipcRenderer.invoke(IPC_CHANNELS.OPERATOR_UPDATE, id, name),
    delete: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.OPERATOR_DELETE, id)
  },
  stats: {
    crossTable: (params: unknown) => ipcRenderer.invoke(IPC_CHANNELS.STATS_CROSS_TABLE, params),
    summary: (params: unknown) => ipcRenderer.invoke(IPC_CHANNELS.STATS_SUMMARY, params),
    yearRange: () => ipcRenderer.invoke(IPC_CHANNELS.STATS_YEAR_RANGE)
  },
  importExport: {
    preview: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.IMPORT_PREVIEW, filePath),
    executeImport: (config: unknown) => ipcRenderer.invoke(IPC_CHANNELS.IMPORT_EXECUTE, config),
    executeExport: (config: unknown) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_EXECUTE, config),
    exportCount: (params: unknown) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_COUNT, params)
  },
  data: {
    clearTransactions: () => ipcRenderer.invoke(IPC_CHANNELS.DATA_CLEAR_TRANSACTIONS),
    factoryReset: () => ipcRenderer.invoke(IPC_CHANNELS.DATA_FACTORY_RESET)
  },
  aiProvider: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.AI_PROVIDER_LIST),
    update: (id: string, dto: unknown) => ipcRenderer.invoke(IPC_CHANNELS.AI_PROVIDER_UPDATE, id, dto),
    setDefault: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_PROVIDER_SET_DEFAULT, id),
    test: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_PROVIDER_TEST, id)
  },
  ai: {
    recognize: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.AI_RECOGNIZE, request),
    abortRecognize: () => ipcRenderer.invoke(IPC_CHANNELS.AI_RECOGNIZE_ABORT),
    getLogs: () => ipcRenderer.invoke(IPC_CHANNELS.AI_RECOGNIZE_LOGS),
    getPromptPreview: () => ipcRenderer.invoke(IPC_CHANNELS.AI_PROMPT_PREVIEW)
  },
  auth: {
    hasPIN: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_HAS_PIN),
    setPIN: (pin: string) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_SET_PIN, pin),
    verifyPIN: (pin: string) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_VERIFY_PIN, pin),
    changePIN: (currentPin: string, newPin: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_CHANGE_PIN, currentPin, newPin),
    getAutoLockMinutes: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_AUTO_LOCK),
    setAutoLockMinutes: (minutes: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_SET_AUTO_LOCK, minutes)
  },
  dialog: {
    openFile: (filters: unknown[]) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, filters),
    saveFile: (filters: unknown[], defaultName: string) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SAVE_FILE, filters, defaultName)
  }
}

contextBridge.exposeInMainWorld('api', api)
