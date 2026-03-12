# CLAUDE.md — Moneta 项目开发指南

> 本文件供 AI 辅助开发时快速了解项目上下文。请在每次会话开始时阅读。

## 项目简介

Moneta 是一款面向个人/家庭的桌面端记账软件，支持手动录入、AI 截图识别、分类统计和数据导入导出。

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

### 文件组织

- 每个组件一个文件，如果组件有专属子组件可建同名目录
- 共享类型放在 `src/shared/types/`
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

- **交易（Transaction）**：一条收入或支出记录，包含日期、类型、金额、分类、描述、操作人
- **分类（Category）**：交易的归类标签，分为消费分类和收入分类，支持用户自定义
- **操作人（Operator）**：记录这笔账的人，简单文本标识，不涉及用户认证
- **记账日期**：每次开始记账时选定，本次会话所有条目默认使用该日期
