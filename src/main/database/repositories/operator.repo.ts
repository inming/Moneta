import type Database from 'better-sqlite3-multiple-ciphers'
import type { Operator } from '../../../shared/types'

interface OperatorRow {
  id: number
  name: string
  is_default: number
  created_at: string
}

function mapRow(row: OperatorRow): Operator {
  return {
    ...row,
    is_default: !!row.is_default
  }
}

export function findAll(db: Database.Database): Operator[] {
  const rows = db.prepare('SELECT * FROM operators ORDER BY id').all() as OperatorRow[]
  return rows.map(mapRow)
}

export function findByName(db: Database.Database, name: string): Operator | undefined {
  const row = db.prepare('SELECT * FROM operators WHERE name = ?').get(name) as
    | OperatorRow
    | undefined
  return row ? mapRow(row) : undefined
}

export function create(db: Database.Database, name: string): Operator {
  const result = db.prepare('INSERT INTO operators (name) VALUES (?)').run(name)
  const row = db
    .prepare('SELECT * FROM operators WHERE id = ?')
    .get(result.lastInsertRowid) as OperatorRow
  return mapRow(row)
}

export function deleteAll(db: Database.Database): void {
  db.prepare('DELETE FROM operators').run()
}

export function update(db: Database.Database, id: number, name: string): Operator {
  db.prepare('UPDATE operators SET name = ? WHERE id = ?').run(name, id)
  const row = db.prepare('SELECT * FROM operators WHERE id = ?').get(id) as OperatorRow
  return mapRow(row)
}

export function remove(db: Database.Database, id: number): void {
  const count = db
    .prepare('SELECT COUNT(*) as cnt FROM transactions WHERE operator_id = ?')
    .get(id) as { cnt: number }

  if (count.cnt > 0) {
    throw new Error('该操作人已关联交易记录，无法删除')
  }

  db.prepare('DELETE FROM operators WHERE id = ?').run(id)
}
