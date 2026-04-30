# CLAUDE.md — Moneta 项目开发指南

> 本文件供 AI 辅助开发时快速了解项目上下文。详细架构文档见 `docs/architecture/`。

## 项目简介

Moneta 是一款面向个人/家庭的桌面端记账软件，支持手动录入、AI 截图识别、分类统计和数据导入导出。

> **开发模式**：个人独立开发项目，直接在 `master` 分支上开发和推送，无需创建 PR。

## 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | 24+ (LTS) | 见 `.nvmrc` 和 `package.json` engines |
| Python | 3.x | 需要安装 setuptools 包 |
| setuptools | - | `pip install setuptools` |
| Visual Studio Build Tools | 2022 | Windows 编译原生模块需要 |

**快速配置**：
```bash
# macOS / Linux / WSL2
bash scripts/setup-env.sh

# Windows
scripts\setup-env.bat
```

详细说明见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

## 测试与发布

### 跨平台开发（WSL2 → Windows）

本项目支持在 WSL2 中开发，在 Windows 上运行测试。

**代码同步脚本**：`scripts/sync-to-windows.sh`

```bash
# 同步到 Windows 目录
./scripts/sync-to-windows.sh /mnt/c/Users/<username>/workspace/Moneta

# 或设置环境变量后使用
export WIN_PATH=/mnt/c/Users/<username>/workspace/Moneta
./scripts/sync-to-windows.sh
```

**Windows 端准备（只需一次）**：

```powershell
# 安装 Windows 版依赖
cd C:\Users\<username>\workspace\Moneta
npm install
```

**运行测试**：

```powershell
npm run dev        # 开发模式
npm run build      # 生产构建
```

### Windows 打包

```powershell
# 打包为 Windows 安装程序（NSIS）
npm run package:win

# 输出目录
dist/Moneta Setup x.x.x.exe       # 安装程序
dist/win-unpacked/                # 免安装版
```

### macOS 打包

```bash
# 在 macOS 上运行
npm run package:mac

# 输出
dist/Moneta-x.x.x.dmg
```

### GitHub Actions 自动构建

项目配置了 GitHub Actions 自动构建（`.github/workflows/build.yml`），推送标签后自动编译 Windows 和 macOS 版本。

## 编码规范

### TypeScript

- 启用 `strict: true`，不允许 `any`（极少数情况使用 `unknown`）
- 所有函数参数和返回值必须有类型注解
- 优先使用 `interface` 定义对象类型，`type` 用于联合类型和工具类型

### React

- 仅使用函数组件（`React.FC` 或普通函数 + Props 类型）
- 状态管理使用 Zustand，避免 prop drilling 超过 2 层
- 组件文件使用 PascalCase：`TransactionForm.tsx`
- Hook 文件使用 camelCase：`useTransactions.ts`

### 命名约定

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件 | PascalCase | `TransactionList` |
| Hook | camelCase + use 前缀 | `useCategories` |
| 工具函数 | camelCase | `formatCurrency` |
| 常量 | UPPER_SNAKE_CASE | `DEFAULT_CATEGORIES` |
| 类型/接口 | PascalCase | `Transaction`, `CategoryType` |
| 数据库表 | snake_case 复数 | `transactions`, `categories` |
| 数据库列 | snake_case | `category_id`, `created_at` |
| IPC 频道 | kebab-case + 命名空间 | `db:transaction:create` |

### IPC 通道命名规范

通道名格式：`<namespace>:<entity>:<action>`

| 命名空间 | 用途 | 示例 |
|----------|------|------|
| `db` | 数据库 CRUD 操作 | `db:category:create`, `db:operator:delete` |
| `io` | 导入导出 | `io:import:preview`, `io:export:execute` |
| `ai` | AI 功能 | `ai:recognize` |
| `auth` | 认证与安全 | `auth:pin:verify`, `auth:auto-lock:set` |
| `dialog` | 系统对话框 | `dialog:open-file`, `dialog:save-file` |

常用 action：`list`、`list-all`（含停用数据）、`create`、`update`、`delete`、`reorder`

新增 IPC 通道时需同步修改三处：
1. `src/shared/ipc-channels.ts` — 通道常量定义
2. `src/main/ipc/<entity>.ipc.ts` — 主进程 handler
3. `src/preload/index.ts` + `index.d.ts` — 渲染进程 API 桥接及类型声明

### 文件组织

- 每个组件一个文件，如果组件有专属子组件可建同名目录
- 页面级组件放在 `src/renderer/src/pages/<PageName>/` 目录下，入口为 `index.tsx`，子组件同目录平铺（如 `Settings/CategoryManager.tsx`）
- 共享类型放在 `src/shared/types/`，并在 `index.ts` 中统一导出
- 业务逻辑尽量放在主进程（`src/main/services/`），渲染进程保持轻量

## Git 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <description>

feat(transaction): 新增手动录入交易功能
fix(stats): 修复季度汇总计算错误
refactor(database): 重构迁移脚本加载逻辑
docs: 更新 PRD 文档
chore: 升级 electron-vite 版本
```

常用 type：`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`

## 数据库迁移约定

- 迁移文件放在 `src/main/database/migrations/`
- 文件名格式：`001_create_transactions.sql`（三位数序号 + 描述）
- 每个迁移文件包含 `-- up` 和 `-- down` 两部分（**注意**：使用 `-- up` 和 `-- down` 作为标记，后面不加冒号）
- 应用启动时自动执行未运行的迁移
- 迁移必须是幂等的，先检查再执行

### SQL 语法注意事项

**DEFAULT 值必须使用括号包裹函数调用**：
```sql
-- ✅ 正确
created_at TEXT DEFAULT (datetime('now', 'localtime'))

-- ❌ 错误（会导致 "near '(' : syntax error"）
created_at DATETIME DEFAULT datetime('now', 'localtime')
```

**CHECK 约束**：SQLite 支持 CHECK 约束，但注意版本兼容性，必要时可省略。

## 数据库迁移模式

### 新增列 + 数据回填

当需要为现有表添加新列并为已有行回填数据时（如 `006_add_category_description.sql`）：

1. 使用 `ALTER TABLE ... ADD COLUMN ... DEFAULT ''` 添加列（SQLite 要求 ADD COLUMN 有默认值）
2. 紧跟 `UPDATE` 语句回填系统预置数据（通过 `is_system = 1` 限定范围）
3. **不修改旧迁移文件**（004/005 等已执行的迁移），通过新迁移回填数据
4. 迁移器按文件名排序执行，新用户首次安装时 004 → 005 → 006 依次执行，006 的 UPDATE 会覆盖 004/005 INSERT 时的空默认值

### IPC 层透传模式

- IPC handler 和 preload 桥接层使用 `unknown` 泛型传递 DTO，新增字段时**无需修改**这两层
- 类型安全由 `src/shared/types/` 的接口定义保证，`src/preload/index.d.ts` 通过 import 自动跟随更新

---

## 架构文档索引

修改相关功能时请先阅读对应文档。

| 功能 | 文档 | 关键决策 |
|------|------|---------|
| 数据库加密 | [`docs/architecture/database-encryption.md`](docs/architecture/database-encryption.md) | 不用 sqlcipher_export，JS 逐表复制；类型统一用 better-sqlite3-multiple-ciphers |
| 多语言 i18n | [`docs/architecture/i18n.md`](docs/architecture/i18n.md) | key 层级命名；用户数据不翻译；JSON 改后需强刷 |
| MCP 架构 | [`docs/architecture/mcp.md`](docs/architecture/mcp.md) | stdio+HTTP 分离架构；端口 9615；共享 ImportConfirm 组件 |
| 统计报表 | [`docs/architecture/statistics.md`](docs/architecture/statistics.md) | 图例独显交互；右键下钻；SQL pivot 在 JS 层转换 |
| 应用安全与锁屏 | [`docs/architecture/security.md`](docs/architecture/security.md) | PIN 存 config.json 不存 DB；SHA-256+salt；单窗口锁屏；ContextMenu 组件 |
| AI 模型与识别 | [`docs/architecture/ai-recognition.md`](docs/architecture/ai-recognition.md) | 多层容错解析；AbortController 取消；300s 超时；确认界面全量编辑模式 |
| 数据浏览与编辑 | [`docs/architecture/data-browsing.md`](docs/architecture/data-browsing.md) | 服务端分页排序；editingKey 互斥；URL 参数筛选；侧栏导航结构 |
| 数据管理 | [`docs/architecture/data-management.md`](docs/architecture/data-management.md) | 导出用 xlsx-js-style；CSV UTF-8 BOM；导入全量覆盖；草稿 useEffect 即时保存 |
| 跨页面导航 | [`docs/architecture/cross-page-navigation.md`](docs/architecture/cross-page-navigation.md) | URL params 传状态；setTimeout(0) 恢复 ECharts 独显 |
| 深色模式 | [`docs/architecture/dark-mode.md`](docs/architecture/dark-mode.md) | CSS 变量 + Ant Design Token；ECharts 内置 dark 主题；Zustand 状态管理；系统主题监听（matchMedia） |
| 年度消费预测 | — | Dashboard 为首页（`/`）；按类目加权历史均值预测；`is_occasional` 偶发交易标记；双 Y 轴（柱状+累积折线）；历史数据内存缓存 + 交易变更时清缓存 |
| S3 数据同步 | [`docs/architecture/s3-sync.md`](docs/architecture/s3-sync.md) | 整库文件级同步；复用 SQLCipher 加密；manifest CAS 抢占式写；冲突由用户决断；分 P1/P2/P3 阶段上线 |

### 产品需求文档

| 文档 | 路径 | 说明 |
|------|------|------|
| PRD（精简版） | [`docs/PRD.md`](docs/PRD.md) | 产品概述、核心概念、未来规划 |
| 已实现功能规格归档 | [`docs/prd-archive/`](docs/prd-archive/) | 按功能模块归档的完整规格与验收标准 |
| 总体架构 | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 高层架构总览、技术选型、目录结构 |
| 开发环境 | [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | 环境配置、常见问题 |
