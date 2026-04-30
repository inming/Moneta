import type {
  Transaction, CreateTransactionDTO, UpdateTransactionDTO,
  TransactionListParams, PaginatedResult, TransactionType,
  ExportConfig, ExportResult,
  Category, CreateCategoryDTO, UpdateCategoryDTO,
  Operator,
  CrossTableParams, CrossTableData,
  SummaryParams, SummaryData,
  YearRangeData, YearlyCategoryParams, YearlyCategoryData,
  ForecastParams, ForecastResult,
  AIProviderView, UpdateAIProviderDTO, AITestResult,
  RecognizeRequest, RecognizeResponse,
  VerifyPINResult, ChangePINResult,
  ImportDraft, DraftSummary, SaveDraftDTO,
  ThemeMode,
  SyncConfig, SaveSyncConfigDTO, SetCredentialsDTO, SetupSyncDTO,
  SyncTestResult, SyncStatus, SyncRunResult, ConflictResolution,
  SyncCloudInspect
} from '../shared/types'

export interface MonetaAPI {
  transaction: {
    list(params: TransactionListParams): Promise<PaginatedResult<Transaction>>
    create(data: CreateTransactionDTO): Promise<Transaction>
    update(id: number, data: UpdateTransactionDTO): Promise<Transaction>
    delete(id: number): Promise<void>
    batchCreate(items: CreateTransactionDTO[]): Promise<Transaction[]>
    batchDelete(ids: number[]): Promise<{ count: number }>
  }
  category: {
    list(type?: TransactionType): Promise<Category[]>
    listAll(type?: TransactionType): Promise<Category[]>
    create(data: CreateCategoryDTO): Promise<Category>
    update(id: number, data: UpdateCategoryDTO): Promise<Category>
    delete(id: number): Promise<{ softDeleted: boolean }>
    reorder(type: TransactionType, ids: number[]): Promise<void>
  }
  operator: {
    list(): Promise<Operator[]>
    create(name: string): Promise<Operator>
    update(id: number, name: string): Promise<Operator>
    delete(id: number): Promise<void>
  }
  stats: {
    crossTable(params: CrossTableParams): Promise<CrossTableData>
    summary(params: SummaryParams): Promise<SummaryData>
    yearRange(): Promise<YearRangeData>
    yearlyCategory(params: YearlyCategoryParams): Promise<YearlyCategoryData>
    forecast(params: ForecastParams): Promise<ForecastResult>
  }
  importExport: {
    preview(filePath: string): Promise<unknown>
    executeImport(config: unknown): Promise<unknown>
    executeExport(config: ExportConfig): Promise<ExportResult>
    exportCount(params: TransactionListParams): Promise<number>
  }
  data: {
    clearTransactions(): Promise<void>
    factoryReset(): Promise<void>
  }
  aiProvider: {
    list(): Promise<AIProviderView[]>
    update(id: string, dto: UpdateAIProviderDTO): Promise<AIProviderView>
    setDefault(id: string): Promise<void>
    test(id: string): Promise<AITestResult>
  }
  ai: {
    recognize(request: RecognizeRequest): Promise<RecognizeResponse>
    abortRecognize(): Promise<void>
    getLogs(): Promise<string[]>
    getPromptPreview(): Promise<string>
  }
  auth: {
    hasPIN(): Promise<boolean>
    setPIN(pin: string): Promise<void>
    verifyPIN(pin: string): Promise<VerifyPINResult>
    changePIN(currentPin: string, newPin: string): Promise<ChangePINResult>
    getAutoLockMinutes(): Promise<number>
    setAutoLockMinutes(minutes: number): Promise<void>
  }
  dialog: {
    openFile(filters: unknown[]): Promise<string | null>
    saveFile(filters: unknown[], defaultName: string): Promise<string | null>
  }
  mcp: {
    startServer(): Promise<{ success: boolean; message: string; needsRestart: boolean }>
    configureClaude(): Promise<{ success: boolean; message: string; needsRestart: boolean }>
    getStatus(): Promise<{ configured: boolean; serverRunning: boolean; port: number; serverError?: string }>
    getHttpConfig(): Promise<{ port: number }>
    updatePort(port: number): Promise<{ success: boolean; message: string }>
    getPaths(): Promise<{ claudeConfigPath: string; mcpServerPath: string }>
    getImportData(): Promise<{ transactions: unknown[]; source: string } | null>
    clearImportData(): Promise<{ success: boolean }>
    confirmImport(transactions: unknown[]): Promise<{ success: boolean; count?: number; error?: string }>
    onHttpStatusChanged(callback: (status: { running: boolean; port: number; error?: string }) => void): () => void
    onImportOpen(callback: () => void): () => void
  }
  draft: {
    get(): Promise<ImportDraft | undefined>
    save(dto: SaveDraftDTO): Promise<ImportDraft>
    delete(): Promise<void>
    getSummary(): Promise<DraftSummary>
  }
  i18n: {
    getLanguage(): Promise<string>
    setLanguage(language: string): Promise<string>
  }
  theme: {
    getMode(): Promise<ThemeMode>
    setMode(mode: ThemeMode): Promise<void>
  }
  sync: {
    getConfig(): Promise<{ config: SyncConfig; safeStorageAvailable: boolean }>
    saveConfig(dto: SaveSyncConfigDTO): Promise<SyncConfig>
    setCredentials(dto: SetCredentialsDTO): Promise<{ ok: boolean }>
    clearCredentials(): Promise<{ ok: boolean }>
    test(): Promise<SyncTestResult>
    syncNow(): Promise<SyncRunResult>
    getStatus(): Promise<SyncStatus>
    resolveConflict(resolution: ConflictResolution): Promise<SyncRunResult>
    inspect(): Promise<SyncCloudInspect>
    setupInitial(dto: SetupSyncDTO): Promise<SyncRunResult>
    setupJoin(dto: SetupSyncDTO): Promise<SyncRunResult>
    setupAdoptLocal(dto: SetupSyncDTO): Promise<SyncRunResult>
    changePassphrase(dto: {
      oldPassphrase: string
      newPassphrase: string
    }): Promise<{ ok: boolean; message: string; error?: string }>
    resetCloud(): Promise<{ ok: boolean; message: string }>
    onEvent(callback: (status: SyncStatus) => void): () => void
  }
}

declare global {
  interface Window {
    api: MonetaAPI
  }
}
