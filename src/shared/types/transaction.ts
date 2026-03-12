export type TransactionType = 'expense' | 'income' | 'investment'

export interface Transaction {
  id: number
  date: string // YYYY-MM-DD
  type: TransactionType
  amount: number
  category_id: number
  description: string
  operator_id: number | null
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
}

export interface TransactionListParams {
  page?: number
  pageSize?: number
  dateFrom?: string
  dateTo?: string
  type?: TransactionType
  category_id?: number
  operator_id?: number
  keyword?: string
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
