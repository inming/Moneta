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
    yearRange: () => ipcRenderer.invoke(IPC_CHANNELS.STATS_YEAR_RANGE),
    yearlyCategory: (params: unknown) => ipcRenderer.invoke(IPC_CHANNELS.STATS_YEARLY_CATEGORY, params),
    forecast: (params: unknown) => ipcRenderer.invoke(IPC_CHANNELS.STATS_FORECAST, params)
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
  },
  mcp: {
    startServer: () => ipcRenderer.invoke(IPC_CHANNELS.MCP_START_SERVER),
    configureClaude: () => ipcRenderer.invoke(IPC_CHANNELS.MCP_CONFIGURE_CLAUDE),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_STATUS),
    getHttpConfig: () => ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_HTTP_CONFIG),
    updatePort: (port: number) => ipcRenderer.invoke(IPC_CHANNELS.MCP_UPDATE_PORT, port),
    getPaths: () => ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_PATHS),
    getImportData: () => ipcRenderer.invoke(IPC_CHANNELS.MCP_IMPORT_GET_DATA),
    clearImportData: () => ipcRenderer.invoke(IPC_CHANNELS.MCP_IMPORT_CLEAR_DATA),
    confirmImport: (transactions: unknown[]) => ipcRenderer.invoke(IPC_CHANNELS.MCP_IMPORT_CONFIRM, transactions),
    onHttpStatusChanged: (callback: (status: { running: boolean; port: number; error?: string }) => void) => {
      const handler = (_event: unknown, status: { running: boolean; port: number; error?: string }) => callback(status)
      ipcRenderer.on(IPC_CHANNELS.MCP_HTTP_STATUS_CHANGED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.MCP_HTTP_STATUS_CHANGED, handler)
      }
    },
    onImportOpen: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on(IPC_CHANNELS.MCP_IMPORT_OPEN, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.MCP_IMPORT_OPEN, handler)
      }
    }
  },
  draft: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.DRAFT_GET),
    save: (dto: unknown) => ipcRenderer.invoke(IPC_CHANNELS.DRAFT_SAVE, dto),
    delete: () => ipcRenderer.invoke(IPC_CHANNELS.DRAFT_DELETE),
    getSummary: () => ipcRenderer.invoke(IPC_CHANNELS.DRAFT_GET_SUMMARY)
  },
  i18n: {
    getLanguage: () => ipcRenderer.invoke(IPC_CHANNELS.I18N_GET_LANGUAGE),
    setLanguage: (language: string) => ipcRenderer.invoke(IPC_CHANNELS.I18N_SET_LANGUAGE, language)
  },
  theme: {
    getMode: () => ipcRenderer.invoke(IPC_CHANNELS.THEME_GET),
    setMode: (mode: import('../shared/types').ThemeMode) => ipcRenderer.invoke(IPC_CHANNELS.THEME_SET, mode)
  },
  sync: {
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_CONFIG_GET),
    saveConfig: (dto: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SYNC_CONFIG_SET, dto),
    setCredentials: (dto: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SYNC_CREDENTIALS_SET, dto),
    clearCredentials: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_CREDENTIALS_CLEAR),
    test: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_TEST),
    syncNow: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_NOW),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_STATUS),
    resolveConflict: (resolution: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SYNC_RESOLVE_CONFLICT, resolution),
    inspect: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_INSPECT),
    setupInitial: (dto: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SYNC_SETUP_INITIAL, dto),
    setupJoin: (dto: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SYNC_SETUP_JOIN, dto),
    resetCloud: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_RESET_CLOUD),
    onEvent: (
      callback: (status: import('../shared/types').SyncStatus) => void
    ): (() => void) => {
      const handler = (_event: unknown, status: import('../shared/types').SyncStatus): void =>
        callback(status)
      ipcRenderer.on(IPC_CHANNELS.SYNC_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.SYNC_EVENT, handler)
      }
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
