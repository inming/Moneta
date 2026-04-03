import * as fs from 'fs'
import * as XLSX from 'xlsx-js-style'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { TransactionType } from '../../shared/types'
import type { ExportRow } from '../database/repositories/transaction.repo'
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
  添加时间?: string | number
  偶发交易?: string | number
}

interface ParsedRow {
  date: string
  type: TransactionType
  amount: number
  categoryName: string
  description: string
  operatorName: string
  createdAt?: string
  isOccasional: boolean
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
const DATETIME_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

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

function parseCreatedAt(raw: string | number | undefined): string | null {
  if (raw === undefined || raw === null || raw === '') return null
  
  if (typeof raw === 'number') {
    // Excel serial date/time number — convert via XLSX utility
    const parsed = XLSX.SSF.parse_date_code(raw)
    const y = String(parsed.y).padStart(4, '0')
    const m = String(parsed.m).padStart(2, '0')
    const d = String(parsed.d).padStart(2, '0')
    const H = String(parsed.H).padStart(2, '0')
    const M = String(parsed.M).padStart(2, '0')
    const S = String(parsed.S).padStart(2, '0')
    return `${y}-${m}-${d} ${H}:${M}:${S}`
  }
  
  const trimmed = String(raw).trim()
  
  // 标准日期时间格式
  if (DATETIME_REGEX.test(trimmed)) {
    return trimmed
  }
  
  // 纯日期格式，补全时间
  if (DATE_REGEX.test(trimmed)) {
    return `${trimmed} 00:00:00`
  }
  
  return null
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
    if (!amount || amount === 0) {
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
    const createdAt = parseCreatedAt(raw['添加时间']) ?? undefined
    const isOccasional = raw['偶发交易'] === '是' || raw['偶发交易'] === 1 || raw['偶发交易'] === 'Yes'

    rows.push({ date, type, amount, categoryName, description, operatorName, createdAt, isOccasional })

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
    const dtos: transactionRepo.CreateTransactionWithTimeDTO[] = preview.rows.map((row) => ({
      date: row.date,
      type: row.type,
      amount: row.amount,
      category_id: categoryMap.get(`${row.categoryName}:${row.type}`)!,
      description: row.description,
      operator_id: row.operatorName ? (operatorMap.get(row.operatorName) ?? null) : null,
      created_at: row.createdAt,
      is_occasional: row.isOccasional
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

// ── 导出 ─────────────────────────────────────────────

const TYPE_LABEL: Record<TransactionType, string> = {
  expense: '消费',
  income: '收入',
  investment: '投资'
}

const EXPORT_HEADERS = ['日期', '类型', '金额', '分组', '描述', '操作人', '添加时间', '偶发交易']

function rowToArray(row: ExportRow): (string | number)[] {
  return [
    row.date,
    TYPE_LABEL[row.type],
    row.amount,
    row.category_name,
    row.description,
    row.operator_name,
    row.created_at,
    row.is_occasional ? '是' : ''
  ]
}

export function exportToExcel(filePath: string, rows: ExportRow[]): void {
  const aoa: (string | number)[][] = [EXPORT_HEADERS, ...rows.map(rowToArray)]
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // 表头背景色（浅蓝灰）
  const headerFill = { fgColor: { rgb: '4472C4' } }
  const headerFont = { color: { rgb: 'FFFFFF' }, bold: true }
  for (let col = 0; col < EXPORT_HEADERS.length; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col })
    if (ws[cellRef]) {
      ws[cellRef].s = { fill: headerFill, font: headerFont }
    }
  }

  // 金额列（C 列）设置千分位 + 两位小数格式
  const amountCol = 2 // 第 3 列 (0-indexed)
  for (let row = 1; row <= rows.length; row++) {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: amountCol })
    if (ws[cellRef]) {
      ws[cellRef].z = '#,##0.00'
    }
  }

  // 设置列宽
  ws['!cols'] = [
    { wch: 12 },  // 日期
    { wch: 6 },   // 类型
    { wch: 12 },  // 金额
    { wch: 10 },  // 分组
    { wch: 30 },  // 描述
    { wch: 8 },   // 操作人
    { wch: 18 },  // 添加时间
    { wch: 10 }   // 偶发交易
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'detail')
  XLSX.writeFile(wb, filePath, { bookSST: false })
}

function escapeCsvField(value: string | number): string {
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function exportToCsv(filePath: string, rows: ExportRow[]): void {
  const BOM = '\uFEFF'
  const lines: string[] = [EXPORT_HEADERS.map(escapeCsvField).join(',')]
  for (const row of rows) {
    lines.push(rowToArray(row).map(escapeCsvField).join(','))
  }
  fs.writeFileSync(filePath, BOM + lines.join('\r\n'), 'utf-8')
}
