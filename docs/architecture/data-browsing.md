# 数据浏览与可编辑表格模式

> 从 CLAUDE.md 拆分。修改数据浏览页、行内编辑、表格筛选排序、侧栏导航时请先阅读本文档。

## 服务端分页、排序与筛选

- 列表查询统一通过 `TransactionListParams` 传参，由 `findAll()` 在 SQL 层完成排序和筛选，确保对全量数据生效
- 排序参数：`sortField`（白名单：`date` / `amount`）+ `sortOrder`（`ascend` / `descend`），默认按日期降序
- 筛选参数：支持单值（`type`、`category_id`、`operator_id`）和多值（`types[]`、`category_ids[]`、`operator_ids[]`），多值使用 `IN (...)` 参数化查询
- 关键字搜索：`keyword` 参数对应 `description LIKE %keyword%`
- Ant Design Table 的 `sorter` 和 `filters` 仅用于 UI 指示器（`sorter: true`、`filters: [...]`），不在前端做实际排序/筛选（即不使用 comparator 函数或 `onFilter` 回调）

## 行内编辑模式

- 采用 `editingKey` + `editingRow` 状态控制：`editingKey` 记录正在编辑的行 ID，`editingRow` 存储编辑中的临时值
- 新增行使用独立的 `newRow` 状态，与编辑互斥（同一时间只能处于「新增」或「编辑某行」之一）
- `renderCell()` 函数根据 `isEditing` 判断渲染只读态或编辑控件
- 类型变更时需检查分类是否仍属于新类型（`getCategoriesForType()`），不匹配则自动清空
- `update` API 使用动态 SET 子句，仅发送变更字段（`UpdateTransactionDTO`）
- 日期记忆：`lastInputDate` 在新增行保存后更新，会话内有效

## URL 参数驱动的筛选

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

## Repository 层 CRUD 模式

- `create()`：INSERT 后通过 `result.lastInsertRowid` 查回完整行返回
- `update()`：动态构建 SET 子句（仅更新非 `undefined` 字段），始终追加 `updated_at = datetime('now', 'localtime')`
- `remove()`：交易物理删除（不同于分类的软删除）
- `batchDelete()`：`WHERE id IN (...)` 参数化，包裹在 `db.transaction()` 中
- `batchCreate()`：批量插入时使用 **条件分支策略**处理可选字段（如 `created_at`）：
  - 有自定义时间值 → 使用带该字段的 INSERT 语句
  - 无自定义时间值 → 使用数据库默认值（省略该字段）
  - 避免在 `stmt.run()` 中使用 `db.prepare().get()` 作为默认值（会返回对象而非标量）

## 金额显示

- 金额在只读态使用 `toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })` 显示千分号
- 编辑态使用 `InputNumber` 组件，`precision=2`，允许输入正数和负数，但不允许为 0

---

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

### 默认排序

- 数据浏览页默认按日期逆序（`sortField: 'date', sortOrder: 'descend'`），确保用户打开即看到最新数据
- 初始查询参数和 `queryParams` 状态默认值均设置了该排序，Ant Design Table 列定义通过 `defaultSortOrder: 'descend'` 显示排序指示器

---

**相关文档**：
- 产品规格：`docs/prd-archive/transactions.md`
- 跨页面导航：`docs/architecture/cross-page-navigation.md`
- 总体架构：`docs/ARCHITECTURE.md`
