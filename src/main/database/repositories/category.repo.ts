import type Database from 'better-sqlite3'
import type { Category, CreateCategoryDTO, UpdateCategoryDTO, TransactionType } from '../../../shared/types'

interface CategoryRow {
  id: number
  name: string
  type: string
  icon: string | null
  description: string
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

export function findAllIncludeInactive(db: Database.Database, type?: TransactionType): Category[] {
  const sql = type
    ? 'SELECT * FROM categories WHERE type = ? ORDER BY sort_order'
    : 'SELECT * FROM categories ORDER BY type, sort_order'

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
      `INSERT INTO categories (name, type, icon, description, sort_order, is_system)
       VALUES (?, ?, ?, ?, ?, 0)`
    )
    .run(dto.name, dto.type, dto.icon ?? null, dto.description ?? '', dto.sort_order ?? 0)

  const row = db
    .prepare('SELECT * FROM categories WHERE id = ?')
    .get(result.lastInsertRowid) as CategoryRow

  return mapRow(row)
}

export function update(db: Database.Database, id: number, dto: UpdateCategoryDTO): Category {
  const sets: string[] = []
  const params: unknown[] = []

  if (dto.name !== undefined) {
    sets.push('name = ?')
    params.push(dto.name)
  }
  if (dto.icon !== undefined) {
    sets.push('icon = ?')
    params.push(dto.icon)
  }
  if (dto.description !== undefined) {
    sets.push('description = ?')
    params.push(dto.description)
  }
  if (dto.is_active !== undefined) {
    sets.push('is_active = ?')
    params.push(dto.is_active ? 1 : 0)
  }
  if (dto.sort_order !== undefined) {
    sets.push('sort_order = ?')
    params.push(dto.sort_order)
  }

  if (sets.length === 0) {
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow
    return mapRow(row)
  }

  sets.push("updated_at = datetime('now', 'localtime')")
  params.push(id)

  db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).run(...params)

  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow
  return mapRow(row)
}

export function remove(db: Database.Database, id: number): { softDeleted: boolean } {
  const count = db
    .prepare('SELECT COUNT(*) as cnt FROM transactions WHERE category_id = ?')
    .get(id) as { cnt: number }

  if (count.cnt > 0) {
    db.prepare("UPDATE categories SET is_active = 0, updated_at = datetime('now', 'localtime') WHERE id = ?").run(id)
    return { softDeleted: true }
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(id)
  return { softDeleted: false }
}

export function reorder(db: Database.Database, type: TransactionType, ids: number[]): void {
  const stmt = db.prepare('UPDATE categories SET sort_order = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ? AND type = ?')
  const run = db.transaction(() => {
    for (let i = 0; i < ids.length; i++) {
      stmt.run(i + 1, ids[i], type)
    }
  })
  run()
}
