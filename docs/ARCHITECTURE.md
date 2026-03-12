# Moneta — 技术架构文档

## 1. 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Application                     │
│                                                              │
│  ┌─────────────────────┐         ┌────────────────────────┐ │
│  │   Renderer Process   │   IPC   │     Main Process       │ │
│  │                      │ ◄─────► │                        │ │
│  │  React 18 + Zustand  │         │  Services + DB Layer   │ │
│  │  Ant Design + ECharts│         │                        │ │
│  │                      │         │  ┌──────────────────┐  │ │
│  │  ┌────────────────┐  │         │  │  better-sqlite3   │  │ │
│  │  │  Pages         │  │         │  │                    │  │ │
│  │  │  Components    │  │         │  │  ┌──────────────┐ │  │ │
│  │  │  Stores        │  │         │  │  │  SQLite DB   │ │  │ │
│  │  │  Hooks         │  │         │  │  │  (本地文件)   │ │  │ │
│  │  └────────────────┘  │         │  │  └──────────────┘ │  │ │
│  └─────────────────────┘         │  └──────────────────┘  │ │
│                                   │                        │ │
│         ┌──────────┐              │  ┌──────────────────┐  │ │
│         │ Preload  │              │  │  AI Service      │  │ │
│         │ Script   │              │  │  (外部 API 调用)  │  │ │
│         └──────────┘              │  └──────────────────┘  │ │
│                                   └────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**核心设计原则**：

- **主进程负责数据**：所有数据库操作、文件 I/O、外部 API 调用均在主进程完成
- **渲染进程负责 UI**：仅处理界面渲染和用户交互
- **IPC 桥接**：通过类型安全的 IPC 通道通信，preload 脚本暴露最小 API

---

## 2. 技术选型说明

| 技术 | 选型 | 理由 |
|------|------|------|
| 桌面框架 | Electron | 成熟稳定，React 生态完善，跨 Windows/macOS |
| 构建工具 | electron-vite | 为 Electron 优化的 Vite 配置，HMR 快速，开发体验好 |
| 前端框架 | React 18 | 生态丰富、社区活跃、函数组件 + Hooks 模式清晰 |
| 状态管理 | Zustand | 轻量、TS 友好、无 boilerplate，适合中小型应用 |
| UI 组件 | Ant Design 5 | 桌面端风格、组件丰富（Table、Form、DatePicker 等） |
| 图表 | Apache ECharts | 功能强大，支持交叉表热力图、饼图、折线图、柱状图 |
| 数据库 | better-sqlite3 | 同步 API 在 Electron 主进程中使用简单可靠，性能优秀 |
| 语言 | TypeScript | 严格类型检查，减少运行时错误 |
| 打包 | electron-builder | 成熟的跨平台打包方案，支持自动更新 |

---

## 3. 目录结构详细设计

```
moneta/
├── electron.vite.config.ts
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
│
├── docs/
│   ├── PRD.md
│   └── ARCHITECTURE.md
│
├── resources/                          # 应用图标
│   ├── icon.ico                        # Windows
│   └── icon.icns                       # macOS
│
├── src/
│   ├── main/                           # ═══ Electron 主进程 ═══
│   │   ├── index.ts                    # 入口：创建窗口、注册 IPC
│   │   ├── window.ts                   # 窗口管理
│   │   │
│   │   ├── database/                   # 数据库层
│   │   │   ├── connection.ts           # SQLite 连接初始化
│   │   │   ├── migrator.ts             # 迁移执行器
│   │   │   ├── migrations/             # SQL 迁移脚本
│   │   │   │   ├── 001_create_categories.sql
│   │   │   │   ├── 002_create_operators.sql
│   │   │   │   ├── 003_create_transactions.sql
│   │   │   │   └── 004_seed_default_categories.sql
│   │   │   └── repositories/           # 数据访问层
│   │   │       ├── transaction.repo.ts
│   │   │       ├── category.repo.ts
│   │   │       ├── operator.repo.ts
│   │   │       └── stats.repo.ts       # 统计查询
│   │   │
│   │   ├── services/                   # 业务逻辑层
│   │   │   ├── transaction.service.ts
│   │   │   ├── category.service.ts
│   │   │   ├── import-export.service.ts # Excel/CSV 导入导出
│   │   │   ├── ai-recognition.service.ts # AI 截图识别
│   │   │   └── stats.service.ts         # 统计计算
│   │   │
│   │   └── ipc/                        # IPC 处理器注册
│   │       ├── transaction.ipc.ts
│   │       ├── category.ipc.ts
│   │       ├── operator.ipc.ts
│   │       ├── stats.ipc.ts
│   │       ├── import-export.ipc.ts
│   │       └── ai.ipc.ts
│   │
│   ├── preload/                        # ═══ Preload 脚本 ═══
│   │   ├── index.ts                    # contextBridge 暴露 API
│   │   └── index.d.ts                  # 类型声明
│   │
│   ├── renderer/                       # ═══ 渲染进程（React）═══
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx                # React 入口
│   │       ├── App.tsx                 # 根组件 + 路由
│   │       │
│   │       ├── pages/                  # 页面
│   │       │   ├── Dashboard/          # 首页仪表盘
│   │       │   ├── Transactions/       # 交易列表 + 录入
│   │       │   ├── AIRecognition/      # AI 截图识别
│   │       │   ├── Statistics/         # 统计报表
│   │       │   ├── Categories/         # 分类管理
│   │       │   └── ImportExport/       # 导入导出
│   │       │
│   │       ├── components/             # 通用组件
│   │       │   ├── Layout/             # 整体布局（侧边栏 + 内容区）
│   │       │   ├── TransactionForm/    # 交易录入表单
│   │       │   ├── TransactionTable/   # 交易列表表格
│   │       │   ├── DateSelector/       # 记账日期选择器
│   │       │   ├── CategorySelect/     # 分类选择器
│   │       │   ├── OperatorSelect/     # 操作人选择器
│   │       │   ├── CrossTable/         # 交叉统计表组件
│   │       │   └── Charts/             # 图表组件封装
│   │       │
│   │       ├── stores/                 # Zustand 状态
│   │       │   ├── transaction.store.ts
│   │       │   ├── category.store.ts
│   │       │   ├── session.store.ts    # 当前会话状态（记账日期等）
│   │       │   └── ui.store.ts         # UI 状态（侧边栏折叠等）
│   │       │
│   │       ├── hooks/                  # 自定义 Hooks
│   │       │   ├── useTransactions.ts
│   │       │   ├── useCategories.ts
│   │       │   ├── useStats.ts
│   │       │   └── useIPC.ts           # IPC 调用封装
│   │       │
│   │       ├── utils/                  # 工具函数
│   │       │   ├── format.ts           # 金额格式化等
│   │       │   └── date.ts             # 日期处理
│   │       │
│   │       └── styles/
│   │           ├── global.css
│   │           └── variables.css       # CSS 变量 / 主题
│   │
│   └── shared/                         # ═══ 共享代码 ═══
│       ├── types/
│       │   ├── transaction.ts          # Transaction, TransactionType
│       │   ├── category.ts             # Category, CategoryType
│       │   ├── operator.ts             # Operator
│       │   └── stats.ts               # 统计相关类型
│       ├── constants/
│       │   ├── categories.ts           # DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES
│       │   └── config.ts               # 应用配置常量
│       └── ipc-channels.ts             # IPC 频道名称常量
│
└── tests/
    ├── main/
    │   ├── repositories/
    │   └── services/
    └── renderer/
        ├── components/
        └── pages/
```

---

## 4. 数据模型

### 4.1 ER 关系

```
categories (1) ──── (N) transactions (N) ──── (1) operators
```

### 4.2 表结构设计

#### `categories` — 分类表

```sql
CREATE TABLE categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,               -- 分类名称
    type        TEXT    NOT NULL CHECK(type IN ('expense', 'income')),  -- 分类类型
    icon        TEXT    DEFAULT NULL,            -- 图标标识（预留）
    sort_order  INTEGER NOT NULL DEFAULT 0,      -- 排序权重
    is_system   INTEGER NOT NULL DEFAULT 0,      -- 1=系统预置 0=用户自建
    is_active   INTEGER NOT NULL DEFAULT 1,      -- 1=启用 0=停用（软删除）
    created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE UNIQUE INDEX idx_categories_name_type ON categories(name, type);
```

#### `operators` — 操作人表

```sql
CREATE TABLE operators (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,          -- 操作人名称
    is_default  INTEGER NOT NULL DEFAULT 0,       -- 是否为默认操作人
    created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

#### `transactions` — 交易表

```sql
CREATE TABLE transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT    NOT NULL,                -- 交易日期 YYYY-MM-DD
    type         TEXT    NOT NULL CHECK(type IN ('expense', 'income')),
    amount       REAL    NOT NULL CHECK(amount > 0),  -- 金额（正数）
    category_id  INTEGER NOT NULL REFERENCES categories(id),
    description  TEXT    DEFAULT '',              -- 备注描述
    operator_id  INTEGER DEFAULT NULL REFERENCES operators(id),
    created_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 查询优化索引
CREATE INDEX idx_transactions_date       ON transactions(date);
CREATE INDEX idx_transactions_type       ON transactions(type);
CREATE INDEX idx_transactions_category   ON transactions(category_id);
CREATE INDEX idx_transactions_operator   ON transactions(operator_id);
CREATE INDEX idx_transactions_date_type  ON transactions(date, type);  -- 统计查询常用
```

#### `migrations` — 迁移记录表

```sql
CREATE TABLE IF NOT EXISTS migrations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,          -- 迁移文件名
    applied_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

### 4.3 数据模型与 Excel 的映射关系

| Excel 列 | DB 字段 | 说明 |
|-----------|---------|------|
| 日期 | `transactions.date` | 直接映射 |
| 类型 | `transactions.type` | "消费" → `expense`，"收入" → `income` |
| 金额 | `transactions.amount` | 直接映射 |
| 分组 | `categories.name`（通过 `category_id` 关联）| 外键关联 |
| 描述 | `transactions.description` | 直接映射 |
| 操作人 | `operators.name`（通过 `operator_id` 关联）| 外键关联 |

---

## 5. IPC 通信设计

### 5.1 通信模式

采用 **invoke / handle** 模式（请求-响应），所有通道名称集中定义在 `src/shared/ipc-channels.ts`。

### 5.2 频道定义

```typescript
// src/shared/ipc-channels.ts
export const IPC_CHANNELS = {
  // 交易
  TRANSACTION_LIST:    'db:transaction:list',
  TRANSACTION_CREATE:  'db:transaction:create',
  TRANSACTION_UPDATE:  'db:transaction:update',
  TRANSACTION_DELETE:  'db:transaction:delete',
  TRANSACTION_BATCH_CREATE: 'db:transaction:batch-create',  // AI 识别批量入库

  // 分类
  CATEGORY_LIST:       'db:category:list',
  CATEGORY_CREATE:     'db:category:create',
  CATEGORY_UPDATE:     'db:category:update',
  CATEGORY_DELETE:     'db:category:delete',
  CATEGORY_REORDER:    'db:category:reorder',

  // 操作人
  OPERATOR_LIST:       'db:operator:list',
  OPERATOR_CREATE:     'db:operator:create',

  // 统计
  STATS_CROSS_TABLE:   'db:stats:cross-table',    // 交叉统计表
  STATS_SUMMARY:       'db:stats:summary',          // 汇总数据
  STATS_TREND:         'db:stats:trend',             // 趋势数据

  // 导入导出
  IMPORT_PREVIEW:      'io:import:preview',
  IMPORT_EXECUTE:      'io:import:execute',
  EXPORT_EXECUTE:      'io:export:execute',

  // AI 识别
  AI_RECOGNIZE:        'ai:recognize',

  // 文件对话框
  DIALOG_OPEN_FILE:    'dialog:open-file',
  DIALOG_SAVE_FILE:    'dialog:save-file',
} as const;
```

### 5.3 Preload 暴露的 API

```typescript
// src/preload/index.ts — 暴露给渲染进程的 API
export interface MonetaAPI {
  transaction: {
    list(params: ListParams): Promise<PaginatedResult<Transaction>>;
    create(data: CreateTransactionDTO): Promise<Transaction>;
    update(id: number, data: UpdateTransactionDTO): Promise<Transaction>;
    delete(id: number): Promise<void>;
    batchCreate(items: CreateTransactionDTO[]): Promise<Transaction[]>;
  };
  category: {
    list(type?: TransactionType): Promise<Category[]>;
    create(data: CreateCategoryDTO): Promise<Category>;
    update(id: number, data: UpdateCategoryDTO): Promise<Category>;
    delete(id: number): Promise<void>;
    reorder(ids: number[]): Promise<void>;
  };
  operator: {
    list(): Promise<Operator[]>;
    create(name: string): Promise<Operator>;
  };
  stats: {
    crossTable(params: CrossTableParams): Promise<CrossTableData>;
    summary(params: SummaryParams): Promise<SummaryData>;
    trend(params: TrendParams): Promise<TrendData>;
  };
  importExport: {
    preview(filePath: string): Promise<ImportPreview>;
    executeImport(config: ImportConfig): Promise<ImportResult>;
    executeExport(config: ExportConfig): Promise<string>;  // 返回文件路径
  };
  ai: {
    recognize(imageBase64: string): Promise<RecognizedTransaction[]>;
  };
  dialog: {
    openFile(filters: FileFilter[]): Promise<string | null>;
    saveFile(filters: FileFilter[], defaultName: string): Promise<string | null>;
  };
}
```

---

## 6. AI 截图识别架构

### 6.1 流程

```
渲染进程                         主进程                          外部 AI
┌──────────┐                ┌──────────────┐              ┌─────────────┐
│ 用户粘贴  │  IPC:          │ ai-recognition│  HTTP:       │ Vision API  │
│ 或上传截图 │ ─ai:recognize→ │ .service.ts   │ ──请求────→  │ (Claude /   │
│           │                │               │              │  GPT-4V)    │
│           │                │ 1.图片转base64 │              │             │
│           │                │ 2.构造prompt   │ ◄──响应────  │             │
│ 展示可编辑 │  ◄─返回结果──  │ 3.解析JSON结果 │              └─────────────┘
│ 确认列表   │                │ 4.匹配分类     │
└──────────┘                └──────────────┘
```

### 6.2 AI Prompt 设计要点

- 明确要求返回 JSON 数组格式
- 每条包含：date（如有）、amount、description、type（expense/income）
- 要求 AI 从截图中提取所有可识别的交易条目
- 金额统一为正数

### 6.3 分类匹配策略

```typescript
// 主进程中执行
function matchCategory(description: string, categories: Category[]): Category | null {
  // 1. 关键词匹配表（可配置）
  // 2. 模糊匹配（分词后与分类名比较）
  // 3. 未匹配到返回 null → 前端显示为空，等待用户手动选择
}
```

### 6.4 API 选型

AI 视觉 API 支持可配置，用户在设置中填入 API Key 和 endpoint：
- 默认支持 Claude（Anthropic API）
- 可扩展支持 OpenAI GPT-4V 等
- API Key 加密存储在本地配置文件中

---

## 7. 状态管理设计

使用 Zustand 管理全局状态，按领域拆分 store：

```
stores/
├── session.store.ts        # 当前记账会话
│   ├── currentDate          # 当前选定的记账日期
│   └── currentOperator      # 当前选定的操作人
│
├── transaction.store.ts    # 交易数据
│   ├── transactions[]       # 当前显示的交易列表
│   ├── filters              # 筛选条件
│   ├── loading              # 加载状态
│   └── actions              # CRUD 操作
│
├── category.store.ts       # 分类数据
│   ├── expenseCategories[]
│   ├── incomeCategories[]
│   └── actions
│
└── ui.store.ts             # UI 状态
    ├── sidebarCollapsed
    └── currentPage
```

---

## 8. 构建与打包

### 8.1 工具链

- **开发**：`electron-vite` — 集成 Vite 的 Electron 开发环境
- **打包**：`electron-builder` — 生成安装程序

### 8.2 平台输出

| 平台 | 格式 | 说明 |
|------|------|------|
| Windows | NSIS 安装包 (.exe) | 标准 Windows 安装流程 |
| macOS | DMG 镜像 (.dmg) | 拖拽安装 |

### 8.3 应用数据目录

```
# Windows
%APPDATA%/Moneta/
├── moneta.db               # SQLite 数据库文件
├── config.json             # 用户配置（API Key 等）
└── logs/                   # 应用日志

# macOS
~/Library/Application Support/Moneta/
├── moneta.db
├── config.json
└── logs/
```

---

## 9. 数据库迁移策略

### 9.1 迁移机制

```
应用启动
  │
  ├─ 连接/创建 SQLite 数据库
  ├─ 确保 migrations 表存在
  ├─ 扫描 src/main/database/migrations/ 下所有 .sql 文件
  ├─ 对比已执行记录，找出未执行的迁移
  ├─ 按序号顺序执行未执行的迁移（在事务中）
  └─ 记录已执行的迁移到 migrations 表
```

### 9.2 迁移文件格式

```sql
-- 001_create_categories.sql

-- up
CREATE TABLE IF NOT EXISTS categories (
    ...
);

-- down
DROP TABLE IF EXISTS categories;
```

### 9.3 约定

- 文件名格式：`{三位序号}_{描述}.sql`（如 `001_create_categories.sql`）
- 每个迁移包含 `-- up` 和 `-- down` 标记
- 生产环境仅执行 up，down 用于开发回滚
- 迁移一旦提交不可修改，新变更必须创建新的迁移文件
