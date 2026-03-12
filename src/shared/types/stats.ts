import type { TransactionType } from './transaction'

export interface CrossTableParams {
  year: number
  type: TransactionType
  operator_id?: number
}

export interface CrossTableRow {
  category_id: number
  category_name: string
  months: number[] // 12 个月的金额
  quarters: number[] // 4 个季度的金额
  yearly: number // 年度汇总
}

export interface CrossTableData {
  rows: CrossTableRow[]
  totals: {
    months: number[]
    quarters: number[]
    yearly: number
  }
}

export interface SummaryParams {
  year: number
  month: number
  operator_id?: number
}

export interface SummaryData {
  currentMonthExpense: number
  currentMonthIncome: number
  lastMonthExpense: number
  lastMonthIncome: number
  yearExpense: number
  yearIncome: number
}

export interface TrendParams {
  year: number
  operator_id?: number
}

export interface TrendData {
  months: string[]
  expense: number[]
  income: number[]
}
