# 数据管理架构

> 从 CLAUDE.md 拆分。修改数据导入导出、数据清空、草稿自动保存时请先阅读本文档。

## 数据清空操作

提供两个层级的数据清空（均在设置页「数据管理」Tab 中）：

| 操作 | IPC 通道 | 清空范围 | 保留内容 |
|------|----------|----------|----------|
| 清空交易记录 | `db:data:clear-transactions` | 交易 + 操作人 | 所有分类 |
| 恢复出厂设置 | `db:data:factory-reset` | 交易 + 操作人 + 自定义分类 | 系统预置分类（`is_system=1`，且重置为启用状态） |

- 两种操作均包裹在 `db.transaction()` 中确保原子性
- 前端使用 `Modal.confirm` 二次确认，按钮为 `danger` 样式
- `categoryRepo.deleteAllCustom()`：删除 `is_system = 0` 的分类
- `categoryRepo.resetSystemCategories()`：将 `is_system = 1` 的分类重置为 `is_active = 1`

## 数据导出

- 导出入口位于设置页「数据管理」Tab，支持 Excel（.xlsx）和 CSV（.csv）两种格式
- Excel 使用 `xlsx-js-style`（SheetJS 的样式增强 fork，**不是** `xlsx`），支持表头背景色（`#4472C4`）、白色粗体字体、金额千分位格式（`#,##0.00`）和列宽设置
- CSV 使用 UTF-8 with BOM 编码（`\uFEFF` 前缀），确保 Excel 打开中文不乱码，字段转义遵循 RFC 4180
- 工作表名 `detail`，列结构：日期、类型、金额、分组、描述、操作人、**添加时间**（7列）
- 导出按日期升序排列（与用户 Excel 习惯一致，区别于数据浏览页的默认降序）
- `findAllForExport()` 独立于 `findAll()`：JOIN categories + operators 直接返回展示用字段（含 `created_at`），无分页，日期升序
- `countForExport()` 用于筛选条件变化时的记录数预览，前端加 300ms debounce 防抖

## 数据导入

- 导入入口位于设置页「数据管理」Tab，支持 Excel（.xlsx）格式
- 导入模式为全量覆盖（清空现有交易和操作人后重新导入）
- **向后兼容**：支持旧格式（6列）和新格式（7列，含添加时间）
- 添加时间解析策略：
  - 文件含「添加时间」列 → 使用该值作为 `created_at`，保持原始时间
  - 文件不含该列 → 使用当前时间作为 `created_at`
  - 支持格式：`YYYY-MM-DD HH:mm:ss`、Excel 序列号、纯日期（补全 `00:00:00`）
- 导入成功后自动返回数据浏览页面（1.5秒延迟）

## SQL 筛选逻辑复用

- `transaction.repo.ts` 中提取了 `buildWhereClause()` 公共函数，被 `findAll()`、`countForExport()`、`findAllForExport()` 三处复用
- WHERE 条件中使用 `t.` 表别名前缀（如 `t.date`、`t.type`），兼容 JOIN 查询和单表查询
- 支持的筛选参数：`dateFrom`/`dateTo`、`type`/`types[]`、`category_id`/`category_ids[]`、`operator_id`/`operator_ids[]`、`keyword`
- 新增筛选条件时只需修改 `buildWhereClause()` 一处，所有查询自动生效

---

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

---

**相关文档**：
- 产品规格：`docs/prd-archive/import-export.md`
- 总体架构：`docs/ARCHITECTURE.md`
