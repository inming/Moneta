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
  yearly: number // 年度汇总
}

export interface CrossTableData {
  rows: CrossTableRow[]
  totals: {
    months: number[]
    yearly: number
  }
}

export interface SummaryParams {
  year: number
  month: number
  type: TransactionType
  operator_id?: number
}

export interface SummaryData {
  currentMonth: number
  lastMonth: number
  yearTotal: number
}

export interface YearRangeData {
  minYear: number
  maxYear: number
}
