import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { MonetaAPI } from './moneta-api'

/**
 * window.api 适配层：保持与旧 Electron preload 完全一致的 API 形状，
 * 内部转为 Tauri invoke / event。渲染层业务代码零改动。
 */

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args)
  } catch (e) {
    // Rust 端 AppError 序列化为 { code, message }；统一包回 Error 保持
    // 渲染层 err.message 用法不变
    if (typeof e === 'string') throw new Error(e)
    const err = e as { message?: string; code?: string }
    throw new Error(err.message ?? String(e))
  }
}

/** 把 Tauri 的异步 unlisten 封装成 preload 风格的同步取消函数 */
function subscribe<T>(event: string, callback: (payload: T) => void): () => void {
  const unlisten = listen<T>(event, (e) => callback(e.payload))
  return () => {
    void unlisten.then((fn) => fn())
  }
}

export function buildApi(): MonetaAPI {
  return {
    app: {
      bootstrapStatus: () => call('app_bootstrap_status'),
      retryMigration: () => call('app_retry_migration')
    },
    transaction: {
      list: (params) => call('transaction_list', { params }),
      create: (data) => call('transaction_create', { data }),
      update: (id, data) => call('transaction_update', { id, data }),
      delete: (id) => call('transaction_delete', { id }),
      batchCreate: (items) => call('transaction_batch_create', { items }),
      batchDelete: (ids) => call('transaction_batch_delete', { ids })
    },
    category: {
      list: (type) => call('category_list', { categoryType: type ?? null }),
      listAll: (type) => call('category_list_all', { categoryType: type ?? null }),
      create: (data) => call('category_create', { data }),
      update: (id, data) => call('category_update', { id, data }),
      delete: (id) => call('category_delete', { id }),
      reorder: (type, ids) => call('category_reorder', { categoryType: type, ids })
    },
    operator: {
      list: () => call('operator_list'),
      create: (name) => call('operator_create', { name }),
      update: (id, name) => call('operator_update', { id, name }),
      delete: (id) => call('operator_delete', { id })
    },
    stats: {
      crossTable: (params) => call('stats_cross_table', { params }),
      summary: (params) => call('stats_summary', { params }),
      yearRange: () => call('stats_year_range'),
      yearlyCategory: (params) => call('stats_yearly_category', { params }),
      forecast: (params) => call('stats_forecast', { params })
    },
    importExport: {
      // xlsx 解析/生成在渲染层完成（excel.ts），文件字节经 file_read/file_write
      preview: async (filePath: string) => {
        const { parseExcelBytes } = await import('./excel')
        const bytes = await invoke<ArrayBuffer>('file_read', { path: filePath })
        return parseExcelBytes(bytes)
      },
      executeImport: async (filePath: unknown) => {
        const { parseExcelBytes } = await import('./excel')
        const bytes = await invoke<ArrayBuffer>('file_read', { path: filePath as string })
        const preview = parseExcelBytes(bytes)
        return call('import_execute', {
          preview: {
            rows: preview.rows,
            uniqueOperators: preview.uniqueOperators,
            uniqueCategories: preview.uniqueCategories
          }
        })
      },
      executeExport: async (config) => {
        const { buildXlsxBytes, buildCsvBytes } = await import('./excel')
        type ExportRowData = import('./excel').ExportRowData
        const rows = await call<ExportRowData[]>('export_query', { params: config })
        const bytes = config.format === 'csv' ? buildCsvBytes(rows) : buildXlsxBytes(rows)
        await call('file_write', { path: config.filePath, contents: Array.from(bytes) })
        return { exported: rows.length, filePath: config.filePath }
      },
      exportCount: (params) => call('export_count', { params })
    },
    data: {
      clearTransactions: () => call('data_clear_transactions'),
      factoryReset: () => call('data_factory_reset')
    },
    auth: {
      hasPIN: () => call('auth_has_pin'),
      setPIN: (pin) => call('auth_set_pin', { pin }),
      verifyPIN: (pin) => call('auth_verify_pin', { pin }),
      changePIN: (currentPin, newPin) => call('auth_change_pin', { currentPin, newPin }),
      getAutoLockMinutes: () => call('auth_get_auto_lock'),
      setAutoLockMinutes: (minutes) => call('auth_set_auto_lock', { minutes })
    },
    dialog: {
      openFile: (filters) => call('dialog_open_file', { filters }),
      saveFile: (filters, defaultName) => call('dialog_save_file', { filters, defaultName })
    },
    mcp: {
      startServer: () => call('mcp_start_server'),
      configureClaude: () => call('mcp_configure_claude'),
      getStatus: () => call('mcp_get_status'),
      getHttpConfig: () => call('mcp_get_http_config'),
      updatePort: (port) => call('mcp_update_port', { port }),
      getPaths: () => call('mcp_get_paths'),
      getImportData: () => call('mcp_import_get_data'),
      clearImportData: () => call('mcp_import_clear_data'),
      confirmImport: (transactions) => call('mcp_import_confirm', { transactions }),
      onHttpStatusChanged: (callback) => subscribe('mcp:http-status-changed', callback),
      onImportOpen: (callback) => subscribe<void>('mcp:import-open', () => callback())
    },
    draft: {
      get: () => call('draft_get'),
      save: (dto) => call('draft_save', { dto }),
      delete: () => call('draft_delete'),
      getSummary: () => call('draft_get_summary')
    },
    i18n: {
      getLanguage: () => call('i18n_get_language'),
      setLanguage: (language) => call('i18n_set_language', { language })
    },
    theme: {
      getMode: () => call('theme_get'),
      setMode: (mode) => call('theme_set', { mode })
    },
    sync: {
      getConfig: () => call('sync_config_get'),
      saveConfig: (dto) => call('sync_config_set', { dto }),
      setCredentials: (dto) => call('sync_credentials_set', { dto }),
      clearCredentials: () => call('sync_credentials_clear'),
      test: () => call('sync_test'),
      syncNow: () => call('sync_now'),
      getStatus: () => call('sync_status'),
      resolveConflict: (resolution) => call('sync_resolve_conflict', { resolution }),
      inspect: () => call('sync_inspect'),
      setupInitial: (dto) => call('sync_setup_initial', { dto }),
      setupJoin: (dto) => call('sync_setup_join', { dto }),
      setupAdoptLocal: (dto) => call('sync_setup_adopt_local', { dto }),
      changePassphrase: (dto) => call('sync_change_passphrase', { dto }),
      resetCloud: () => call('sync_reset_cloud'),
      onEvent: (callback) => subscribe('sync:event', callback)
    }
  }
}
