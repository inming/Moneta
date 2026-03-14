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
- 每个迁移文件包含 `-- up` 和 `-- down` 两部分
- 应用启动时自动执行未运行的迁移
- 迁移必须是幂等的，先检查再执行

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

## 导航与页面架构

### 侧栏结构

侧栏仅保留高频入口，低频功能收纳到设置页：

| 菜单项 | 路由 | 说明 |
|--------|------|------|
| 数据浏览 | `/` | 交易列表 + 手工录入 + 图片识别导入入口 |
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
- 工作表名 `detail`，列结构与导入格式一致（日期、类型、金额、分组、描述、操作人），导出文件可直接作为导入源（round-trip 兼容）
- 导出按日期升序排列（与用户 Excel 习惯一致，区别于数据浏览页的默认降序）
- `findAllForExport()` 独立于 `findAll()`：JOIN categories + operators 直接返回展示用字段，无分页，日期升序
- `countForExport()` 用于筛选条件变化时的记录数预览，前端加 300ms debounce 防抖

### SQL 筛选逻辑复用

- `transaction.repo.ts` 中提取了 `buildWhereClause()` 公共函数，被 `findAll()`、`countForExport()`、`findAllForExport()` 三处复用
- WHERE 条件中使用 `t.` 表别名前缀（如 `t.date`、`t.type`），兼容 JOIN 查询和单表查询
- 支持的筛选参数：`dateFrom`/`dateTo`、`type`/`types[]`、`category_id`/`category_ids[]`、`operator_id`/`operator_ids[]`、`keyword`
- 新增筛选条件时只需修改 `buildWhereClause()` 一处，所有查询自动生效

### 默认排序

- 数据浏览页默认按日期逆序（`sortField: 'date', sortOrder: 'descend'`），确保用户打开即看到最新数据
- 初始查询参数和 `queryParams` 状态默认值均设置了该排序，Ant Design Table 列定义通过 `defaultSortOrder: 'descend'` 显示排序指示器
