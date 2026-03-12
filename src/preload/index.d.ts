import type {
  Transaction, CreateTransactionDTO, UpdateTransactionDTO,
  TransactionListParams, PaginatedResult, TransactionType,
  Category, CreateCategoryDTO, UpdateCategoryDTO,
  Operator,
  CrossTableParams, CrossTableData,
  SummaryParams, SummaryData,
  TrendParams, TrendData
} from '../shared/types'

export interface MonetaAPI {
  transaction: {
    list(params: TransactionListParams): Promise<PaginatedResult<Transaction>>
    create(data: CreateTransactionDTO): Promise<Transaction>
    update(id: number, data: UpdateTransactionDTO): Promise<Transaction>
    delete(id: number): Promise<void>
    batchCreate(items: CreateTransactionDTO[]): Promise<Transaction[]>
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
    executeExport(config: unknown): Promise<string>
  }
  ai: {
    recognize(imageBase64: string): Promise<unknown[]>
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
