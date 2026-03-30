# 数据库加密架构（v0.7）

> 从 CLAUDE.md 拆分。修改加密、数据库连接、迁移相关代码时请先阅读本文档。

## 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| 加密库 | `better-sqlite3-multiple-ciphers` | API 兼容 `better-sqlite3`，支持 SQLCipher |
| 加密算法 | SQLCipher (AES-256-CBC) | 社区文档完善，而非 sqleet |
| 密钥管理 | Electron `safeStorage` | OS 级保护（macOS Keychain / Windows DPAPI）|
| 密钥生成 | `crypto.randomBytes(32)` | 256-bit 随机密钥 |

## 关键实现决策

**1. 不使用 `sqlcipher_export()`**

better-sqlite3-multiple-ciphers 虽然支持 SQLCipher 加密，但不提供 `sqlcipher_export()` 函数。实际采用 **JavaScript 逐表复制方案**：

```typescript
// 打开明文数据库
const plainDb = new Database(bakPath)
// 创建加密数据库
const encDb = new Database(dbPath)
encDb.pragma(`key = "x'${hexKey}'"`)
encDb.pragma("cipher = 'sqlcipher'")

// 复制表结构
const tables = plainDb.prepare("SELECT name, sql FROM sqlite_master...").all()
for (const table of tables) {
  encDb.exec(table.sql)
}

// 复制数据（逐行）
for (const table of tables) {
  const rows = plainDb.prepare(`SELECT * FROM "${table.name}"`).all()
  const insertStmt = encDb.prepare(`INSERT INTO "${table.name}" ...`)
  for (const row of rows) {
    insertStmt.run(values)
  }
}
```

**2. 资源管理必须 try-finally**

Windows 上未关闭的数据库连接会锁住文件，导致后续文件操作失败：

```typescript
const db = new Database(path)
try {
  // 操作数据库
} finally {
  db.close()  // 必须确保关闭
}
```

**3. 表名转义**

使用 `"${table.name}"` 转义表名，防止特殊字符（如空格、关键字）导致 SQL 错误。

**4. 验证时排除系统表**

SQLCipher 加密数据库可能创建内部表（如 `sqlite_stat1`），验证时只统计用户表：

```sql
SELECT count(*) FROM sqlite_master
WHERE type='table' AND name NOT LIKE 'sqlite_%'
```

## 类型导入统一

所有数据库相关的类型导入必须统一为：

```typescript
// ✅ 正确
import type Database from 'better-sqlite3-multiple-ciphers'

// ❌ 错误（即使只是类型）
import type Database from 'better-sqlite3'
```

涉及文件：`connection.ts`, `migrator.ts`, 所有 `*.repo.ts`, `import-export.service.ts`

## 迁移状态机

通过 `config.json` 的 `dbMigrationState` 字段跟踪迁移进度：

| 状态 | 含义 | 处理方式 |
|------|------|---------|
| `undefined` | 从未尝试迁移 | 根据 `dbKeyEncrypted` 和数据库存在性判断 |
| `'pending'` | 迁移进行中 | 检查 `.plain.bak` 备份，恢复或重新迁移 |
| `'done'` | 迁移完成 | 正常打开加密数据库 |

## 跨平台开发注意事项

**WSL2 → Windows 开发模式**：
- 代码编辑在 WSL2，编译运行在 Windows
- 使用 `./scripts/sync-to-windows.sh` 同步代码
- 所有 `npm` 命令必须在 Windows PowerShell 中执行（UNC 路径导致 node-gyp 失败）

---

**相关文档**：
- 产品规格：`docs/prd-archive/database-encryption.md`
- 总体架构：`docs/ARCHITECTURE.md`
