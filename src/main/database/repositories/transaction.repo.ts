import type Database from 'better-sqlite3'
import type {
  Transaction,
  TransactionType,
  CreateTransactionDTO,
  UpdateTransactionDTO,
  TransactionListParams,
  PaginatedResult
} from '../../../shared/types'

export interface ExportRow {
  date: string
  type: TransactionType
  amount: number
  category_name: string
  description: string
  operator_name: string
}

function buildWhereClause(params: TransactionListParams): { where: string; values: unknown[] } {
  const conditions: string[] = []
  const values: unknown[] = []

  if (params.dateFrom) {
    conditions.push('t.date >= ?')
    values.push(params.dateFrom)
  }
  if (params.dateTo) {
    conditions.push('t.date <= ?')
    values.push(params.dateTo)
  }
  if (params.types && params.types.length > 0) {
    const placeholders = params.types.map(() => '?').join(',')
    conditions.push(`t.type IN (${placeholders})`)
    values.push(...params.types)
  } else if (params.type) {
    conditions.push('t.type = ?')
    values.push(params.type)
  }
  if (params.category_ids && params.category_ids.length > 0) {
    const placeholders = params.category_ids.map(() => '?').join(',')
    conditions.push(`t.category_id IN (${placeholders})`)
    values.push(...params.category_ids)
  } else if (params.category_id) {
    conditions.push('t.category_id = ?')
    values.push(params.category_id)
  }
  if (params.operator_ids && params.operator_ids.length > 0) {
    const placeholders = params.operator_ids.map(() => '?').join(',')
    conditions.push(`t.operator_id IN (${placeholders})`)
    values.push(...params.operator_ids)
  } else if (params.operator_id) {
    conditions.push('t.operator_id = ?')
    values.push(params.operator_id)
  }
  if (params.keyword) {
    conditions.push('t.description LIKE ?')
    values.push(`%${params.keyword}%`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return { where, values }
}

export function findAll(
  db: Database.Database,
  params: TransactionListParams
): PaginatedResult<Transaction> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 50

  const { where, values } = buildWhereClause(params)

  // Dynamic ORDER BY
  const allowedSortFields = { date: 'date', amount: 'amount' }
  const sortCol = params.sortField && allowedSortFields[params.sortField]
    ? allowedSortFields[params.sortField]
    : 'date'
  const sortDir = params.sortOrder === 'ascend' ? 'ASC' : 'DESC'
  const orderBy = `ORDER BY ${sortCol} ${sortDir}, id DESC`

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM transactions t ${where}`)
    .get(...values) as { total: number }

  const items = db
    .prepare(
      `SELECT t.* FROM transactions t ${where} ${orderBy} LIMIT ? OFFSET ?`
    )
    .all(...values, pageSize, (page - 1) * pageSize) as Transaction[]

  return {
    items,
    total: countRow.total,
    page,
    pageSize
  }
}

export function countForExport(
  db: Database.Database,
  params: TransactionListParams
): number {
  const { where, values } = buildWhereClause(params)
  const row = db
    .prepare(`SELECT COUNT(*) as total FROM transactions t ${where}`)
    .get(...values) as { total: number }
  return row.total
}

export function findAllForExport(
  db: Database.Database,
  params: TransactionListParams
): ExportRow[] {
  const { where, values } = buildWhereClause(params)

  return db
    .prepare(
      `SELECT t.date, t.type, t.amount, c.name as category_name,
              t.description, COALESCE(o.name, '') as operator_name
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN operators o ON t.operator_id = o.id
       ${where}
       ORDER BY t.date ASC, t.id ASC`
    )
    .all(...values) as ExportRow[]
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

export function create(db: Database.Database, dto: CreateTransactionDTO): Transaction {
  const result = db
    .prepare(
      `INSERT INTO transactions (date, type, amount, category_id, description, operator_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      dto.date,
      dto.type,
      dto.amount,
      dto.category_id,
      dto.description ?? '',
      dto.operator_id ?? null
    )

  return db
    .prepare('SELECT * FROM transactions WHERE id = ?')
    .get(result.lastInsertRowid) as Transaction
}

export function update(db: Database.Database, id: number, dto: UpdateTransactionDTO): Transaction {
  const sets: string[] = []
  const params: unknown[] = []

  if (dto.date !== undefined) {
    sets.push('date = ?')
    params.push(dto.date)
  }
  if (dto.type !== undefined) {
    sets.push('type = ?')
    params.push(dto.type)
  }
  if (dto.amount !== undefined) {
    sets.push('amount = ?')
    params.push(dto.amount)
  }
  if (dto.category_id !== undefined) {
    sets.push('category_id = ?')
    params.push(dto.category_id)
  }
  if (dto.description !== undefined) {
    sets.push('description = ?')
    params.push(dto.description)
  }
  if (dto.operator_id !== undefined) {
    sets.push('operator_id = ?')
    params.push(dto.operator_id)
  }

  if (sets.length === 0) {
    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Transaction
  }

  sets.push("updated_at = datetime('now', 'localtime')")
  params.push(id)

  db.prepare(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`).run(...params)

  return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Transaction
}

export function remove(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM transactions WHERE id = ?').run(id)
}

export function batchDelete(db: Database.Database, ids: number[]): number {
  if (ids.length === 0) return 0

  const placeholders = ids.map(() => '?').join(',')
  const run = db.transaction(() => {
    return db.prepare(`DELETE FROM transactions WHERE id IN (${placeholders})`).run(...ids)
  })

  return run().changes
}

export function deleteAll(db: Database.Database): void {
  db.prepare('DELETE FROM transactions').run()
}
