# 统计报表架构

> 从 CLAUDE.md 拆分。修改统计报表页面、图表交互、统计查询逻辑时请先阅读本文档。

## 页面结构

统计报表页（`src/renderer/src/pages/Statistics/`）采用组件拆分模式：

| 组件 | 职责 |
|------|------|
| `index.tsx` | 页面容器，管理视图切换、筛选状态和数据请求 |
| `FilterBar.tsx` | 筛选器（年份 / 类型），支持通过 `showYearFilter` 控制年份选择器显隐 |
| `CrossTable.tsx` | 月度明细交叉统计表（分类 × 12 月 + 合计） |
| `YearlyTable.tsx` | 年度汇总表（年份 × 分类 + 合计） |
| `BarChart.tsx` | 堆叠柱状图（月度趋势） |
| `YearlyBarChart.tsx` | 堆叠柱状图（年度趋势） |

## 视图切换模式

- 页面顶部通过 `Radio.Group`（按钮样式）切换「月度明细」和「年度汇总」两个视图
- `viewTab` 状态驱动：筛选器显隐（年度汇总隐藏年份选择器）、数据请求（调用不同 API）、表格和图表的条件渲染
- 两个视图共享类型筛选器，切换视图不重置筛选状态

## 数据流

- 页面级状态（`year`、`type`、`viewTab`）驱动数据请求，筛选变化时通过 `useCallback` + `useEffect` 自动重新查询
- 月度明细：`CrossTableData` 同时供表格和月度趋势柱状图复用
- 年度汇总：`YearlyCategoryData` 同时供表格和年度趋势柱状图复用
- 初始化时加载年份范围（`db:stats:year-range`）

## Repository 层查询模式

- `stats.repo.ts` 导出独立函数（`getCrossTable`、`getYearlyCategory`、`getSummary`、`getYearRange`），不使用类实例
- 交叉统计表查询：SQL 按 `(category_id, month)` 分组聚合后，在 JS 层做 pivot 转换为行列结构
- 年度汇总表查询：SQL 按 `(year, category_id)` 分组聚合，JS 层先收集所有出现的分类作为列定义（保持 `sort_order` 顺序），再按年份组装行数据
- 汇总卡片查询：封装 `sumAmount()` 内部函数复用日期范围求和逻辑，处理跨年月份（1 月的上月 = 去年 12 月）
- 年份范围：`MIN/MAX(strftime('%Y', date))` 确定数据库中的年份边界，无数据时回退到当前年份

## IPC 通道

| 通道 | 用途 |
|------|------|
| `db:stats:cross-table` | 交叉统计表数据（按年/类型聚合） |
| `db:stats:yearly-category` | 年度汇总表数据（按类型聚合，跨所有年份） |
| `db:stats:summary` | 汇总卡片数据（本月/上月/年度合计） |
| `db:stats:year-range` | 数据库中交易数据的年份范围 |

## 统计表格列宽策略

- 金额列使用 `minWidth`（而非固定 `width`），允许列根据内容自适应拉伸
- `scroll.x` 设为 `'max-content'`，确保表格宽度由内容决定
- 排序列激活时 `minWidth` 增大（如 100→140），为百分比文字留出空间
- 固定列（分类/年度列 `fixed: 'left'`，合计列 `fixed: 'right'`）仍使用 `width` 保持固定宽度

## 图表交互模式

- 堆叠柱状图（`BarChart`、`YearlyBarChart`）统一使用「图例独显」交互：
  - 单击图例项 → 独显该分类（隐藏其他所有系列）
  - 再次单击已独显的项 → 恢复全部显示
  - 通过 `soloRef` 跟踪当前独显状态，`onEvents.legendselectchanged` 拦截原生行为
- Tooltip 按金额降序排列，过滤 0 值，多系列时显示合计行

## 图表数据下钻（右键查看明细）

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

---

**相关文档**：
- 产品规格：`docs/prd-archive/statistics.md`
- 跨页面导航：`docs/architecture/cross-page-navigation.md`
- 总体架构：`docs/ARCHITECTURE.md`
