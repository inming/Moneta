import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import os from 'os'
import { DB_NAME } from '../../shared/constants/config'

let db: Database.Database | null = null

/**
 * 获取数据库路径
 * 支持 Electron 主进程和独立 Node.js 进程（如 MCP Server）
 */
function getDatabasePath(): string {
  // 检查是否在 Electron 环境中
  if (app && app.getPath) {
    try {
      return path.join(app.getPath('userData'), DB_NAME)
    } catch {
      // app 对象存在但可能未初始化，降级到手动路径
    }
  }
  
  // 独立进程模式：手动构造路径
  const platform = os.platform()
  const homeDir = os.homedir()
  let userDataPath: string
  
  if (platform === 'darwin') {
    userDataPath = path.join(homeDir, 'Library', 'Application Support', 'moneta')
  } else if (platform === 'win32') {
    userDataPath = path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'moneta')
  } else {
    userDataPath = path.join(homeDir, '.config', 'moneta')
  }
  
  return path.join(userDataPath, DB_NAME)
}

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = getDatabasePath()
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
