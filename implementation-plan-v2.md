# 统计页与数据浏览页双向导航 - 改进版实现方案

**原方案问题修复版本**
**更新日期**: 2026-03-26

---

## 🔴 问题清单及解决方案

### 问题 1: 年度视图缺少 year 参数（逻辑缺陷）
**问题**: YearlyBarChart 没有传递 year，导致从年度视图返回后切换到月度视图时年份丢失

**解决方案**: 
- Statistics/index.tsx 向 YearlyBarChart 传递 year prop
- YearlyBarChart 的 handleViewDetails 添加 year 到 URL

---

### 问题 2: 统计页缺少 type 的恢复
**问题**: 只恢复了 year、tab、soloCategory，没有保存和恢复 type（消费/收入/投资）

**解决方案**:
- 跳转时添加 `statsType` 参数（或使用现有的 `type` 参数复用）
- 统计页从 URL 恢复 type 状态
- 数据浏览页返回时传回 type

---

### 问题 3: handleBackToStats 没传 type
**问题**: 返回函数缺少 type 参数传递

**解决方案**:
- handleBackToStats 中添加 `params.set('type', statsType)`

---

### 问题 4: ECharts 独显恢复的时序问题
**问题**: useEffect 可能在 ECharts 渲染完成前执行，导致恢复失败

**解决方案**:
- 使用 `setTimeout(() => {...}, 0)` 延迟到下一个事件循环
- 或者监听 ECharts 的 `finished` 事件

---

### 问题 5: navigate 方式的选择
**问题**: navigate push 会新增历史记录，导致浏览器后退循环

**解决方案**:
- 使用 `navigate('/statistics?...', { replace: true })`
- 或者更好的方式：用 navigate(-1) 回退，但 URL 参数需要 HashRouter 支持
- **推荐**: 使用 `replace: true`，简洁可靠

---

### 问题 6: parseInt NaN 保护
**问题**: `parseInt(urlYear, 10)` 可能返回 NaN

**解决方案**:
- 改为 `parseInt(urlYear, 10) || currentDate.getFullYear()`

---

## 📝 改进后的文件修改清单

### 文件 1: `src/renderer/src/pages/Statistics/index.tsx`

**修改点 1: 导入 useSearchParams 和 useEffect**
```typescript
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'  // 新增
import { Card, Radio, Spin } from 'antd'
```

**修改点 2: 组件内部 URL 参数解析（带 NaN 保护）**
```typescript
export default function Statistics(): React.JSX.Element {
  const { t } = useTranslation('statistics')
  const [searchParams] = useSearchParams()  // 新增
  const currentDate = new Date()
  
  // 从 URL 参数恢复状态（带 NaN 保护）
  const urlYear = searchParams.get('year')
  const urlTab = searchParams.get('tab')
  const urlType = searchParams.get('type') as TransactionType | null  // 新增
  const urlSoloCategory = searchParams.get('soloCategory')
  
  const [year, setYear] = useState(
    urlYear ? parseInt(urlYear, 10) || currentDate.getFullYear() : currentDate.getFullYear()  // 修复：NaN 保护
  )
  const [type, setType] = useState<TransactionType>(
    urlType && ['expense', 'income', 'investment'].includes(urlType) ? urlType : 'expense'  // 修复：从 URL 恢复 type
  )
  const [viewTab, setViewTab] = useState<'monthly' | 'yearly'>(
    urlTab === 'yearly' ? 'yearly' : 'monthly'
  )
  
  // 保存 soloCategory 用于传递给图表组件
  const [initialSoloCategory] = useState<string | null>(urlSoloCategory)
```

**修改点 3: 向 YearlyBarChart 传递 year（修复问题 1）**
```tsx
<Card size="small" title={t('chartTitles.yearlyTrend')}>
  <YearlyBarChart 
    data={yearlyCategoryData} 
    type={type}
    year={year}  // 新增：传递 year
    initialSoloCategory={initialSoloCategory}
  />
</Card>
```

---

### 文件 2: `src/renderer/src/pages/Statistics/YearlyBarChart.tsx`

**修改点 1: interface 添加 year（修复问题 1）**
```typescript
interface YearlyBarChartProps {
  data: YearlyCategoryData | null
  type: TransactionType
  year: number  // 新增
  initialSoloCategory?: string | null
}

export default function YearlyBarChart({ data, type, year, initialSoloCategory }: YearlyBarChartProps): React.JSX.Element {
```

**修改点 2: handleViewDetails 添加 year 和 statsType（修复问题 1, 2）**
```typescript
const handleViewDetails = useCallback((): void => {
  if (!contextMenu.year || !contextMenu.categoryId) return

  const dateFrom = `${contextMenu.year}-01-01`
  const dateTo = `${contextMenu.year}-12-31`

  const queryParams = new URLSearchParams()
  queryParams.set('dateFrom', dateFrom)
  queryParams.set('dateTo', dateTo)
  queryParams.set('category_id', String(contextMenu.categoryId))
  queryParams.set('type', type)  // 用于数据浏览页筛选
  
  // 新增：来源标记和统计页状态
  queryParams.set('from', 'statistics')
  queryParams.set('year', String(year))  // 修复：年度视图也需要传递 year
  queryParams.set('tab', 'yearly')
  queryParams.set('statsType', type)  // 修复：显式传递统计页 type，避免与筛选 type 混淆
  if (soloRef.current) {
    queryParams.set('soloCategory', soloRef.current)
  }

  navigate(`/?${queryParams.toString()}`)
}, [contextMenu, type, year, navigate])  // 修复：依赖数组添加 year
```

**修改点 3: 独显恢复添加时序保护（修复问题 4）**
```typescript
// 组件内部，在现有代码之后添加
useEffect(() => {
  if (!initialSoloCategory || !data) return
  
  const chart = chartRef.current?.getEchartsInstance()
  if (!chart) return
  
  // 检查该分类是否存在且有数据
  const categoryExists = data.categories.some((c, i) => 
    c.name === initialSoloCategory && data.totals.amounts[i] !== 0
  )
  if (!categoryExists) return
  
  // 延迟执行，等待 ECharts 渲染完成（修复问题 4）
  setTimeout(() => {
    const allNames = data.categories
      .filter((_, i) => data.totals.amounts[i] !== 0)
      .map((c) => c.name)
    
    soloRef.current = initialSoloCategory
    
    // 先全选再反选其他
    chart.dispatchAction({ type: 'legendAllSelect' })
    for (const name of allNames) {
      if (name !== initialSoloCategory) {
        chart.dispatchAction({ type: 'legendUnSelect', name })
      }
    }
  }, 0)
}, [data, initialSoloCategory])
```

---

### 文件 3: `src/renderer/src/pages/Statistics/BarChart.tsx`

**修改点 1: handleViewDetails 添加 statsType（修复问题 2）**
```typescript
const handleViewDetails = useCallback((): void => {
  if (contextMenu.monthIndex === null || !contextMenu.categoryId) return

  const month = contextMenu.monthIndex + 1
  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const queryParams = new URLSearchParams()
  queryParams.set('dateFrom', dateFrom)
  queryParams.set('dateTo', dateTo)
  queryParams.set('category_id', String(contextMenu.categoryId))
  queryParams.set('type', type)  // 用于数据浏览页筛选
  
  // 新增：来源标记和统计页状态
  queryParams.set('from', 'statistics')
  queryParams.set('year', String(year))
  queryParams.set('tab', 'monthly')
  queryParams.set('statsType', type)  // 修复：显式传递统计页 type
  if (soloRef.current) {
    queryParams.set('soloCategory', soloRef.current)
  }

  navigate(`/?${queryParams.toString()}`)
}, [contextMenu, year, type, navigate])
```

**修改点 2: 独显恢复添加时序保护（修复问题 4）**
```typescript
useEffect(() => {
  if (!initialSoloCategory || !data) return
  
  const chart = chartRef.current?.getEchartsInstance()
  if (!chart) return
  
  // 检查该分类是否存在且有数据
  const categoryExists = data.rows.some(r => 
    r.category_name === initialSoloCategory && r.yearly !== 0
  )
  if (!categoryExists) return
  
  // 延迟执行，等待 ECharts 渲染完成（修复问题 4）
  setTimeout(() => {
    const allNames = data.rows.filter((r) => r.yearly !== 0).map((r) => r.category_name)
    soloRef.current = initialSoloCategory
    
    // 先全选再反选其他
    chart.dispatchAction({ type: 'legendAllSelect' })
    for (const name of allNames) {
      if (name !== initialSoloCategory) {
        chart.dispatchAction({ type: 'legendUnSelect', name })
      }
    }
  }, 0)
}, [data, initialSoloCategory])
```

---

### 文件 4: `src/renderer/src/pages/Transactions/index.tsx`

**修改点 1: 导入 ArrowLeftOutlined 图标**
```typescript
import {
  PlusOutlined, DeleteOutlined, EditOutlined, SaveOutlined, CloseOutlined, SearchOutlined,
  CameraOutlined, FileTextOutlined, ExclamationCircleOutlined, ArrowLeftOutlined  // 新增
} from '@ant-design/icons'
```

**修改点 2: 解析返回参数（添加 statsType）**
```typescript
// 解析统计页返回参数
const fromStats = searchParams.get('from') === 'statistics'
const statsYear = searchParams.get('year')
const statsTab = searchParams.get('tab')
const statsType = searchParams.get('statsType')  // 新增（修复问题 2）
const statsSoloCategory = searchParams.get('soloCategory')
```

**修改点 3: 返回函数添加 type 和使用 replace（修复问题 3, 5）**
```typescript
// 返回统计页函数
const handleBackToStats = (): void => {
  const params = new URLSearchParams()
  if (statsYear) params.set('year', statsYear)
  if (statsTab) params.set('tab', statsTab)
  if (statsType) params.set('type', statsType)  // 修复：添加 type（问题 3）
  if (statsSoloCategory) params.set('soloCategory', statsSoloCategory)
  
  const queryString = params.toString()
  // 修复：使用 replace: true 避免历史记录循环（问题 5）
  navigate(queryString ? `/statistics?${queryString}` : '/statistics', { replace: true })
}
```

**修改点 4: 页面标题区域添加返回按钮**
```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
  {fromStats && (
    <Button 
      type="link" 
      icon={<ArrowLeftOutlined />}
      onClick={handleBackToStats}
      style={{ padding: 0, marginRight: 8 }}
    >
      {t('transactions:buttons.backToStatistics')}
    </Button>
  )}
  <Text strong style={{ fontSize: 18, userSelect: 'none' }}>
    {t('transactions:title')}
  </Text>
</div>
```

---

### 文件 5: `src/renderer/src/locales/zh-CN/transactions.json`

**添加返回按钮翻译**
```json
"buttons": {
  "manualEntry": "手工录入",
  "aiRecognition": "图片识别导入",
  "batchDelete": "批量删除",
  "continueImport": "继续导入",
  "discard": "放弃",
  "backToStatistics": "返回统计页"
}
```

---

### 文件 6: `src/renderer/src/locales/en-US/transactions.json`

```json
"backToStatistics": "Back to Statistics"
```

---

## ✅ 问题修复对照表

| 问题 | 修复位置 | 修复方式 |
|-----|---------|---------|
| 1. 年度视图缺少 year | YearlyBarChart.tsx | 添加 year prop 和 URL 参数 |
| 2. 统计页缺少 type 恢复 | Statistics/index.tsx, BarChart, YearlyBarChart | 添加 statsType 参数传递和恢复 |
| 3. handleBackToStats 没传 type | Transactions/index.tsx | 添加 `params.set('type', statsType)` |
| 4. ECharts 时序问题 | BarChart.tsx, YearlyBarChart.tsx | 使用 `setTimeout(() => {...}, 0)` |
| 5. navigate 历史循环 | Transactions/index.tsx | 使用 `{ replace: true }` |
| 6. parseInt NaN | Statistics/index.tsx | 改为 `parseInt(...) \|\| defaultValue` |

---

## 🧪 更新后的测试场景

1. **月度视图 → 返回 → 切换年度 → 返回月度**: 年份保持正确
2. **年度视图 → 返回 → 切换月度**: 年份保持正确（修复问题 1）
3. **选择收入类型 → 查看明细 → 返回**: 类型仍为收入（修复问题 2）
4. **独显分类 → 查看明细 → 返回**: 分类正确独显（修复问题 4）
5. **点击返回 → 浏览器后退**: 不再循环（修复问题 5）
6. **非法 year 参数 → 恢复默认值**: 显示当前年份（修复问题 6）

---

## 📝 URL 参数说明

跳转时 URL 结构：
```
/?dateFrom=2024-10-01&dateTo=2024-10-31&category_id=5&type=expense&from=statistics&year=2024&tab=monthly&statsType=expense&soloCategory=正餐
```

参数用途：
- `dateFrom/dateTo/category_id/type`: 数据浏览页筛选用
- `from=statistics`: 标识来源，控制返回按钮显示
- `year`: 统计页年份恢复
- `tab`: 统计页视图Tab恢复
- `statsType`: 统计页类型恢复（区别于筛选 type）
- `soloCategory`: 图表独显状态恢复

返回时 URL 结构：
```
/statistics?year=2024&tab=monthly&type=expense&soloCategory=正餐
```

---

**方案状态**: 已修复全部 6 个问题
**审核意见**: 请确认此改进方案是否满足需求
