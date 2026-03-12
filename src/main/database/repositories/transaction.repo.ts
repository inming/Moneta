import type Database from 'better-sqlite3'
import type {
  Transaction,
  CreateTransactionDTO,
  TransactionListParams,
  PaginatedResult
} from '../../../shared/types'

export function findAll(
  db: Database.Database,
  params: TransactionListParams
): PaginatedResult<Transaction> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 50

  const conditions: string[] = []
  const values: unknown[] = []

  if (params.dateFrom) {
    conditions.push('date >= ?')
    values.push(params.dateFrom)
  }
  if (params.dateTo) {
    conditions.push('date <= ?')
    values.push(params.dateTo)
  }
  if (params.type) {
    conditions.push('type = ?')
    values.push(params.type)
  }
  if (params.category_id) {
    conditions.push('category_id = ?')
    values.push(params.category_id)
  }
  if (params.operator_id) {
    conditions.push('operator_id = ?')
    values.push(params.operator_id)
  }
  if (params.keyword) {
    conditions.push('description LIKE ?')
    values.push(`%${params.keyword}%`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM transactions ${where}`)
    .get(...values) as { total: number }

  const items = db
    .prepare(
      `SELECT * FROM transactions ${where} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(...values, pageSize, (page - 1) * pageSize) as Transaction[]

  return {
    items,
    total: countRow.total,
    page,
    pageSize
  }
}

export function batchCreate(db: Database.Database, items: CreateTransactionDTO[]): void {
  const stmt = db.prepare(
    `INSERT INTO transactions (date, type, amount, category_id, description, operator_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  )

  const insertAll = db.transaction(() => {
    for (const item of items) {
      stmt.run(
        item.date,
        item.type,
        item.amount,
        item.category_id,
        item.description ?? '',
        item.operator_id ?? null
      )
    }
  })

  insertAll()
}

export function deleteAll(db: Database.Database): void {
  db.prepare('DELETE FROM transactions').run()
}
