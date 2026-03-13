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
| 数据库 | SQLite | 通过 better-sqlite3 访问（同步 API） |
| 状态管理 | Zustand | 轻量级状态管理 |
| UI 组件库 | Ant Design 5 | 桌面端组件风格 |
| 图表 | ECharts / Apache ECharts | 统计报表可视化 |
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
- 每个迁移文件包含 `-- up` 和 `-- down` 两部分
- 应用启动时自动执行未运行的迁移
- 迁移必须是幂等的，先检查再执行

## 关键业务概念

- **交易（Transaction）**：一条收支或投资记录，包含日期、类型、金额、分类、描述、操作人
- **类型（TransactionType）**：`expense`（消费）、`income`（收入）、`investment`（投资）三种，investment 用于区分非消费性支出
- **分类（Category）**：交易的归类标签，按类型独立管理（消费/收入/投资各有独立分类体系）。支持新增、编辑、排序、软删除（有关联交易时停用而非物理删除）
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

- AI 响应解析采用**容错策略**：查找第一个 `[` 和最后一个 `]` 来提取 JSON 数组
- 该策略兼容各种模型输出格式（Markdown 代码块、特殊 token 包裹、前后缀文字等）
- Prompt 中将用户现有分类列表作为上下文传入，引导 AI 通过 `suggestedCategory` 字段建议分类

### 配置文件升级策略

- `loadConfig()` 负责配置文件的前向兼容：
  - 自动添加新版本引入的内置模型
  - 自动清理旧版本已移除的模型
  - 验证 `defaultProviderId` 的有效性，失效时自动重置
- 用户升级应用后无需手动操作配置文件

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

### Repository 层 CRUD 模式

- `create()`：INSERT 后通过 `result.lastInsertRowid` 查回完整行返回
- `update()`：动态构建 SET 子句（仅更新非 `undefined` 字段），始终追加 `updated_at = datetime('now', 'localtime')`
- `remove()`：交易物理删除（不同于分类的软删除）
- `batchDelete()`：`WHERE id IN (...)` 参数化，包裹在 `db.transaction()` 中

### 金额显示

- 金额在只读态使用 `toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })` 显示千分号
- 编辑态使用 `InputNumber` 组件，`precision=2`、`min=0.01`
