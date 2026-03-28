# 统计页与数据浏览页双向导航 - 实现方案

## 📋 需求概述
当用户从统计报表页通过趋势图「查看明细」功能跳转至数据浏览页后，提供一键返回功能，并完整恢复统计页之前的浏览状态（年份、类型、视图Tab、图表独显状态）。

---

## 📝 需要修改的文件

### 1. `src/renderer/src/pages/Statistics/BarChart.tsx` (月度趋势图)

**修改点：第 164-179 行的 `handleViewDetails` 函数**

**当前代码：**
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
  queryParams.set('type', type)

  navigate(`/?${queryParams.toString()}`)
}, [contextMenu, year, type, navigate])
```

**修改后代码：**
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
  queryParams.set('type', type)
  
  // 新增：来源标记和统计页状态
  queryParams.set('from', 'statistics')
  queryParams.set('year', String(year))
  queryParams.set('tab', 'monthly')
  if (soloRef.current) {
    queryParams.set('soloCategory', soloRef.current)
  }

  navigate(`/?${queryParams.toString()}`)
}, [contextMenu, year, type, navigate])
```

---

### 2. `src/renderer/src/pages/Statistics/YearlyBarChart.tsx` (年度趋势图)

**修改点：第 155-168 行的 `handleViewDetails` 函数**

**当前代码：**
```typescript
const handleViewDetails = useCallback((): void => {
  if (!contextMenu.year || !contextMenu.categoryId) return

  const dateFrom = `${contextMenu.year}-01-01`
  const dateTo = `${contextMenu.year}-12-31`

  const queryParams = new URLSearchParams()
  queryParams.set('dateFrom', dateFrom)
  queryParams.set('dateTo', dateTo)
  queryParams.set('category_id', String(contextMenu.categoryId))
  queryParams.set('type', type)

  navigate(`/?${queryParams.toString()}`)
}, [contextMenu, type, navigate])
```

**修改后代码：**
```typescript
const handleViewDetails = useCallback((): void => {
  if (!contextMenu.year || !contextMenu.categoryId) return

  const dateFrom = `${contextMenu.year}-01-01`
  const dateTo = `${contextMenu.year}-12-31`

  const queryParams = new URLSearchParams()
  queryParams.set('dateFrom', dateFrom)
  queryParams.set('dateTo', dateTo)
  queryParams.set('category_id', String(contextMenu.categoryId))
  queryParams.set('type', type)
  
  // 新增：来源标记和统计页状态
  queryParams.set('from', 'statistics')
  queryParams.set('tab', 'yearly')
  // 年度视图不需要 year 参数，因为本身就是跨年的
  if (soloRef.current) {
    queryParams.set('soloCategory', soloRef.current)
  }

  navigate(`/?${queryParams.toString()}`)
}, [contextMenu, type, navigate])
```

---

### 3. `src/renderer/src/pages/Transactions/index.tsx` (数据浏览页)

**修改点：第 750-753 行附近添加返回按钮**

**步骤 1：在 imports 中添加 ArrowLeftOutlined 图标**
```typescript
import {
  PlusOutlined, DeleteOutlined, EditOutlined, SaveOutlined, CloseOutlined, SearchOutlined,
  CameraOutlined, FileTextOutlined, ExclamationCircleOutlined, ArrowLeftOutlined  // 新增
} from '@ant-design/icons'
```

**步骤 2：在组件内部添加返回按钮逻辑（第 750 行之前）**
```typescript
// 解析统计页返回参数
const fromStats = searchParams.get('from') === 'statistics'
const statsYear = searchParams.get('year')
const statsTab = searchParams.get('tab')
const statsSoloCategory = searchParams.get('soloCategory')

// 返回统计页函数
const handleBackToStats = (): void => {
  const params = new URLSearchParams()
  if (statsYear) params.set('year', statsYear)
  if (statsTab) params.set('tab', statsTab)
  if (statsSoloCategory) params.set('soloCategory', statsSoloCategory)
  
  const queryString = params.toString()
  navigate(queryString ? `/statistics?${queryString}` : '/statistics')
}
```

**步骤 3：修改页面标题区域（第 750-753 行）**

**当前代码：**
```tsx
<Text strong style={{ fontSize: 18, display: 'block', marginBottom: 16, userSelect: 'none' }}>
  {t('transactions:title')}
</Text>
```

**修改后代码：**
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

### 4. `src/renderer/src/pages/Statistics/index.tsx` (统计页)

**修改点：添加 URL 参数解析和状态恢复逻辑**

**步骤 1：导入 useSearchParams**
```typescript
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'  // 新增
import { Card, Radio, Spin } from 'antd'
```

**步骤 2：在组件内部添加 URL 参数解析（第 13-17 行之后）**
```typescript
export default function Statistics(): React.JSX.Element {
  const { t } = useTranslation('statistics')
  const [searchParams] = useSearchParams()  // 新增
  const currentDate = new Date()
  
  // 从 URL 参数恢复状态
  const urlYear = searchParams.get('year')
  const urlTab = searchParams.get('tab')
  const urlSoloCategory = searchParams.get('soloCategory')
  
  const [year, setYear] = useState(urlYear ? parseInt(urlYear, 10) : currentDate.getFullYear())
  const [type, setType] = useState<TransactionType>('expense')
  const [viewTab, setViewTab] = useState<'monthly' | 'yearly'>(urlTab === 'yearly' ? 'yearly' : 'monthly')
  
  // 保存 soloCategory 用于传递给图表组件
  const [initialSoloCategory] = useState<string | null>(urlSoloCategory)
```

**步骤 3：将 initialSoloCategory 传递给 BarChart 组件**

在 JSX 中修改 BarChart 和 YearlyBarChart 的调用：

```tsx
{viewTab === 'monthly' ? (
  <Card size="small" title={t('chartTitles.monthlyTrend')}>
    <BarChart 
      data={crossTableData} 
      year={year} 
      type={type} 
      initialSoloCategory={initialSoloCategory}  // 新增
    />
  </Card>
) : (
  <Card size="small" title={t('chartTitles.yearlyTrend')}>
    <YearlyBarChart 
      data={yearlyCategoryData} 
      type={type}
      initialSoloCategory={initialSoloCategory}  // 新增
    />
  </Card>
)}
```

---

### 5. `src/renderer/src/pages/Statistics/BarChart.tsx` (再次修改 - 恢复独显状态)

**修改点：添加 initialSoloCategory prop 和恢复逻辑**

**步骤 1：修改 interface 和组件参数**
```typescript
interface BarChartProps {
  data: CrossTableData | null
  year: number
  type: TransactionType
  initialSoloCategory?: string | null  // 新增
}

export default function BarChart({ data, year, type, initialSoloCategory }: BarChartProps): React.JSX.Element {
```

**步骤 2：在 useEffect 中恢复独显状态（在组件内部添加）**
```typescript
// 组件内部，在现有代码之后添加
useEffect(() => {
  if (!initialSoloCategory || !data) return
  
  const chart = chartRef.current?.getEchartsInstance()
  if (!chart) return
  
  // 检查该分类是否存在且有数据
  const categoryExists = data.rows.some(r => r.category_name === initialSoloCategory && r.yearly !== 0)
  if (!categoryExists) return
  
  // 恢复独显状态
  const allNames = data.rows.filter((r) => r.yearly !== 0).map((r) => r.category_name)
  soloRef.current = initialSoloCategory
  
  // 先全选再反选其他
  chart.dispatchAction({ type: 'legendAllSelect' })
  for (const name of allNames) {
    if (name !== initialSoloCategory) {
      chart.dispatchAction({ type: 'legendUnSelect', name })
    }
  }
}, [data, initialSoloCategory])
```

---

### 6. `src/renderer/src/pages/Statistics/YearlyBarChart.tsx` (再次修改 - 恢复独显状态)

**步骤同上**，添加 `initialSoloCategory` prop 和恢复逻辑。

---

### 7. `src/renderer/src/locales/zh-CN/transactions.json` (翻译文件)

**修改点：第 29-34 行添加返回按钮翻译**

```json
"buttons": {
  "manualEntry": "手工录入",
  "aiRecognition": "图片识别导入",
  "batchDelete": "批量删除",
  "continueImport": "继续导入",
  "discard": "放弃",
  "backToStatistics": "返回统计页"  // 新增
}
```

---

### 8. `src/renderer/src/locales/en-US/transactions.json` (翻译文件)

同样位置添加：
```json
"backToStatistics": "Back to Statistics"
```

---

## ⚠️ 潜在风险点

### 🔴 高风险

1. **图表独显状态恢复的异步问题**
   - **问题**：`soloRef` 是 useRef，ECharts 实例初始化需要时间
   - **影响**：可能导致独显状态恢复失败
   - **解决方案**：在 `useEffect` 中延迟执行恢复逻辑，或监听 chart ready 事件

2. **URL 参数冲突**
   - **问题**：新增参数可能与现有逻辑冲突
   - **影响**：数据浏览页的筛选可能被意外覆盖
   - **建议**：保持参数命名清晰（`from`, `tab`, `soloCategory`），与现有参数不重复

### 🟡 中风险

3. **浏览器前进/后退行为**
   - **问题**：用户点击浏览器返回时，URL 参数可能残留
   - **影响**：刷新页面后返回按钮仍然存在
   - **解决方案**：这是预期行为，符合"只要有跳转历史就显示"的需求

4. **类型转换错误**
   - **问题**：`parseInt(urlYear, 10)` 可能返回 NaN
   - **影响**：年份显示异常
   - **解决方案**：添加默认值回退：`parseInt(urlYear, 10) || currentDate.getFullYear()`

### 🟢 低风险

5. **翻译遗漏**
   - **检查点**：确保两个语言文件都添加了 `backToStatistics` 键

---

## ✅ 验收标准对应

| 验收标准 | 实现方式 |
|---------|---------|
| AC-D23 | 数据浏览页检测 `from=statistics` 显示返回按钮 |
| AC-D24 | 直接访问（无 `from` 参数）时不显示按钮 |
| AC-D25 | `handleBackToStats` 函数实现返回逻辑 |
| AC-D26 | URL 传递 `year` 参数，统计页解析恢复 |
| AC-D27 | URL 传递 `tab` 参数，统计页设置 `viewTab` |
| AC-D28 | URL 传递 `soloCategory` 参数，图表组件恢复独显 |
| AC-D29 | URL 构造包含 `from=statistics` |
| AC-S43 | 同上 |
| AC-S44 | 同上，同时传递 `year`, `tab`, `soloCategory` |
| AC-S45 | `fromStats` 变量控制按钮显示 |
| AC-S46 | 统计页解析 URL 参数恢复所有状态 |
| AC-S47 | 无 `from` 参数时 `fromStats = false` |
| AC-S48 | 使用 Ant Design Button 组件，type="link" + ArrowLeftOutlined 图标 |

---

## 🔄 实施顺序建议

1. **第一步**：修改数据浏览页 (Transactions/index.tsx) - 添加返回按钮和基础逻辑
2. **第二步**：修改月度趋势图 (BarChart.tsx) - 追加 URL 参数
3. **第三步**：修改年度趋势图 (YearlyBarChart.tsx) - 追加 URL 参数
4. **第四步**：修改统计页 (Statistics/index.tsx) - 恢复筛选和 Tab 状态
5. **第五步**：修改两个图表组件 - 添加独显状态恢复逻辑
6. **第六步**：添加翻译文本
7. **第七步**：全面测试各种场景

---

## 🧪 测试场景

1. **正常流程**：统计页 → 查看明细 → 数据浏览页 → 返回 → 统计页状态完整恢复
2. **独显状态**：统计页 → 独显某个分类 → 查看明细 → 返回 → 该分类仍独显
3. **直接访问**：直接打开数据浏览页 URL（无 `from` 参数）→ 不显示返回按钮
4. **浏览器返回**：在数据浏览页点击浏览器返回按钮 → 正常返回统计页
5. **刷新页面**：带 `from=statistics` 的 URL 刷新 → 仍显示返回按钮
6. **异常参数**：URL 包含非法 `year` 或 `tab` 值 → 使用默认值

---

## 💡 优化建议

1. **可选：使用浏览器历史状态替代 URL 参数**
   - 优点：URL 更简洁
   - 缺点：刷新页面后状态丢失
   - 当前方案已能满足需求，暂不优化

2. **可选：添加过渡动画**
   - 页面切换时添加淡入淡出效果
   - 提升用户体验

---

**生成时间**: 2026-03-26
**对应需求**: PRD v0.6.2 统计页与数据浏览页双向导航
