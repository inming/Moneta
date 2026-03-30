# 数据库加密 — 功能规格归档
> 从 PRD.md Section 3.10 和 5.11 归档。此功能已实现（v0.7）。

### 3.10 数据库加密

#### 3.10.1 功能概述

为保护用户财务数据隐私，Moneta 使用 SQLCipher（通过 `better-sqlite3-multiple-ciphers`）对 SQLite 数据库进行透明加密。数据库文件在磁盘上始终处于加密状态，即使应用运行期间也无法被第三方工具直接读取。

#### 3.10.2 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 加密方案 | SQLCipher 数据库级加密 | 数据始终加密（含 WAL 日志），查询/索引/搜索完全不受影响 |
| 密钥管理 | OS 级自动加密（safeStorage） | 用户无感知，无需额外密码；macOS Keychain / Windows DPAPI 保护 |
| 密钥派生 | 32 字节随机密钥 | 首次启动自动生成，通过 safeStorage 加密后存入 config.json |
| 加密算法 | sqlcipher（AES-256-CBC） | SQLite3MultipleCiphers 社区默认，文档和测试覆盖充分 |
| 依赖替换 | `better-sqlite3` → `better-sqlite3-multiple-ciphers` | API 完全兼容的 fork，维护活跃（v12.8.0），支持 Electron 33 |

#### 3.10.3 密钥管理

**密钥生成与存储**：
- 首次启动时，使用 `crypto.randomBytes(32)` 生成 32 字节（256 位）随机密钥
- 将密钥转为 hex 字符串，通过现有的 `encryptString()` 函数（基于 Electron `safeStorage`）加密
- 加密后的密钥存储在 `config.json` 的 `dbKeyEncrypted` 字段中，与 `pinEncrypted`、`apiKeyEncrypted` 同级
- 后续启动时，通过 `decryptString()` 解密还原密钥，用于打开数据库

**安全等级**：
- 与现有 PIN 码、API Key 存储机制一致，依赖 OS 凭据系统
- macOS：Keychain 保护，跨机器无法解密
- Windows：DPAPI 保护，仅当前 Windows 用户可解密
- `safeStorage` 不可用时降级为 base64（与现有行为一致，打印警告日志）

#### 3.10.4 数据库连接变更

打开数据库时设置加密密钥和参数：

```
1. new Database(dbPath)
2. PRAGMA key = "x'<hex_key>'"    （必须是打开数据库后的第一条 PRAGMA）
3. PRAGMA cipher = 'sqlcipher'
4. PRAGMA cipher_page_size = 4096
5. PRAGMA kdf_iter = 256000
6. PRAGMA journal_mode = WAL       （现有）
7. PRAGMA foreign_keys = ON        （现有）
```

密钥设置必须在其他所有操作之前完成。

#### 3.10.5 现有用户数据迁移

现有用户的数据库为明文格式，升级后需自动迁移为加密格式。

**迁移策略**：JavaScript 逐表复制方案（`sqlcipher_export` 在 better-sqlite3-multiple-ciphers 中不可用），直接写入最终 `moneta.db` 路径（避免 Windows 文件锁问题）。

**迁移状态机**：通过 `config.json` 的 `dbMigrationState` 字段（`'pending'` | `'done'`）跟踪迁移进度，确保崩溃后可恢复。

| `dbKeyEncrypted` | `dbMigrationState` | Action |
|---|---|---|
| 缺失 | 缺失 | 新安装或旧版本 → 生成密钥，直接创建加密数据库（无迁移） |
| 存在 | `'pending'` | 上次迁移被中断 → 从 `.bak` 重新执行迁移 |
| 存在 | `'done'` | 正常启动 → 打开加密数据库 |
| 存在 | 缺失 | 旧版迁移（无状态追踪）→ 视为 `'pending'` |

**迁移步骤**：

1. **备份**：将 `moneta.db` 重命名为 `moneta.db.plain.bak`
2. **设置状态**：保存 `dbMigrationState = 'pending'` 到 `config.json`
3. **打开明文**：以明文模式打开 `moneta.db.plain.bak`
4. **创建加密库**：创建新的加密数据库 `moneta.db`，设置 `PRAGMA key`
5. **复制表结构**：读取源库所有表的 CREATE TABLE 语句，在目标库执行
6. **复制数据**：逐表读取数据，逐行插入到加密数据库
7. **复制索引**：读取并重建所有索引
8. **关闭连接**：关闭所有数据库（释放文件锁）
9. **清理 WAL/SHM**：删除 `moneta.db.plain.bak-wal` 和 `moneta.db.plain.bak-shm`
10. **重新打开验证**：用加密密钥打开 `moneta.db`，验证用户表数量正确
11. **标记完成**：保存 `dbMigrationState = 'done'` 到 `config.json`
12. **删除备份**：删除 `moneta.db.plain.bak`

**代码实现要点**：
- 使用 `try-finally` 确保数据库连接总是关闭（避免 Windows 文件锁）
- 表名使用 `"${table.name}"` 转义，防止特殊字符问题
- 验证时只统计用户表（`name NOT LIKE 'sqlite_%'`），排除 SQLCipher 内部表

**失败恢复场景**：

| 场景 | 检测条件 | 处理方式 |
|------|---------|---------|
| 步骤 2-6 间崩溃 | `state='pending'` + `.bak` 存在 | 删除部分 `moneta.db`/WAL/SHM，从步骤 1 重新迁移 |
| 步骤 7-8 间崩溃 | `state='pending'` + `.bak` 存在 | 清理 WAL/SHM，尝试打开 `moneta.db`；可读则跳至步骤 9，否则重新迁移 |
| 步骤 9-10 间崩溃 | `state='pending'` 但 `moneta.db` 可正常打开 | 跳至步骤 10（标记完成 + 删除备份） |
| 无 `.bak` 但 state='pending' | `state='pending'` + `.bak` 不存在 | 尝试打开 `moneta.db`；成功则标记 `'done'`，否则提示用户恢复 |

**边界处理**：
- **空数据库**（新安装）：直接创建加密数据库，跳过迁移
- **MCP Server**：迁移过程中 HTTP Server 尚未启动，不受影响

#### 3.10.6 MCP 兼容性

MCP Server 不直接访问数据库文件，仅通过 HTTP 与主应用通信（已验证 `src/mcp/` 无任何对 `connection.ts` 或 `better-sqlite3` 的 import）。主应用中的 MCP HTTP Server 使用与所有 IPC Handler 相同的 `getDatabase()` 连接。因此数据库加密对 MCP 功能完全透明，无需任何改动。

注意：`connection.ts` 中有独立 Node.js 进程的数据库路径（非 Electron 环境），但 MCP Server 当前未使用此路径。未来如需使用，需要另行设计密钥管理机制（独立进程中无 `safeStorage`）。

#### 3.10.7 安全性分析

| 攻击场景 | 当前状态 | 加密后 |
|---------|---------|--------|
| 直接拷贝 .db 文件查看 | 明文可读 | AES-256-CBC 加密，无法读取 |
| DB Browser 等工具打开 | 可直接查看 | 需要密钥才能打开 |
| 磁盘取证 | 明文数据可恢复 | 磁盘上的数据始终加密（含 WAL） |
| 运行时内存提取 | 数据在内存中明文 | 同左（不可避免，需 OS 级保护） |
| 同机已登录攻击者 | 可直接读文件 | 需要 safeStorage 凭据 |
| 跨机器拷贝 | 完全可读 | 密钥与 OS 用户绑定，跨机器无法解密 |

**不防护的场景**：应用运行时内存中的明文数据、恶意软件内存转储、用户主动导出的 Excel/CSV 文件。

#### 3.10.8 改动范围

| 文件 | 改动 | 说明 |
|------|------|------|
| `package.json` | 替换依赖 | `better-sqlite3` → `better-sqlite3-multiple-ciphers` |
| `src/main/database/connection.ts` | 核心改动 | 添加密钥解密 + PRAGMA key 设置 + 迁移状态机 |
| `src/main/services/config.service.ts` | 小改 | `loadConfig()` 增加 `dbKeyEncrypted`、`dbMigrationState` 字段处理 |
| `src/shared/types/` | 小改 | `AppConfig` 类型新增 `dbKeyEncrypted?: string`、`dbMigrationState?: 'pending' | 'done'` 字段 |
| MCP Server (`src/mcp/`) | 无改动 | 通过 HTTP 访问，加密透明 |
| 所有 Repository 文件 | 无改动 | 通过 `getDatabase()` 透明访问 |
| 所有 IPC Handler | 无改动 | 通过 `getDatabase()` 透明访问 |
| 前端代码 | 无改动 | 加密完全在主进程，渲染进程无感知 |

#### 3.10.9 验收标准

| # | 验收条件 | 说明 |
|---|---------|------|
| AC-ENC-1 | 数据库文件在磁盘上始终加密 | 使用 hex 编辑器或 DB Browser 打开 .db 文件应显示乱码或无法打开 |
| AC-ENC-2 | 应用正常启动并读写数据 | 加密不影响任何现有功能（交易录入、统计、导入导出等） |
| AC-ENC-3 | 现有用户升级后数据自动迁移 | 旧版本明文数据库自动转为加密格式，数据完整无丢失 |
| AC-ENC-4 | 迁移失败可恢复 | 迁移中断时能从备份恢复，不丢失数据 |
| AC-ENC-5 | 新安装直接创建加密数据库 | 全新安装无需迁移，数据库从创建即加密 |
| AC-ENC-6 | 密钥通过 safeStorage 加密存储 | config.json 中 `dbKeyEncrypted` 字段为密文 |
| AC-ENC-7 | MCP 导入功能正常 | 加密不影响 MCP Server 通过 HTTP 查询分类/操作人 |
| AC-ENC-8 | 性能无明显下降 | 10 万条记录的查询响应时间与加密前相比不超过 10% |

---

### 5.11 v0.7 - 数据库加密 ✅ **已实现** (2026-03-28)

- [x] 将 `better-sqlite3` 替换为 `better-sqlite3-multiple-ciphers`（详见 §3.10）
- [x] 生成 32 字节随机密钥，通过 `safeStorage` 加密存储到 `config.json`
- [x] 打开数据库时设置加密 PRAGMA（SQLCipher AES-256-CBC 算法）
- [x] 自动迁移现有明文数据库为加密数据库（JavaScript 逐表复制方案）
- [x] 验证迁移完整性，支持崩溃恢复
- [x] 验收标准 AC-ENC-1 ~ AC-ENC-8 全部通过

**实现变更说明**：
- 实际采用 SQLCipher 而非 sqleet，因社区文档更完善
- 未使用 `sqlcipher_export()` 函数（该函数在 better-sqlite3-multiple-ciphers 中不可用），改用 JavaScript 逐表复制方案
