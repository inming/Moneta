# Tauri 架构（v1.0 迁移自 Electron）

> 本项目已从 Electron 整体迁移到 Tauri 2.x，后端全量 Rust 重写。修改后端、IPC、打包相关代码前请先阅读本文档。

## 进程模型

| 层 | 技术 | 目录 |
|----|------|------|
| 前端（WebView） | React 18 + antd + zustand + HashRouter | `src/renderer/` |
| 后端 | Rust（Tauri 2.x） | `src-tauri/src/` |
| MCP sidecar | Rust（rmcp），独立二进制 | `src-tauri/mcp-sidecar/` |
| 共享类型 | TypeScript（前端引用） | `src/shared/` |

前端代码**几乎零改动**：通过 `src/renderer/src/api/` 适配层把旧 `window.api`（13 命名空间）映射到 Tauri `invoke`/`listen`，`main.tsx` 首行 `import './api/install'` 注入 `window.api`。

## 前端 ↔ 后端通信

- **命令**：`window.api.transaction.list(params)` → `invoke('transaction_list', { params })` → `#[tauri::command] async fn transaction_list`。命名约定：旧 IPC 通道 `db:transaction:list` → 蛇形命令 `transaction_list`。
- **错误**：Rust 端统一 `Result<T, AppError>`，`AppError` 序列化为 `{ code, message }`，适配层包回 `new Error(message)`，渲染层 `err.message` 用法不变。
- **事件**：`AppHandle::emit` 沿用旧事件名 `sync:event` / `mcp:http-status-changed` / `mcp:import-open`，适配层用 `listen()` 封装成同步返回 unsubscribe 的签名。
- **JSON 字段名**以 `src/shared/types/*.ts` 为唯一真源，Rust struct 显式 `#[serde(rename)]`，**禁用 rename_all**（现状混合命名：`category_id` 与 `lastSyncAt` 并存）。`src-tauri/src/models.rs` 有字段名快照测试防漂移。

## Rust 后端模块

```
src-tauri/src/
├── lib.rs            # Builder、命令注册、setup（首启迁移+开库+MCP桥+同步）、ExitRequested 钩子
├── error.rs          # AppError（Serialize 为 {code,message}）
├── paths.rs          # 数据目录（沿用 Electron userData，MONETA_DATA_DIR 做 dev 隔离）
├── config.rs         # config.json 模型（flatten 保留未知字段）
├── models.rs         # 与 src/shared/types 对齐的 DTO，含 serde 字段名快照测试
├── secrets/          # OS keyring + Electron safeStorage 兼容解密 + 首启迁移状态机
├── db/               # sqlite3mc 连接、migrator（include_dir 嵌入 SQL）、5 个 repo
├── services/         # pin、forecast、locale
├── mcp/              # axum HTTP 桥（9615）、claude_config、McpState
├── sync/             # S3 同步全套（见 s3-sync.md）
└── commands/         # 67 个 #[tauri::command]，薄封装层
```

## 数据兼容（关键）

老用户数据**零拷贝接管**：数据目录沿用 Electron 的 `~/Library/Application Support/Moneta`（Windows `%APPDATA%\Moneta`），不用 Tauri 默认的 identifier 路径。

- **数据库**：实测旧 `moneta.db` 是 sqlite3mc 的 **chacha20** 格式（非 SQLCipher，见 [database-encryption.md](database-encryption.md)）。Rust 端 vendor `libsqlite3-sys` 并以 sqlite3mc 2.3.3 amalgamation 顶替捆绑 sqlite3（`src-tauri/vendor/libsqlite3-sys/`，`[patch.crates-io]`）。
- **秘密迁移**：首启把旧 config.json 中 Electron safeStorage 加密的 dbKey/PIN/S3 凭证解密（`secrets/electron_compat.rs`：macOS keychain `moneta Safe Storage`/`moneta Key` + os_crypt v10；Windows DPAPI/Local State）后转存 OS keyring，验证通过才擦除 config 密文并写 `secretsBackend: "keyring"`。失败可重试不落盘，绝不进入新建空库分支。LockScreen 之前显示迁移错误态（`App.tsx` BootstrapErrorScreen + `app_bootstrap_status` 轮询）。

## 导入导出

xlsx-js-style 是纯 JS，平移到渲染层 `src/renderer/src/api/excel.ts`（解析/生成）。文件字节经 `file_read`/`file_write` 命令（二进制直传，路径需经 dialog 白名单）；Rust 只做 `import_execute`（单事务全量覆盖）和 `export_query`。

## 构建与打包

| 命令 | 作用 |
|------|------|
| `npm run dev:tauri` | 开发模式（Tauri 窗口 + vite HMR） |
| `npm run build:full` | 构建渲染层 + sidecar（tauri.conf 的 beforeBuildCommand） |
| `npm run tauri build` | 生产打包（DMG/NSIS） |
| `npm run build:sidecar` | 单独构建 MCP sidecar（`scripts/build-sidecar.mjs`） |

- `tauri.conf.json`：identifier `com.moneta.app`、窗口 1200x800（min 900x600）、`externalBin: ["binaries/moneta-mcp"]`、bundle targets dmg/nsis。
- sidecar 按 `binaries/moneta-mcp-<target-triple>` 命名，CI 交叉编译时设 `MONETA_SIDECAR_TARGET`。
- CI：`.github/workflows/ci.yml`（tsc + vitest + clippy -D warnings + cargo test）、`release.yml`（tag 触发 tauri-action，macOS aarch64/x86_64 + Windows 矩阵）。

## 测试

- Rust 单测：`cd src-tauri && MONETA_KEYRING=mock cargo test`（repo CRUD、迁移、PIN、forecast、key envelope、字段名快照）。
- 集成测试（需 MinIO）：`MONETA_MINIO=1 cargo test sync::integration` —— S3 CAS 契约 + 完整云端往返。
- 前端：`npm run test`（excel 导入导出往返）。
- 真实库冒烟：`MONETA_REAL_DB=... MONETA_REAL_KEY_FILE=... cargo test real_db -- --ignored`。
