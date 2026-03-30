# 跨页面导航与状态传递

> 从 CLAUDE.md 拆分。实现页面间跳转并保留/恢复状态时请先阅读本文档。

## URL 驱动的状态恢复模式

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

## ECharts 状态恢复时序处理

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

## 状态命名约定

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

---

**相关文档**：
- 统计报表架构：`docs/architecture/statistics.md`
- 数据浏览架构：`docs/architecture/data-browsing.md`
- 总体架构：`docs/ARCHITECTURE.md`
