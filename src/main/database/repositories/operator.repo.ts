import type Database from 'better-sqlite3'
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
