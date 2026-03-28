import Database from 'better-sqlite3-multiple-ciphers'
import crypto from 'crypto'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { DB_NAME, PLAIN_BACKUP_SUFFIX } from '../../shared/constants/config'
import { loadConfig, saveConfig, encryptString, decryptString } from '../services/config.service'

let db: Database.Database | null = null

function getDatabasePath(): string {
  return path.join(app.getPath('userData'), DB_NAME)
}

function getBackupPath(): string {
  return getDatabasePath() + PLAIN_BACKUP_SUFFIX
}

type EnsureKeyResult = { hexKey: string; isNewKey: boolean }

function ensureDbKey(): EnsureKeyResult {
  const config = loadConfig()

  if (config.dbKeyEncrypted && config.dbKeyEncrypted.length > 0) {
    return { hexKey: decryptString(config.dbKeyEncrypted), isNewKey: false }
  }

  const key = crypto.randomBytes(32).toString('hex')
  config.dbKeyEncrypted = encryptString(key)
  saveConfig(config)
  return { hexKey: key, isNewKey: true }
}

function setEncryptionPragmas(database: Database.Database, hexKey: string): void {
  database.pragma(`key = "x'${hexKey}'"`)
  database.pragma("cipher = 'sqlcipher'")
  database.pragma('cipher_page_size = 4096')
  database.pragma('kdf_iter = 256000')
}

function setCommonPragmas(database: Database.Database): void {
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
}

function migratePlaintextToEncrypted(hexKey: string): void {
  const dbPath = getDatabasePath()
  const bakPath = getBackupPath()
  let plainDb: Database.Database | null = null
  let encDb: Database.Database | null = null

  try {
    if (!fs.existsSync(bakPath)) {
      fs.renameSync(dbPath, bakPath)
    } else {
      for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
        if (fs.existsSync(f)) fs.unlinkSync(f)
      }
    }

    const config = loadConfig()
    config.dbMigrationState = 'pending'
    saveConfig(config)

    // Open plaintext DB without encryption
    plainDb = new Database(bakPath)
    plainDb.pragma('journal_mode = WAL')
    plainDb.pragma('foreign_keys = ON')

    // Create new encrypted database
    encDb = new Database(dbPath)
    setEncryptionPragmas(encDb, hexKey)
    setCommonPragmas(encDb)

    // Get all tables from plaintext DB
    const tables = plainDb.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string; sql: string }[]

    // Recreate tables in encrypted DB
    for (const table of tables) {
      encDb.exec(table.sql)
    }

    // Copy data from each table
    let totalRows = 0
    for (const table of tables) {
      const rows = plainDb.prepare(`SELECT * FROM "${table.name}"`).all()
      if (rows.length === 0) continue

      const columns = Object.keys(rows[0] as object)
      const placeholders = columns.map(() => '?').join(', ')
      const insertStmt = encDb.prepare(`INSERT INTO "${table.name}" (${columns.join(', ')}) VALUES (${placeholders})`)

      for (const row of rows) {
        const values = columns.map(col => (row as Record<string, unknown>)[col])
        insertStmt.run(values)
      }
      totalRows += rows.length
    }

    // Copy indexes
    const indexes = plainDb.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all() as { sql: string }[]
    for (const idx of indexes) {
      try {
        encDb.exec(idx.sql)
      } catch (e) {
        console.warn(`[db] Failed to create index: ${e}`)
      }
    }

    console.log(`[db] Migration complete: ${tables.length} tables, ${totalRows} rows migrated`)

    const updatedConfig = loadConfig()
    updatedConfig.dbMigrationState = 'done'
    saveConfig(updatedConfig)
  } finally {
    // Ensure database connections are always closed
    if (plainDb) {
      try { plainDb.close() } catch { /* ignore */ }
    }
    if (encDb) {
      try { encDb.close() } catch { /* ignore */ }
    }
  }

  for (const f of [`${bakPath}-wal`, `${bakPath}-shm`]) {
    if (fs.existsSync(f)) fs.unlinkSync(f)
  }

  // Verify migration - compare user tables only (exclude sqlite_% system tables)
  const verifyDb = new Database(dbPath)
  try {
    setEncryptionPragmas(verifyDb, hexKey)
    setCommonPragmas(verifyDb)
    const tables = verifyDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
    console.log(`[db] Migration verified: ${tables.length} user tables in encrypted database`)
  } finally {
    verifyDb.close()
  }

  if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath)
}

function checkAndRecoverMigration(hexKey: string): void {
  const dbPath = getDatabasePath()
  const bakPath = getBackupPath()
  const config = loadConfig()

  if (config.dbMigrationState !== 'pending' && !fs.existsSync(bakPath)) {
    return
  }

  if (fs.existsSync(bakPath)) {
    for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      if (fs.existsSync(f)) fs.unlinkSync(f)
    }
    migratePlaintextToEncrypted(hexKey)
    return
  }

  console.warn('[db] Migration pending but no backup found. Attempting to verify encrypted DB.')
  const testDb = new Database(dbPath)
  try {
    setEncryptionPragmas(testDb, hexKey)
    setCommonPragmas(testDb)
    testDb.prepare('SELECT count(*) FROM sqlite_master').get()
    const updatedConfig = loadConfig()
    updatedConfig.dbMigrationState = 'done'
    saveConfig(updatedConfig)
  } catch {
    throw new Error('Database is unrecoverable: migration was pending, no backup exists, and encrypted DB cannot be opened. Please restore from an export.')
  } finally {
    testDb.close()
  }
}

export function getDatabase(): Database.Database {
  if (!db) {
    const { hexKey, isNewKey } = ensureDbKey()
    const dbPath = getDatabasePath()
    const config = loadConfig()
    const dbExists = fs.existsSync(dbPath)

    if (isNewKey && dbExists) {
      migratePlaintextToEncrypted(hexKey)
    } else if (!isNewKey && config.dbMigrationState === 'pending') {
      checkAndRecoverMigration(hexKey)
    }

    db = new Database(dbPath)
    setEncryptionPragmas(db, hexKey)
    setCommonPragmas(db)

    if (config.dbMigrationState !== 'done') {
      const updatedConfig = loadConfig()
      updatedConfig.dbMigrationState = 'done'
      saveConfig(updatedConfig)
    }
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
