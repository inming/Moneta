import type { TransactionType } from '../types/transaction'

export interface TransactionTypeConfig {
  label: string
  color: string
  tagColor: string
}

export const TRANSACTION_TYPE_CONFIG: Record<TransactionType, TransactionTypeConfig> = {
  expense: { label: '消费', color: 'red', tagColor: 'orange' },
  income: { label: '收入', color: 'green', tagColor: 'green' },
  investment: { label: '投资', color: 'blue', tagColor: 'blue' }
}
