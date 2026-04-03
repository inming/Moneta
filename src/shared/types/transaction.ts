export type TransactionType = 'expense' | 'income' | 'investment'

export interface Transaction {
  id: number
  date: string // YYYY-MM-DD
  type: TransactionType
  amount: number
  category_id: number
  description: string
  operator_id: number | null
  is_occasional: boolean
  created_at: string
  updated_at: string
}

export interface CreateTransactionDTO {
  date: string
  type: TransactionType
  amount: number
  category_id: number
  description?: string
  operator_id?: number | null
}

export interface UpdateTransactionDTO {
  date?: string
  type?: TransactionType
  amount?: number
  category_id?: number
  description?: string
  operator_id?: number | null
  is_occasional?: boolean
}

export interface TransactionListParams {
  page?: number
  pageSize?: number
  dateFrom?: string
  dateTo?: string
  type?: TransactionType
  types?: TransactionType[]
  category_id?: number
  category_ids?: number[]
  operator_id?: number
  operator_ids?: number[]
  keyword?: string
  sortField?: 'date' | 'amount' | 'created_at'
  sortOrder?: 'ascend' | 'descend'
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface ExportConfig {
  format: 'xlsx' | 'csv'
  filePath: string
  dateFrom?: string
  dateTo?: string
  types?: TransactionType[]
  category_ids?: number[]
  operator_ids?: number[]
  keyword?: string
}

export interface ExportResult {
  exported: number
  filePath: string
}
