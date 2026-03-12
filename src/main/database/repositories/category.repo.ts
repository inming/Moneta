import type Database from 'better-sqlite3'
import type { Category, CreateCategoryDTO, TransactionType } from '../../../shared/types'

interface CategoryRow {
  id: number
  name: string
  type: string
  icon: string | null
  sort_order: number
  is_system: number
  is_active: number
  created_at: string
  updated_at: string
}

function mapRow(row: CategoryRow): Category {
  return {
    ...row,
    type: row.type as TransactionType,
    is_system: !!row.is_system,
    is_active: !!row.is_active
  }
}

export function findAll(db: Database.Database, type?: TransactionType): Category[] {
  const sql = type
    ? 'SELECT * FROM categories WHERE is_active = 1 AND type = ? ORDER BY sort_order'
    : 'SELECT * FROM categories WHERE is_active = 1 ORDER BY type, sort_order'

  const rows = type
    ? (db.prepare(sql).all(type) as CategoryRow[])
    : (db.prepare(sql).all() as CategoryRow[])

  return rows.map(mapRow)
}

export function findByNameAndType(
  db: Database.Database,
  name: string,
  type: TransactionType
): Category | undefined {
  const row = db
    .prepare('SELECT * FROM categories WHERE name = ? AND type = ?')
    .get(name, type) as CategoryRow | undefined

  return row ? mapRow(row) : undefined
}

export function create(db: Database.Database, dto: CreateCategoryDTO): Category {
  const result = db
    .prepare(
      `INSERT INTO categories (name, type, icon, sort_order, is_system)
       VALUES (?, ?, ?, ?, 0)`
    )
    .run(dto.name, dto.type, dto.icon ?? null, dto.sort_order ?? 0)

  const row = db
    .prepare('SELECT * FROM categories WHERE id = ?')
    .get(result.lastInsertRowid) as CategoryRow

  return mapRow(row)
}
