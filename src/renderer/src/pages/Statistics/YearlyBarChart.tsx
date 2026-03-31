import { useRef, useCallback, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { Empty } from 'antd'
import { useTranslation } from 'react-i18next'
import type { YearlyCategoryData } from '../../../../shared/types'
import type { TransactionType } from '../../../../shared/types/transaction'
import ContextMenu from '../../components/ContextMenu'
import { useThemeStore } from '../../stores/theme.store'

interface YearlyBarChartProps {
  data: YearlyCategoryData | null
  type: TransactionType
  year: number
  initialSoloCategory?: string | null
}

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  year: number | null
  categoryName: string | null
  categoryId: number | null
}

function formatAmount(value: number): string {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function YearlyBarChart({ data, type, year, initialSoloCategory }: YearlyBarChartProps): React.JSX.Element {
  const { t, i18n } = useTranslation('statistics')
  const { isDark } = useThemeStore()
  const navigate = useNavigate()
  const chartRef = useRef<ReactECharts>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const soloRef = useRef<string | null>(null)

  // Number formatting based on language
  const formatLargeNumber = (v: number): string => {
    if (i18n.language === 'zh-CN') {
      // Chinese: use 万 (10,000)
      return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : String(v)
    } else {
      // English: use K (1,000)
      return v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v)
    }
  }

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    year: null,
    categoryName: null,
    categoryId: null
  })

  const handleLegendClick = useCallback((params: { name: string }) => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart || !data) return

    const allNames = data.categories
      .filter((_, i) => data.totals.amounts[i] !== 0)
      .map((c) => c.name)
    const clickedName = params.name

    if (soloRef.current === clickedName) {
      soloRef.current = null
      chart.dispatchAction({ type: 'legendAllSelect' })
    } else {
      soloRef.current = clickedName
      chart.dispatchAction({ type: 'legendAllSelect' })
      for (const name of allNames) {
        if (name !== clickedName) {
          chart.dispatchAction({ type: 'legendUnSelect', name })
        }
      }
    }
  }, [data])

  // Handle right-click on chart container
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.stopPropagation()

    if (!data) return

    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return

    // Get click position relative to chart container
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top

    // Convert pixel coordinates to grid coordinates using grid
    const pointInGrid = chart.convertFromPixel({ gridIndex: 0 }, [offsetX, offsetY])
    if (!pointInGrid) return

    const [xIndex, yValue] = pointInGrid

    // Check if xIndex is valid
    if (xIndex == null || xIndex < 0 || xIndex >= data.rows.length) return

    const rowIndex = Math.floor(xIndex)
    const clickedYear = data.rows[rowIndex]?.year
    if (!clickedYear) return

    // Use data.categories directly instead of chart.getOption().series
    // Filter to only visible categories (totalAmount !== 0)
    const visibleCategories = data.categories.filter(
      (_, catIndex) => data.totals.amounts[catIndex] !== 0
    )

    if (visibleCategories.length === 0) return

    // For stacked bar chart, calculate which category was clicked
    let cumulativeValue = 0
    let clickedCategory: { id: number; name: string } | null = null

    for (const cat of visibleCategories) {
      const catIndex = data.categories.findIndex((c) => c.id === cat.id)
      const value = data.rows[rowIndex].amounts[catIndex] || 0
      const seriesStart = cumulativeValue
      const seriesEnd = cumulativeValue + value

      if (yValue >= seriesStart && yValue <= seriesEnd) {
        clickedCategory = cat
        break
      }

      cumulativeValue = seriesEnd
    }

    if (!clickedCategory) return

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      year: clickedYear,
      categoryName: clickedCategory.name,
      categoryId: clickedCategory.id
    })
  }, [data])

  // Navigate to transactions page with filters
  const handleViewDetails = useCallback((): void => {
    if (!contextMenu.year || !contextMenu.categoryId) return

    const dateFrom = `${contextMenu.year}-01-01`
    const dateTo = `${contextMenu.year}-12-31`

    const queryParams = new URLSearchParams()
    queryParams.set('dateFrom', dateFrom)
    queryParams.set('dateTo', dateTo)
    queryParams.set('category_id', String(contextMenu.categoryId))
    queryParams.set('type', type)

    // Add back-to-statistics parameters
    queryParams.set('from', 'statistics')
    queryParams.set('year', String(year))
    queryParams.set('tab', 'yearly')
    queryParams.set('statsType', type)
    if (soloRef.current) {
      queryParams.set('soloCategory', soloRef.current)
    }

    navigate(`/?${queryParams.toString()}`)
  }, [contextMenu, type, year, navigate])

  const closeContextMenu = useCallback((): void => {
    setContextMenu((prev) => ({ ...prev, visible: false }))
  }, [])

  // Restore solo category state from URL parameter
  useEffect(() => {
    if (!initialSoloCategory || !data) return

    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return

    // Check if category exists and has data
    const catIndex = data.categories.findIndex((c) => c.name === initialSoloCategory)
    if (catIndex === -1 || data.totals.amounts[catIndex] === 0) return

    // Defer execution to next tick to ensure ECharts is ready
    setTimeout(() => {
      const allNames = data.categories
        .filter((_, i) => data.totals.amounts[i] !== 0)
        .map((c) => c.name)
      soloRef.current = initialSoloCategory

      // Select all first, then unselect others
      chart.dispatchAction({ type: 'legendAllSelect' })
      for (const name of allNames) {
        if (name !== initialSoloCategory) {
          chart.dispatchAction({ type: 'legendUnSelect', name })
        }
      }
    }, 0)
  }, [data, initialSoloCategory])

  if (!data || data.totals.yearly === 0) {
    return <Empty description={t('table.noData')} style={{ padding: 40 }} />
  }

  const yearLabels = data.rows.map((r) => t('filter.yearLabel', { year: r.year }))

  const series = data.categories
    .map((cat, catIndex) => ({
      name: cat.name,
      type: 'bar' as const,
      stack: 'total',
      data: data.rows.map((r) => r.amounts[catIndex]),
      totalAmount: data.totals.amounts[catIndex],
      emphasis: { focus: 'series' as const }
    }))
    .filter((s) => s.totalAmount !== 0)

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: (params: { seriesName: string; value: number; color: string; name: string }): string => {
        if (params.value === 0) return ''
        return `<b>${params.name}</b><br/><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${params.color};margin-right:5px;"></span>${params.seriesName}: ¥${formatAmount(params.value)}`
      }
    },
    legend: {
      type: 'plain',
      bottom: 0,
      left: 'center',
      selectedMode: true
    },
    xAxis: {
      type: 'category',
      data: yearLabels
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: formatLargeNumber
      }
    },
    series,
    grid: {
      left: 60,
      right: 20,
      top: 20,
      bottom: 80
    }
  }

  return (
    <>
      <div
        ref={containerRef}
        onContextMenu={handleContextMenu}
        style={{ height: 380, position: 'relative' }}
      >
        <ReactECharts
          ref={chartRef}
          option={option}
          theme={isDark ? 'dark' : undefined}
          notMerge={true}
          style={{ height: '100%', width: '100%' }}
          onEvents={{
            legendselectchanged: handleLegendClick
          }}
        />
      </div>
      <ContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        items={[
          {
            key: 'view-details',
            label: t('chart.viewDetails'),
            onClick: handleViewDetails
          }
        ]}
        onClose={closeContextMenu}
      />
    </>
  )
}
