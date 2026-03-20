import type Database from 'better-sqlite3'
import type { ImportDraft, DraftSummary, SaveDraftDTO } from '../../../shared/types'

interface DraftRow {
  id: string
  source: 'ai' | 'mcp'
  data: string
  created_at: string
  updated_at: string
}

function mapRow(row: DraftRow): ImportDraft {
  return {
    id: row.id as 'current',
    source: row.source,
    data: JSON.parse(row.data),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * 获取草稿
 */
export function findOne(db: Database.Database): ImportDraft | undefined {
  const row = db.prepare('SELECT * FROM import_draft WHERE id = ?').get('current') as
    | DraftRow
    | undefined
  return row ? mapRow(row) : undefined
}

/**
 * 获取草稿摘要信息
 */
export function getSummary(db: Database.Database): DraftSummary {
  const row = db
    .prepare('SELECT source, data, created_at, updated_at FROM import_draft WHERE id = ?')
    .get('current') as
    | { source: 'ai' | 'mcp'; data: string; created_at: string; updated_at: string }
    | undefined

  if (!row) {
    return { exists: false, count: 0, missingCategoryCount: 0 }
  }

  const data = JSON.parse(row.data) as ImportDraft['data']
  const transactions = data.transactions || []
  const missingCategoryCount = transactions.filter((t) => !t.category_id).length

  return {
    exists: true,
    source: row.source,
    count: transactions.length,
    missingCategoryCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * 保存草稿（存在则更新，不存在则插入）
 */
export function save(db: Database.Database, dto: SaveDraftDTO): ImportDraft {
  const dataJson = JSON.stringify(dto.data)
  const now = new Date().toISOString()

  // 使用 INSERT OR REPLACE 语法（SQLite 的 upsert）
  const result = db
    .prepare(
      `
    INSERT INTO import_draft (id, source, data, created_at, updated_at)
    VALUES (?, ?, ?, COALESCE((SELECT created_at FROM import_draft WHERE id = ?), ?), ?)
    ON CONFLICT(id) DO UPDATE SET
      source = excluded.source,
      data = excluded.data,
      updated_at = excluded.updated_at
  `
    )
    .run('current', dto.source, dataJson, 'current', now, now)

  return findOne(db)!
}

/**
 * 删除草稿
 */
export function remove(db: Database.Database): void {
  db.prepare('DELETE FROM import_draft WHERE id = ?').run('current')
}

/**
 * 检查草稿是否存在
 */
export function exists(db: Database.Database): boolean {
  const row = db
    .prepare('SELECT 1 as exists_flag FROM import_draft WHERE id = ?')
    .get('current') as { exists_flag: number } | undefined
  return !!row
}
