import type {
  Transaction, CreateTransactionDTO, UpdateTransactionDTO,
  TransactionListParams, PaginatedResult, TransactionType,
  ExportConfig, ExportResult,
  Category, CreateCategoryDTO, UpdateCategoryDTO,
  Operator,
  CrossTableParams, CrossTableData,
  SummaryParams, SummaryData,
  TrendParams, TrendData,
  AIProviderView, UpdateAIProviderDTO, AITestResult,
  RecognizeRequest, RecognizeResponse,
  VerifyPINResult, ChangePINResult
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
    trend(params: TrendParams): Promise<TrendData>
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
}

declare global {
  interface Window {
    api: MonetaAPI
  }
}
