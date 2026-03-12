import type Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

export function runMigrations(db: Database.Database): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `)

  const migrationsDir = is.dev
    ? path.join(app.getAppPath(), 'src', 'main', 'database', 'migrations')
    : path.join(process.resourcesPath, 'migrations')

  if (!fs.existsSync(migrationsDir)) {
    return
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const applied = new Set(
    db
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((row) => (row as { name: string }).name)
  )

  for (const file of files) {
    if (applied.has(file)) continue

    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    const upSql = extractUpSection(content)

    if (!upSql.trim()) continue

    db.transaction(() => {
      db.exec(upSql)
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file)
    })()
  }
}

function extractUpSection(sql: string): string {
  const upIndex = sql.indexOf('-- up')
  const downIndex = sql.indexOf('-- down')

  if (upIndex === -1) return sql

  const start = upIndex + '-- up'.length
  const end = downIndex === -1 ? sql.length : downIndex

  return sql.slice(start, end)
}
