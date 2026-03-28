# CLAUDE.md — Moneta 项目开发指南

> 本文件供 AI 辅助开发时快速了解项目上下文。请在每次会话开始时阅读。

## 项目简介

Moneta 是一款面向个人/家庭的桌面端记账软件，支持手动录入、AI 截图识别、分类统计和数据导入导出。

> **开发模式**：个人独立开发项目，直接在 `master` 分支上开发和推送，无需创建 PR。

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Electron | 跨平台桌面应用（Windows + macOS） |
| 前端框架 | React 18 | 函数组件 + Hooks |
| 语言 | TypeScript | 严格模式（`strict: true`） |
| 构建工具 | Vite | 配合 electron-vite 使用 |
| 数据库 | SQLite | 通过 better-sqlite3-multiple-ciphers 访问（同步 API，支持 SQLCipher 加密） |
| 状态管理 | Zustand | 轻量级状态管理 |
| UI 组件库 | Ant Design 5 | 桌面端组件风格 |
| 图表 | ECharts / Apache ECharts | 统计报表可视化 |
| 国际化 | i18next + react-i18next | 多语言支持（中文/英文） |
| 打包 | electron-builder | 输出 DMG（macOS）+ NSIS（Windows） |

## 目录结构

```
moneta/
├── electron.vite.config.ts        # electron-vite 配置
├── package.json
├── docs/                           # 项目文档
│   ├── PRD.md                      # 产品需求文档
│   └── ARCHITECTURE.md             # 架构文档
├── resources/                      # 应用图标等静态资源
├── src/
│   ├── main/                       # Electron 主进程
│   │   ├── index.ts                # 主进程入口
│   │   ├── ipc/                    # IPC 处理器
│   │   ├── database/               # 数据库层
│   │   │   ├── connection.ts       # SQLite 连接管理
│   │   │   ├── migrations/         # 数据库迁移脚本（按序号排列）
│   │   │   └── repositories/       # 数据访问对象
│   │   └── services/               # 业务逻辑（AI 识别等）
│   ├── renderer/                   # Electron 渲染进程（React 应用）
│   │   ├── index.html
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── components/         # 通用组件
│   │   │   ├── pages/              # 页面组件
│   │   │   ├── stores/             # Zustand stores
│   │   │   ├── hooks/              # 自定义 Hooks
│   │   │   ├── utils/              # 工具函数
│   │   │   └── styles/             # 全局样式
│   │   └── tsconfig.json
│   ├── shared/                     # 主进程与渲染进程共享的类型和常量
│   │   ├── types/                  # TypeScript 类型定义
│   │   ├── constants/              # 共享常量（分类默认值等）
│   │   └── ipc-channels.ts         # IPC 频道名称常量
│   └── preload/                    # Preload 脚本
│       └── index.ts
└── tests/                          # 测试
    ├── main/                       # 主进程测试
    └── renderer/                   # 渲染进程测试
```

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

## 开发命令

```bash
# 安装依赖
npm install

# 启动开发环境（同时启动主进程和渲染进程）
npm run dev

# 构建生产版本
npm run build

# 打包为安装程序
npm run package           # 当前平台
npm run package:win       # Windows NSIS
npm run package:mac       # macOS DMG

# 代码质量
npm run lint              # ESLint 检查
npm run lint:fix          # ESLint 自动修复
npm run typecheck         # TypeScript 类型检查

# 测试
npm run test              # 运行所有测试
npm run test:watch        # 监听模式

# 数据库
npm run db:migrate        # 执行数据库迁移
```

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

## 数据库加密架构（v0.7）

### 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| 加密库 | `better-sqlite3-multiple-ciphers` | API 兼容 `better-sqlite3`，支持 SQLCipher |
| 加密算法 | SQLCipher (AES-256-CBC) | 社区文档完善，而非 sqleet |
| 密钥管理 | Electron `safeStorage` | OS 级保护（macOS Keychain / Windows DPAPI）|
| 密钥生成 | `crypto.randomBytes(32)` | 256-bit 随机密钥 |

### 关键实现决策

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

### 类型导入统一

所有数据库相关的类型导入必须统一为：

```typescript
// ✅ 正确
import type Database from 'better-sqlite3-multiple-ciphers'

// ❌ 错误（即使只是类型）
import type Database from 'better-sqlite3'
```

涉及文件：`connection.ts`, `migrator.ts`, 所有 `*.repo.ts`, `import-export.service.ts`

### 迁移状态机

通过 `config.json` 的 `dbMigrationState` 字段跟踪迁移进度：

| 状态 | 含义 | 处理方式 |
|------|------|---------|
| `undefined` | 从未尝试迁移 | 根据 `dbKeyEncrypted` 和数据库存在性判断 |
| `'pending'` | 迁移进行中 | 检查 `.plain.bak` 备份，恢复或重新迁移 |
| `'done'` | 迁移完成 | 正常打开加密数据库 |

### 跨平台开发注意事项

**WSL2 → Windows 开发模式**：
- 代码编辑在 WSL2，编译运行在 Windows
- 使用 `./scripts/sync-to-windows.sh` 同步代码
- 所有 `npm` 命令必须在 Windows PowerShell 中执行（UNC 路径导致 node-gyp 失败）

## 多语言（i18n）架构

### 技术栈

- **框架**：i18next + react-i18next
- **支持语言**：简体中文（zh-CN）、英文（en-US）
- **联动组件**：Ant Design ConfigProvider、dayjs

### 翻译文件组织

```
src/renderer/src/locales/
├── index.ts              # i18n 初始化配置
├── zh-CN/
│   ├── common.json       # 通用文本（按钮、状态、交易类型）
│   ├── navigation.json   # 侧栏导航
│   ├── transactions.json # 数据浏览页
│   ├── statistics.json   # 统计报表页
│   ├── settings.json     # 设置页（含各子 Tab）
│   ├── ai.json           # AI 识别页
│   ├── import.json       # 导入确认组件
│   └── auth.json         # 安全认证（锁屏、PIN 设置）
└── en-US/
    └── (同上结构)
```

### 命名空间约定

| 命名空间 | 用途 | 示例组件 |
|---------|------|---------|
| `common` | 通用文本（按钮、状态、交易类型） | 全局复用 |
| `navigation` | 侧栏导航、页面标题 | Layout |
| `transactions` | 数据浏览页 | Transactions |
| `statistics` | 统计报表页 | Statistics |
| `settings` | 设置页（含分类、操作人、AI、MCP、语言、安全、数据管理） | Settings 及其子组件 |
| `ai` | AI 识别页 | AIRecognition |
| `import` | 导入确认组件（AI 识别和 MCP 共用） | ImportConfirm, MCPImport |
| `auth` | 安全认证（锁屏、PIN 设置） | LockScreen, PinSetup |

### 翻译 Key 命名规范

**层级结构**：`功能模块.子模块.具体项`

```typescript
// ✅ 推荐
t('settings.mcpConfig.httpServer.title')
t('auth.lockScreen.errors.wrongPin', { count: 3 })
t('import.messages.importSuccess', { count: 10 })

// ❌ 避免
t('mcp_title')  // 缺少层级
t('error1')     // 语义不明
```

**特殊字段约定**：
- `buttons.*` - 按钮文本
- `messages.*` - 成功/错误消息
- `placeholders.*` - 输入框占位符
- `errors.*` - 错误提示
- `columns.*` - 表格列标题
- `tabs.*` - Tab 标签

### 组件使用模式

```typescript
import { useTranslation } from 'react-i18next'

function MyComponent() {
  const { t } = useTranslation('settings')  // 指定命名空间

  return (
    <div>
      <h1>{t('title')}</h1>
      <Button>{t('buttons.save')}</Button>
      <p>{t('messages.success', { count: 5 })}</p>  {/* 变量插值 */}
    </div>
  )
}
```

### 配置与联动

**语言配置存储**：
- 位置：`app.getPath('userData')/config.json`
- 字段：`language`（值：`'zh-CN'` 或 `'en-US'`）
- 默认：首次启动检测系统语言（`app.getLocale()`）

**IPC 通道**：
- `config:language:get` - 获取当前语言
- `config:language:set` - 设置语言并持久化

**联动机制**（`App.tsx`）：
```typescript
// 1. i18n 初始化
const { language, initialize } = useI18nStore()
useEffect(() => { initialize() }, [])

// 2. 同步 dayjs locale
useEffect(() => { setDayjsLocale(language) }, [language])

// 3. 同步 Ant Design locale
const antdLocale = useMemo(() =>
  language === 'zh-CN' ? zhCN : enUS
, [language])

return <ConfigProvider locale={antdLocale}>...</ConfigProvider>
```

### 翻译范围

**需要翻译**：
- UI 元素（按钮、标签、标题、占位符）
- 消息提示（Toast、Modal）
- 表单验证消息
- 错误提示
- 交易类型显示名称（`expense` → "消费"/"Expense"）

**不翻译**（用户数据）：
- 分类名称（用户创建时的语言）
- 分类 AI 描述
- 操作人姓名
- 交易描述
- 系统预置分类（v0.6 保持中文，v0.7+ 考虑翻译表）

### 热重载注意事项

翻译文件修改后需**强制刷新浏览器**（Ctrl+Shift+R）或重启开发服务器，因为 JSON 文件是静态导入，Vite HMR 不会自动重载。

## 关键业务概念

- **交易（Transaction）**：一条收支或投资记录，包含日期、类型、金额、分类、描述、操作人
- **类型（TransactionType）**：`expense`（消费）、`income`（收入）、`investment`（投资）三种，investment 用于区分非消费性支出
- **分类（Category）**：交易的归类标签，按类型独立管理（消费/收入/投资各有独立分类体系）。支持新增、编辑、排序、软删除（有关联交易时停用而非物理删除）。每个分类可设置可选的「AI 描述」字段（`description`），用于辅助 AI 图片识别时的分类匹配
- **操作人（Operator）**：记录这笔账的人，简单文本标识，不涉及用户认证。支持新增、重命名、删除（有关联交易时阻止删除）
- **记账日期**：每次开始记账时选定，本次会话所有条目默认使用该日期

## AI 模型与识别架构

### 模型配置

- 内置模型定义在 `src/main/services/config.service.ts` 的 `BUILTIN_MODELS` 数组中
- 新增模型只需往 `BUILTIN_MODELS` 加一项，`loadConfig()` 会自动同步到用户配置文件
- `loadConfig()` 同步策略：仅从内置定义覆盖 `name` 和 `format`，**不覆盖** `endpoint` 和 `model`（这两者是用户可编辑的）
- 用户配置存储路径：`app.getPath('userData')` 下的 `config.json`（Windows: `%APPDATA%/moneta/`）
- API Key 使用 Electron `safeStorage` 加密后以 base64 存储

### AI 适配器

- 适配器模式：`src/main/services/ai-adapters/`，通过 `AIAdapter` 接口抽象
- 当前仅保留 `OpenAIAdapter`（OpenAI 兼容格式），所有内置模型统一使用此适配器
- `fetchWithTimeout` 默认超时 300 秒（多图识别场景需要较长时间）
- 新增 API 格式时：在 `ai-adapters/` 下创建新适配器，在 `getAdapter()` 中按 `format` 分发

### AI 响应解析

- AI 响应解析采用**多层容错策略**（`parseAIResponse()`）：
  1. 先用正则 `/<\/?[a-zA-Z_][a-zA-Z0-9_-]*>/g` 剥离 XML 标签（如某些模型返回 `<tool_call>...</tool_call>` 包裹）
  2. 尝试从 Markdown 代码块中提取 JSON
  3. 查找第一个 `[` 和最后一个 `]` 提取 JSON 数组
  4. 如果数组解析失败，回退到解析完整 JSON 对象并通过 `extractArray()` 递归查找嵌套数组
- 该策略兼容各种模型输出格式（Markdown 代码块、XML 标签包裹、嵌套 JSON 对象、前后缀文字等）
- Prompt 中将用户现有分类列表以 **JSON 数组**格式传入（每项含 `name` 和可选 `description`），引导 AI 通过 `suggestedCategory` 字段建议分类
- 分类无描述时 JSON 中省略 `description` key，避免冗余；有描述时格式如 `{"name":"正餐","description":"外卖、堂食、食堂"}`

### AI 识别取消机制

- 使用模块级 `AbortController`（`ai-recognition.service.ts`），每次 `recognize()` 创建新实例
- 渲染进程通过独立 IPC 通道 `ai:recognize:abort` 调用 `abortRecognition()` 触发取消
- `fetchWithTimeout()` 接受 `externalSignal` 参数，将外部 abort 信号转发到内部 controller
- 取消 vs 超时区分：检查 `externalSignal.aborted` 判断是用户取消还是超时，返回不同错误消息
- 前端 AI 识别页显示耗时计时器（1 秒间隔）和取消按钮，取消后的错误消息被静默处理不弹 toast

### 配置文件升级策略

- `loadConfig()` 负责配置文件的前向兼容：
  - 自动添加新版本引入的内置模型
  - 自动清理旧版本已移除的模型
  - 验证 `defaultProviderId` 的有效性，失效时自动重置
  - 新增配置字段时，在 `loadConfig()` 中检查 `=== undefined` 并补默认值，确保旧配置文件自动升级
- 用户升级应用后无需手动操作配置文件

## 应用安全与锁屏架构

### PIN 码存储

- PIN 存储在 `config.json`（应用级配置），不存数据库（非业务数据）
- 使用 SHA-256 + 随机 salt 哈希，格式 `salt:hash`，再通过 Electron `safeStorage` 加密存储
- `config.service.ts` 导出通用的 `encryptString()` / `decryptString()` 辅助函数，供 PIN 和 API Key 等场景复用
- 安全逻辑（连续错误锁定、计数重置）在 `src/main/services/pin.service.ts` 中实现

### 锁屏流程

- `App.tsx` 通过 Zustand store（`auth.store.ts`）的状态做条件渲染：`!initialized` → 加载中 | `!hasPIN` → 首次设置 | `isLocked` → 锁屏 | 否则 → 正常路由
- `MainApp` 作为独立组件提取，确保 `useAutoLock()` hook 仅在解锁后运行
- 锁屏不创建独立 Electron 窗口，保持单窗口简单架构

### 自动锁屏

- `useAutoLock()` hook 监听 6 种用户活动事件（mousedown、mousemove、keydown、scroll、touchstart、click），使用 `passive: true`
- 超时后调用 `authStore.lock()`，`autoLockMinutes <= 0` 时禁用自动锁屏
- 配置存储在 `config.json` 的 `autoLockMinutes` 字段

### 可复用组件模式

- `PinInput` 组件使用 `forwardRef` + `useImperativeHandle` 暴露 `clear()`、`shake()`、`focus()` 方法，供父组件控制状态
- 该组件被 `LockScreen`、`PinSetup`、`PinManager` 三处复用

### ContextMenu 右键菜单组件

通用右键菜单组件（`src/renderer/src/components/ContextMenu/index.tsx`）：

**使用场景**
- 图表数据块右键操作（查看明细）
- 任何需要自定义右键菜单的交互

**API 设计**
| 属性 | 类型 | 说明 |
|------|------|------|
| `visible` | boolean | 是否显示 |
| `x` | number | 菜单位置 X（clientX） |
| `y` | number | 菜单位置 Y（clientY） |
| `items` | MenuItem[] | 菜单项数组 |
| `onClose` | () => void | 关闭回调 |

**MenuItem 结构**
```typescript
interface MenuItem {
  key: string      // 唯一标识
  label: string    // 显示文本
  onClick: () => void  // 点击回调
}
```

**实现要点**
- 使用 `position: fixed` 定位，避免父容器裁剪
- 自动调整位置防止超出视口边界
- 点击外部或按 ESC 键自动关闭
- 支持悬停高亮效果

**使用示例**
```typescript
const [contextMenu, setContextMenu] = useState({
  visible: false, x: 0, y: 0, /* ... */ })

// 在容器上绑定右键事件
<div onContextMenu={(e) => {
  e.preventDefault()
  setContextMenu({ visible: true, x: e.clientX, y: e.clientY, ... })
}}>
  {/* 内容 */}
</div>

// 渲染菜单
<ContextMenu
  visible={contextMenu.visible}
  x={contextMenu.x}
  y={contextMenu.y}
  items={[{ key: 'view', label: '查看', onClick: handleView }]}
  onClose={() => setContextMenu(prev => ({ ...prev, visible: false }))}
/>
```

## AI 识别确认界面架构

### 数据流与状态管理

AI 识别确认界面（`AIRecognition/index.tsx`）采用纯前端状态管理，无需与主进程通信即可完成的增删改操作：

| 操作 | 状态更新方式 | 说明 |
|------|-------------|------|
| 插入行 | `setResults((prev) => splice(index, 0, newRow))` | 在当前行上方插入，继承类型和操作人 |
| 追加行 | `setResults((prev) => [...prev, newRow])` | 在表格末尾添加 |
| 删除行 | `filter((row) => row.key !== key)` | 按 key 过滤移除 |
| 更新字段 | `map((row) => row.key === key ? {...row, field} : row)` | 全字段可编辑 |

### 行标识策略

- **AI 识别结果**：使用服务端返回的 key（如 `item-${index}` 或 UUID）
- **手动插入行**：使用 `manual-${timestamp}-${random}` 前缀，便于区分来源和调试

### 默认值继承模式

新插入行采用「智能继承」策略减少用户输入：

```typescript
const newRow = {
  key: `manual-${Date.now()}-${random}`,
  type: currentRow.type,           // 继承：用户通常连续录入同类型交易
  operator_id: currentRow.operator_id,  // 继承：同一批录入通常同一操作人
  amount: 0,                       // 清空：金额必须重新输入
  description: '',                 // 清空：描述各不相同
  category_id: null                // 清空：触发必填校验和高亮
}
```

### 编辑状态设计

- **全量编辑模式**：所有行始终处于可编辑状态，无需「进入编辑」开关
- **实时校验**：分类为空时 `status="error"`，行背景色变为红色（`row-missing-category`）
- **批量提交校验**：点击「确认录入」时检查所有行的 `category_id`、全局日期和操作人是否已设置，任一缺失则阻止提交并提示

### 日期与操作人必填机制

- **初始留空**：日期选择器和操作人选择器默认为空（`null`），不预填任何默认值，要求用户主动确认
- **视觉提示**：未选择时显示 `status="error"` 红色边框 + placeholder 文本
- **提交校验**：`handleConfirm` 中依次检查分类 → 日期 → 操作人，未填则 `message.error` 提示
- **操作人联动**：全局操作人选择器变化时，`onChange` 中同步更新所有行的 `operator_id`
- **MCP 日期清空**：MCP 数据中携带的日期在确认页统一清空，使用全局日期选择器

## 统计报表架构

### 页面结构

统计报表页（`src/renderer/src/pages/Statistics/`）采用组件拆分模式：

| 组件 | 职责 |
|------|------|
| `index.tsx` | 页面容器，管理视图切换、筛选状态和数据请求 |
| `FilterBar.tsx` | 筛选器（年份 / 类型），支持通过 `showYearFilter` 控制年份选择器显隐 |
| `CrossTable.tsx` | 月度明细交叉统计表（分类 × 12 月 + 合计） |
| `YearlyTable.tsx` | 年度汇总表（年份 × 分类 + 合计） |
| `BarChart.tsx` | 堆叠柱状图（月度趋势） |
| `YearlyBarChart.tsx` | 堆叠柱状图（年度趋势） |

### 视图切换模式

- 页面顶部通过 `Radio.Group`（按钮样式）切换「月度明细」和「年度汇总」两个视图
- `viewTab` 状态驱动：筛选器显隐（年度汇总隐藏年份选择器）、数据请求（调用不同 API）、表格和图表的条件渲染
- 两个视图共享类型筛选器，切换视图不重置筛选状态

### 数据流

- 页面级状态（`year`、`type`、`viewTab`）驱动数据请求，筛选变化时通过 `useCallback` + `useEffect` 自动重新查询
- 月度明细：`CrossTableData` 同时供表格和月度趋势柱状图复用
- 年度汇总：`YearlyCategoryData` 同时供表格和年度趋势柱状图复用
- 初始化时加载年份范围（`db:stats:year-range`）

### Repository 层查询模式

- `stats.repo.ts` 导出独立函数（`getCrossTable`、`getYearlyCategory`、`getSummary`、`getYearRange`），不使用类实例
- 交叉统计表查询：SQL 按 `(category_id, month)` 分组聚合后，在 JS 层做 pivot 转换为行列结构
- 年度汇总表查询：SQL 按 `(year, category_id)` 分组聚合，JS 层先收集所有出现的分类作为列定义（保持 `sort_order` 顺序），再按年份组装行数据
- 汇总卡片查询：封装 `sumAmount()` 内部函数复用日期范围求和逻辑，处理跨年月份（1 月的上月 = 去年 12 月）
- 年份范围：`MIN/MAX(strftime('%Y', date))` 确定数据库中的年份边界，无数据时回退到当前年份

### IPC 通道

| 通道 | 用途 |
|------|------|
| `db:stats:cross-table` | 交叉统计表数据（按年/类型聚合） |
| `db:stats:yearly-category` | 年度汇总表数据（按类型聚合，跨所有年份） |
| `db:stats:summary` | 汇总卡片数据（本月/上月/年度合计） |
| `db:stats:year-range` | 数据库中交易数据的年份范围 |

### 统计表格列宽策略

- 金额列使用 `minWidth`（而非固定 `width`），允许列根据内容自适应拉伸
- `scroll.x` 设为 `'max-content'`，确保表格宽度由内容决定
- 排序列激活时 `minWidth` 增大（如 100→140），为百分比文字留出空间
- 固定列（分类/年度列 `fixed: 'left'`，合计列 `fixed: 'right'`）仍使用 `width` 保持固定宽度

### 图表交互模式

- 堆叠柱状图（`BarChart`、`YearlyBarChart`）统一使用「图例独显」交互：
  - 单击图例项 → 独显该分类（隐藏其他所有系列）
  - 再次单击已独显的项 → 恢复全部显示
  - 通过 `soloRef` 跟踪当前独显状态，`onEvents.legendselectchanged` 拦截原生行为
- Tooltip 按金额降序排列，过滤 0 值，多系列时显示合计行

### 图表数据下钻（右键查看明细）

趋势柱状图支持右键点击数据块，跳转至数据浏览页查看明细：

**实现要点**
- 图表容器使用 `div` 包裹，在容器上绑定 `onContextMenu` 原生事件
- 使用 `chart.convertFromPixel({ gridIndex: 0 }, [x, y])` 将像素坐标转换为数据坐标
- 堆叠柱状图需要特殊处理：根据 y 值和 series 的累积值计算点击的是哪个分类
- 自定义 `ContextMenu` 组件使用 `position: fixed` 定位，支持点击外部关闭

**状态传递**
- 筛选条件通过 URL query parameters 传递：`dateFrom`、`dateTo`、`type`、`category_id`
- 数据浏览页使用 `useSearchParams` 解析参数，自动应用筛选
- 表格列通过 `filteredValue` 属性显示当前筛选状态

**代码模式**
```typescript
// 堆叠柱状图检测点击的分类
let cumulativeValue = 0
for (let i = 0; i < series.length; i++) {
  const seriesData = series[i].data[dataIndex] || 0
  if (yValue >= cumulativeValue && yValue <= cumulativeValue + seriesData) {
    // 点击的是 series[i]
    break
  }
  cumulativeValue += seriesData
}

// 导航到数据浏览页
navigate(`/?dateFrom=${dateFrom}&dateTo=${dateTo}&category_id=${categoryId}&type=${type}`)
```

## 颜色体系

交易类型在整个应用中使用统一的颜色体系（定义在 `src/shared/constants/transaction-type.ts`）：

| 类型 | Tag 颜色 | 行背景色（淡色） |
|------|----------|-----------------|
| 消费（expense） | orange | `#fff7e6` |
| 收入（income） | green | `#f6ffed` |
| 投资（investment） | blue | `#e6f4ff` |

新增涉及类型颜色的 UI 时，应保持与此体系一致。

## 数据浏览与可编辑表格模式

### 服务端分页、排序与筛选

- 列表查询统一通过 `TransactionListParams` 传参，由 `findAll()` 在 SQL 层完成排序和筛选，确保对全量数据生效
- 排序参数：`sortField`（白名单：`date` / `amount`）+ `sortOrder`（`ascend` / `descend`），默认按日期降序
- 筛选参数：支持单值（`type`、`category_id`、`operator_id`）和多值（`types[]`、`category_ids[]`、`operator_ids[]`），多值使用 `IN (...)` 参数化查询
- 关键字搜索：`keyword` 参数对应 `description LIKE %keyword%`
- Ant Design Table 的 `sorter` 和 `filters` 仅用于 UI 指示器（`sorter: true`、`filters: [...]`），不在前端做实际排序/筛选（即不使用 comparator 函数或 `onFilter` 回调）

### 行内编辑模式

- 采用 `editingKey` + `editingRow` 状态控制：`editingKey` 记录正在编辑的行 ID，`editingRow` 存储编辑中的临时值
- 新增行使用独立的 `newRow` 状态，与编辑互斥（同一时间只能处于「新增」或「编辑某行」之一）
- `renderCell()` 函数根据 `isEditing` 判断渲染只读态或编辑控件
- 类型变更时需检查分类是否仍属于新类型（`getCategoriesForType()`），不匹配则自动清空
- `update` API 使用动态 SET 子句，仅发送变更字段（`UpdateTransactionDTO`）
- 日期记忆：`lastInputDate` 在新增行保存后更新，会话内有效

### URL 参数驱动的筛选

数据浏览页支持从 URL query parameters 解析筛选条件，用于图表下钻等场景：

**支持的参数**
| 参数 | 类型 | 说明 |
|------|------|------|
| `dateFrom` | string | 日期范围开始（YYYY-MM-DD） |
| `dateTo` | string | 日期范围结束（YYYY-MM-DD） |
| `type` | enum | 交易类型（expense/income/investment） |
| `category_id` | number | 分类 ID |
| `keyword` | string | 关键词搜索（描述字段） |

**实现要点**
- 使用 `useSearchParams` 解析 URL 参数
- 在 `useEffect` 中初始化时解析并应用筛选条件
- 日期范围需要同时设置 `dateFrom` 和 `dateTo` 才生效
- 表格列通过 `filteredValue` 属性同步筛选状态显示

**示例 URL**
```
/?dateFrom=2024-10-01&dateTo=2024-10-31&category_id=5&type=expense
```

### Repository 层 CRUD 模式

- `create()`：INSERT 后通过 `result.lastInsertRowid` 查回完整行返回
- `update()`：动态构建 SET 子句（仅更新非 `undefined` 字段），始终追加 `updated_at = datetime('now', 'localtime')`
- `remove()`：交易物理删除（不同于分类的软删除）
- `batchDelete()`：`WHERE id IN (...)` 参数化，包裹在 `db.transaction()` 中
- `batchCreate()`：批量插入时使用 **条件分支策略**处理可选字段（如 `created_at`）：
  - 有自定义时间值 → 使用带该字段的 INSERT 语句
  - 无自定义时间值 → 使用数据库默认值（省略该字段）
  - 避免在 `stmt.run()` 中使用 `db.prepare().get()` 作为默认值（会返回对象而非标量）

### 金额显示

- 金额在只读态使用 `toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })` 显示千分号
- 编辑态使用 `InputNumber` 组件，`precision=2`，允许输入正数和负数，但不允许为 0

## 导航与页面架构

### 侧栏结构

侧栏仅保留高频入口，低频功能收纳到设置页：

| 菜单项 | 路由 | 说明 |
|--------|------|------|
| 数据浏览 | `/` | 交易列表 + 手工录入 + 图片识别导入入口 |
| 统计报表 | `/statistics` | 月度明细/年度汇总切换 + 趋势柱状图 |
| 设置 | `/settings` | 分类管理、操作人管理、AI 模型、安全设置、数据管理 |
| 锁屏 | — | 调用 `authStore.lock()`，无独立路由 |

### 新增数据入口设计

「新增数据」的两种方式统一放在数据浏览页工具栏：
- **手工录入**：展开行内新增表单（原「新增」按钮）
- **图片识别导入**：跳转至 `/ai-recognition` 页面，完成后自动返回数据浏览页

AI 识别页（`/ai-recognition`）保留独立路由但**不在侧栏显示**，仅通过数据浏览页的按钮进入，页面顶部有返回按钮。

### 设置页 Tab 结构

| Tab key | 标签 | 组件 |
|---------|------|------|
| `categories` | 分类管理 | `CategoryManager` |
| `operators` | 操作人管理 | `OperatorManager` |
| `ai-providers` | AI 模型 | `AIProviderManager` |
| `security` | 安全设置 | `PinManager` |
| `data` | 数据管理 | `DataManager` |

Tab 状态通过 URL search params（`?tab=xxx`）持久化，支持直接链接跳转（如 `#/settings?tab=data`）。

## 数据管理

### 数据清空操作

提供两个层级的数据清空（均在设置页「数据管理」Tab 中）：

| 操作 | IPC 通道 | 清空范围 | 保留内容 |
|------|----------|----------|----------|
| 清空交易记录 | `db:data:clear-transactions` | 交易 + 操作人 | 所有分类 |
| 恢复出厂设置 | `db:data:factory-reset` | 交易 + 操作人 + 自定义分类 | 系统预置分类（`is_system=1`，且重置为启用状态） |

- 两种操作均包裹在 `db.transaction()` 中确保原子性
- 前端使用 `Modal.confirm` 二次确认，按钮为 `danger` 样式
- `categoryRepo.deleteAllCustom()`：删除 `is_system = 0` 的分类
- `categoryRepo.resetSystemCategories()`：将 `is_system = 1` 的分类重置为 `is_active = 1`

### 数据导出

- 导出入口位于设置页「数据管理」Tab，支持 Excel（.xlsx）和 CSV（.csv）两种格式
- Excel 使用 `xlsx-js-style`（SheetJS 的样式增强 fork，**不是** `xlsx`），支持表头背景色（`#4472C4`）、白色粗体字体、金额千分位格式（`#,##0.00`）和列宽设置
- CSV 使用 UTF-8 with BOM 编码（`\uFEFF` 前缀），确保 Excel 打开中文不乱码，字段转义遵循 RFC 4180
- 工作表名 `detail`，列结构：日期、类型、金额、分组、描述、操作人、**添加时间**（7列）
- 导出按日期升序排列（与用户 Excel 习惯一致，区别于数据浏览页的默认降序）
- `findAllForExport()` 独立于 `findAll()`：JOIN categories + operators 直接返回展示用字段（含 `created_at`），无分页，日期升序
- `countForExport()` 用于筛选条件变化时的记录数预览，前端加 300ms debounce 防抖

### 数据导入

- 导入入口位于设置页「数据管理」Tab，支持 Excel（.xlsx）格式
- 导入模式为全量覆盖（清空现有交易和操作人后重新导入）
- **向后兼容**：支持旧格式（6列）和新格式（7列，含添加时间）
- 添加时间解析策略：
  - 文件含「添加时间」列 → 使用该值作为 `created_at`，保持原始时间
  - 文件不含该列 → 使用当前时间作为 `created_at`
  - 支持格式：`YYYY-MM-DD HH:mm:ss`、Excel 序列号、纯日期（补全 `00:00:00`）
- 导入成功后自动返回数据浏览页面（1.5秒延迟）

### SQL 筛选逻辑复用

- `transaction.repo.ts` 中提取了 `buildWhereClause()` 公共函数，被 `findAll()`、`countForExport()`、`findAllForExport()` 三处复用
- WHERE 条件中使用 `t.` 表别名前缀（如 `t.date`、`t.type`），兼容 JOIN 查询和单表查询
- 支持的筛选参数：`dateFrom`/`dateTo`、`type`/`types[]`、`category_id`/`category_ids[]`、`operator_id`/`operator_ids[]`、`keyword`
- 新增筛选条件时只需修改 `buildWhereClause()` 一处，所有查询自动生效

### 默认排序

- 数据浏览页默认按日期逆序（`sortField: 'date', sortOrder: 'descend'`），确保用户打开即看到最新数据
- 初始查询参数和 `queryParams` 状态默认值均设置了该排序，Ant Design Table 列定义通过 `defaultSortOrder: 'descend'` 显示排序指示器

## 导入草稿自动保存架构

### 设计决策

- **全局唯一草稿**：AI 识别和 MCP 导入共用同一张表 `import_draft`，单行设计（`id = 'current'`），始终只保留一份草稿
- **覆盖策略**：新导入自动覆盖旧草稿，无需用户确认，降低使用门槛
- **差异化恢复入口**：
  - 数据浏览页显示草稿提示卡片，提供「继续导入」和「放弃」按钮
  - MCP 新数据直接覆盖旧草稿，仅显示弱提示，不打断 AI 助手工作流

### 草稿保存策略

采用 **`useEffect` 响应式即时保存**，监听 `rows`、`defaultOperatorId`、`accountingDate` 状态变化：

| 场景 | 保存行为 | 实现方式 |
|------|---------|---------|
| 首次进入导入页（全新导入） | 立即创建草稿 | `useEffect` 初始化时创建 |
| 首次进入导入页（恢复草稿） | 跳过创建 | `restoredFromDraft` prop 控制 |
| 任何编辑操作 | 即时保存 | `useEffect` 监听状态变化自动触发 |
| 确认入库 | 删除草稿 | `clearDraft()` 清理数据 |
| MCP 退出确认页 | 清除 pending 数据 | `handleCancel` 中调用 `clearImportData()` |

**设计要点**：
- 不使用防抖：单条草稿的 JSON 序列化 + SQLite 写入性能足够（亚毫秒级），无需延迟
- 跳过首次渲染：`isInitialRenderRef` 防止初始化时重复保存
- 无闭包陷阱：`useEffect` 依赖数组确保始终使用最新状态值

### 草稿恢复策略

- ImportConfirm 新增 `restoredFromDraft` prop，恢复草稿时跳过初始草稿创建，避免覆盖用户编辑
- 新增 `initialOperatorId` prop，恢复草稿时还原全局操作人选择
- `initialAccountingDate` prop 恢复草稿时还原日期选择
- MCPImport 的 `handleCancel` 中调用 `clearImportData()` 清除 pending MCP 数据，防止再次进入时旧数据覆盖草稿

### 性能优化

- **虚拟滚动**：`Table` 组件启用 `virtual` 属性，配合固定高度 `scroll.y`，流畅支持 100+ 条数据编辑
- **Columns 缓存**：使用 `useMemo` 缓存表格列配置，避免每次渲染重新创建

### 状态管理

- **Zustand Store**：`draft.store.ts` 提供缓存的草稿摘要，用于数据浏览页提示显示
- **直接数据库查询**：判断覆盖、加载草稿等关键操作直接查询数据库，不依赖本地缓存，确保状态准确
- **useRef 标志**：`hasCheckedDraftRef` 和 `importedRef` 用于控制单次检查和阻止导入后轮询

## MCP (Model Context Protocol) 架构

### 整体架构

MCP 功能采用**分离式架构**：MCP Server 作为独立进程通过 stdio 与 Claude Desktop 通信，通过 HTTP 与 Moneta 主应用通信。

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude Desktop │ ←→  │   MCP Server    │ ←→  │  Moneta Main    │
│   (stdio)       │     │  (stdio + HTTP) │     │  (HTTP Server)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                               ┌────────┴────────┐
                                               ↓                 ↓
                                          ┌─────────┐      ┌──────────┐
                                          │ SQLite  │      │ Import   │
                                          │   DB    │      │ Confirm  │
                                          └─────────┘      └──────────┘
```

### 组件职责

| 组件 | 路径 | 职责 |
|------|------|------|
| MCP Server | `src/mcp/` | stdio 模式 MCP 服务器，暴露 3 个 tools |
| MCP HTTP Client | `src/mcp/http-client.ts` | MCP Server 向主应用查询数据的 HTTP 客户端 |
| MCP HTTP Server | `src/main/services/mcp-http-server.ts` | 主应用内的 HTTP 服务器，端口可配置 |
| MCP Config Service | `src/main/services/mcp-config.service.ts` | Claude Desktop 配置管理、端口配置 |
| MCP Config IPC | `src/main/ipc/mcp-config.ipc.ts` | 配置相关 IPC 处理器 |
| MCP Import IPC | `src/main/ipc/mcp-import.ipc.ts` | 导入请求处理、渲染进程通知 |
| ImportConfirm | `src/renderer/src/components/ImportConfirm/` | 共享导入确认组件（AI 识别和 MCP 共用） |
| MCP Import Page | `src/renderer/src/pages/MCPImport/` | MCP 导入确认页面 |
| MCP Config UI | `src/renderer/src/pages/Settings/MCPConfigManager.tsx` | MCP 配置界面 |

### Tools 列表

| Tool | 功能 | 对应 HTTP 端点 |
|------|------|----------------|
| `get_categories` | 获取分类列表 | `GET /api/categories` |
| `get_operators` | 获取操作人列表 | `GET /api/operators` |
| `send_transactions` | 发送交易数据打开确认界面 | `POST /mcp-import` |

### HTTP 端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/categories` | GET | 查询所有分类（可选 `?type=expense` 筛选） |
| `/api/operators` | GET | 查询所有操作人 |
| `/mcp-import` | POST | 接收交易数据，通知渲染进程打开确认界面 |

### 端口配置机制

**默认端口**：9615（范围 1025-65535）

**配置存储**：`app.getPath('userData')/mcp-config.json`

**环境变量传递**：
- 写入 `claude_desktop_config.json` 时，将端口放入 `env.MONETA_MCP_PORT`
- MCP Server 启动时从环境变量读取端口，默认 9615

```typescript
// 配置写入
const serverConfig = {
  command: 'node',
  args: [mcpServerPath, '--mcp'],
  env: { MONETA_MCP_PORT: String(port) }
}

// MCP Server 读取
const MCP_HTTP_PORT = process.env.MONETA_MCP_PORT 
  ? parseInt(process.env.MONETA_MCP_PORT, 10) 
  : 9615
```

### 端口变更处理流程

1. 用户在设置页修改端口 → 保存到 `mcp-config.json`
2. 点击「配置 Claude Desktop」时：
   - 检测当前运行端口 vs 配置端口
   - 不一致则先 `stop()` 再 `start()` 重启 HTTP Server
   - 将新端口写入 `claude_desktop_config.json` 的 `env`
3. 提示用户重启 Claude Desktop
4. MCP Server 重启后读取新端口的环境变量

### 共享导入确认组件

AI 图片识别和 MCP 导入共用 `ImportConfirm` 组件：

```
┌─────────────────┐      ┌─────────────────┐
│  AI Recognition │ ───→ │                 │
│  (/ai-recognition)│     │  ImportConfirm  │ ──→ 数据库
│                 │      │  (Component)    │
│  MCP Import     │ ───→ │                 │
│  (/mcp-import)  │      │                 │
└─────────────────┘      └─────────────────┘
```

**差异处理**：
- AI 识别：日期由页面顶部选择器统一指定，表格中不显示日期列
- MCP 导入：每行独立日期字段，表格显示日期列
- 通过 `showDateColumn` prop 控制列显隐

### IPC 通道（MCP 相关）

| 通道 | 方向 | 用途 |
|------|------|------|
| `mcp:status` | invoke | 获取 MCP 配置状态 |
| `mcp:configure` | invoke | 配置 Claude Desktop |
| `mcp:http-server:start` | invoke | 启动 HTTP Server |
| `mcp:http-server:stop` | invoke | 停止 HTTP Server |
| `mcp:http-server:status` | invoke | 获取 HTTP Server 状态 |
| `mcp:port:update` | invoke | 更新端口配置 |
| `mcp:import:request` | on | 监听 MCP 导入请求，打开确认界面 |
| `mcp:import:confirm` | invoke | 确认导入，写入数据库 |
| `mcp:import:cancel` | invoke | 取消导入 |

### MCP Server 入口

- **开发环境**：`node out/main/mcp.js --mcp`
- **生产环境**：`node <app>/out/main/mcp.js --mcp`
- 通过 `getMCPServerPath()` 动态解析路径，支持 asar 打包场景

### 配置文件位置

| 平台 | Claude Desktop 配置路径 |
|------|------------------------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%/Claude/claude_desktop_config.json` |

### 状态标识

**HTTP Server 状态**（界面显示）：
- 运行中：绿色 Tag
- 已停止：黄色 Tag

**Claude Desktop 配置状态**：
- 已配置：绿色 Tag（`moneta` 存在于 `mcpServers`）
- 未配置：黄色 Tag

### 代码约定

**MCP Server 代码组织**（`src/mcp/`）：
- `index.ts`：入口，stdio 模式检测， graceful shutdown 处理
- `server.ts`：`MonetaMcpServer` 类，MCP 协议实现
- `http-client.ts`：HTTP 客户端，供 tools 调用
- `types.ts`：MCP 相关类型定义
- `tools/`：各 tool 的实现，每个文件导出 `name`、`description`、`inputSchema`、`handler`

**Tool 实现模式**：
```typescript
export const name = 'tool_name'
export const description = '工具描述，供 AI 理解用途'
export const inputSchema = { /* JSON Schema */ }
export async function handler(params: Params): Promise<Result> {
  // 实现
}
```

**HTTP Server 类设计**：
- 单例模式（`mcpHttpServer` 实例导出）
- 状态监听：`addStatusListener()` / `removeStatusListener()`
- 端口管理：`getPort()` / `getConfiguredPort()` / `setPort()` / `isRunning()`
- 生命周期：`start()` / `stop()` / `restart()`

### MCP Skill 文档

AI 助手使用指南位于 `resources/skills/mcp-moneta-import.md`：
- 工具使用流程说明
- 分类匹配示例表
- 日期/金额格式转换规范
- 错误处理建议

---

## 跨页面导航与状态传递

### URL 驱动的状态恢复模式

当需要实现「页面 A → 页面 B → 返回页面 A 并恢复状态」的交互流程时，采用 URL query parameters 传递状态，避免使用全局状态管理（如 Zustand）或 localStorage。

**适用场景**：
- 统计页趋势图「查看明细」→ 数据浏览页 → 返回统计页
- 任何需要保留源页面状态的跳转场景

**URL 参数设计**：
```typescript
// 跳转时附加源页面状态参数
queryParams.set('from', 'statistics')        // 来源标识
queryParams.set('year', String(year))        // 年份筛选
queryParams.set('tab', 'monthly')            // 视图 Tab
queryParams.set('statsType', type)           // 统计页类型（与筛选 type 区分）
queryParams.set('soloCategory', category)    // 图表独显状态（可选）
```

**目标页面检测与恢复**：
```typescript
// 数据浏览页检测来源
const fromStats = searchParams.get('from') === 'statistics'

// 统计页恢复状态
const urlYear = searchParams.get('year')
const [year, setYear] = useState(
  urlYear ? parseInt(urlYear, 10) || currentDate.getFullYear() : currentDate.getFullYear()
)
```

**返回按钮实现**：
- 位置：页面标题栏左侧，使用 `ArrowLeftOutlined` 图标
- 显示条件：`fromStats === true`
- 导航方式：`navigate('/source-page?...', { replace: true })` 避免历史循环
- 代码组织：相关变量和函数放在组件顶部，与其他 hooks 一起声明

### ECharts 状态恢复时序处理

图表交互状态（如独显的分类）需要在组件挂载后恢复，但 ECharts 实例初始化需要时间。

**解决方案**：
```typescript
useEffect(() => {
  if (!initialSoloCategory || !data) return
  
  const chart = chartRef.current?.getEchartsInstance()
  if (!chart) return
  
  // 延迟到下一个事件循环，确保 ECharts 渲染完成
  setTimeout(() => {
    // 恢复独显状态：先全选，再反选其他
    chart.dispatchAction({ type: 'legendAllSelect' })
    for (const name of allNames) {
      if (name !== initialSoloCategory) {
        chart.dispatchAction({ type: 'legendUnSelect', name })
      }
    }
  }, 0)
}, [data, initialSoloCategory])
```

**注意事项**：
- 检查分类是否存在且有数据，避免无效操作
- `setTimeout(..., 0)` 比 `requestAnimationFrame` 更可靠
- 不需要清理函数，因为 ECharts 动作是幂等的

### 状态命名约定

| 参数 | 用途 | 示例值 |
|------|------|--------|
| `from` | 来源页面标识 | `statistics`, `dashboard` |
| `year` | 年份筛选值 | `2024` |
| `tab` | 视图 Tab 状态 | `monthly`, `yearly` |
| `statsType` | 源页面类型状态 | `expense`, `income`, `investment` |
| `soloCategory` | 图表独显分类名 | `正餐` |

**命名原则**：
- 源页面状态加前缀区分（如 `statsType` vs 筛选用的 `type`）
- 即使当前值相同，也要保持语义清晰，为未来扩展留余地
- 布尔标识使用字符串（`from=statistics` 而非 `fromStatistics=true`）

