import * as XLSX from 'xlsx'
import type Database from 'better-sqlite3'
import type { TransactionType, CreateTransactionDTO } from '../../shared/types'
import * as categoryRepo from '../database/repositories/category.repo'
import * as operatorRepo from '../database/repositories/operator.repo'
import * as transactionRepo from '../database/repositories/transaction.repo'

interface ExcelRow {
  日期: string | number
  类型: string
  金额: number
  分组: string
  描述?: string
  操作人?: string
}

interface ParsedRow {
  date: string
  type: TransactionType
  amount: number
  categoryName: string
  description: string
  operatorName: string
}

export interface PreviewResult {
  rows: ParsedRow[]
  uniqueOperators: string[]
  uniqueCategories: { name: string; type: TransactionType }[]
  rowCount: number
  errors: string[]
}

export interface ImportResult {
  imported: number
  operatorsCreated: number
  categoriesCreated: number
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function normalizeDate(raw: string | number): string {
  if (typeof raw === 'number') {
    // Excel serial date number — convert via XLSX utility
    const parsed = XLSX.SSF.parse_date_code(raw)
    const y = String(parsed.y).padStart(4, '0')
    const m = String(parsed.m).padStart(2, '0')
    const d = String(parsed.d).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(raw).trim()
}

function mapType(raw: string): TransactionType | null {
  const trimmed = raw.trim()
  if (trimmed === '消费') return 'expense'
  if (trimmed === '收入') return 'income'
  if (trimmed === '投资') return 'investment'
  return null
}

export function parseExcel(filePath: string): PreviewResult {
  const workbook = XLSX.readFile(filePath)
  const sheet = workbook.Sheets['detail']
  if (!sheet) {
    throw new Error('未找到名为 "detail" 的工作表')
  }

  const rawRows = XLSX.utils.sheet_to_json<ExcelRow>(sheet)
  const rows: ParsedRow[] = []
  const errors: string[] = []
  const operatorSet = new Set<string>()
  const categorySet = new Map<string, TransactionType>()

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i]
    const rowNum = i + 2 // Excel row number (1-based header + 1)

    // Validate date
    const date = normalizeDate(raw['日期'])
    if (!DATE_REGEX.test(date)) {
      errors.push(`第 ${rowNum} 行：日期格式无效 "${raw['日期']}"`)
      continue
    }

    // Validate type
    const type = mapType(String(raw['类型'] ?? ''))
    if (!type) {
      errors.push(`第 ${rowNum} 行：类型无效 "${raw['类型']}"`)
      continue
    }

    // Validate amount
    const amount = Number(raw['金额'])
    if (!amount || amount <= 0) {
      errors.push(`第 ${rowNum} 行：金额无效 "${raw['金额']}"`)
      continue
    }

    // Validate category
    const categoryName = String(raw['分组'] ?? '').trim()
    if (!categoryName) {
      errors.push(`第 ${rowNum} 行：分组为空`)
      continue
    }

    const description = String(raw['描述'] ?? '').trim()
    const operatorName = String(raw['操作人'] ?? '').trim()

    rows.push({ date, type, amount, categoryName, description, operatorName })

    if (operatorName) operatorSet.add(operatorName)
    categorySet.set(`${categoryName}:${type}`, type)
  }

  const uniqueCategories = Array.from(categorySet.entries()).map(([key, type]) => ({
    name: key.split(':')[0],
    type
  }))

  return {
    rows,
    uniqueOperators: Array.from(operatorSet),
    uniqueCategories,
    rowCount: rows.length,
    errors
  }
}

export function executeImport(db: Database.Database, preview: PreviewResult): ImportResult {
  let operatorsCreated = 0
  let categoriesCreated = 0

  const doImport = db.transaction(() => {
    // Step 1: Clear transactions (FK to categories/operators)
    transactionRepo.deleteAll(db)

    // Step 2: Clear operators
    operatorRepo.deleteAll(db)

    // Step 3: Create operators, build name→id map
    const operatorMap = new Map<string, number>()
    for (const name of preview.uniqueOperators) {
      const op = operatorRepo.create(db, name)
      operatorMap.set(name, op.id)
      operatorsCreated++
    }

    // Step 4: Resolve categories, build "name:type"→id map
    const categoryMap = new Map<string, number>()
    for (const cat of preview.uniqueCategories) {
      const key = `${cat.name}:${cat.type}`
      const existing = categoryRepo.findByNameAndType(db, cat.name, cat.type)
      if (existing) {
        categoryMap.set(key, existing.id)
      } else {
        const created = categoryRepo.create(db, { name: cat.name, type: cat.type })
        categoryMap.set(key, created.id)
        categoriesCreated++
      }
    }

    // Step 5: Build DTOs
    const dtos: CreateTransactionDTO[] = preview.rows.map((row) => ({
      date: row.date,
      type: row.type,
      amount: row.amount,
      category_id: categoryMap.get(`${row.categoryName}:${row.type}`)!,
      description: row.description,
      operator_id: row.operatorName ? (operatorMap.get(row.operatorName) ?? null) : null
    }))

    // Step 6: Batch insert
    transactionRepo.batchCreate(db, dtos)
  })

  doImport()

  return {
    imported: preview.rows.length,
    operatorsCreated,
    categoriesCreated
  }
}
