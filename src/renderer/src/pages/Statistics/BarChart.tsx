import { useRef, useCallback, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { Empty } from 'antd'
import { useTranslation } from 'react-i18next'
import type { CrossTableData } from '../../../../shared/types'
import type { TransactionType } from '../../../../shared/types/transaction'
import ContextMenu from '../../components/ContextMenu'
import { useThemeStore } from '../../stores/theme.store'

interface BarChartProps {
  data: CrossTableData | null
  year: number
  type: TransactionType
  initialSoloCategory?: string | null
}

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  monthIndex: number | null
  categoryName: string | null
  categoryId: number | null
}

function formatAmount(value: number): string {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function BarChart({ data, year, type, initialSoloCategory }: BarChartProps): React.JSX.Element {
  const { t, i18n } = useTranslation('statistics')
  const { isDark } = useThemeStore()

  const MONTH_LABELS = [
    t('months.jan'), t('months.feb'), t('months.mar'), t('months.apr'),
    t('months.may'), t('months.jun'), t('months.jul'), t('months.aug'),
    t('months.sep'), t('months.oct'), t('months.nov'), t('months.dec')
  ]

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
  const navigate = useNavigate()
  const chartRef = useRef<ReactECharts>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // 记录当前是否处于「独显」模式，以及独显的分类名
  const soloRef = useRef<string | null>(null)

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    monthIndex: null,
    categoryName: null,
    categoryId: null
  })

  const handleLegendClick = useCallback((params: { name: string }) => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart || !data) return

    const allNames = data.rows.filter((r) => r.yearly !== 0).map((r) => r.category_name)
    const clickedName = params.name

    if (soloRef.current === clickedName) {
      // 再次点击已独显的项 → 恢复全部显示
      soloRef.current = null
      chart.dispatchAction({ type: 'legendAllSelect' })
    } else {
      // 独显被点击的项
      soloRef.current = clickedName
      // 先全选再反选其他
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

    // Check if xIndex is valid (within 0-11 for months)
    if (xIndex == null || xIndex < 0 || xIndex >= 12) return

    const monthIndex = Math.floor(xIndex)

    // Use data.rows directly instead of chart.getOption().series
    // to ensure consistency with the rendered chart
    const visibleRows = data.rows.filter((row) => row.yearly !== 0)

    if (visibleRows.length === 0) return

    // For stacked bar chart, calculate which category was clicked
    // based on the cumulative value at this monthIndex
    let cumulativeValue = 0
    let clickedRow: (typeof visibleRows)[0] | null = null

    for (const row of visibleRows) {
      const value = row.months[monthIndex] || 0
      const seriesStart = cumulativeValue
      const seriesEnd = cumulativeValue + value

      // Check if yValue falls within this category's range
      if (yValue >= seriesStart && yValue <= seriesEnd) {
        clickedRow = row
        break
      }

      cumulativeValue = seriesEnd
    }

    if (!clickedRow) return

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      monthIndex,
      categoryName: clickedRow.category_name,
      categoryId: clickedRow.category_id
    })


  }, [data])

  // Navigate to transactions page with filters
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

    // Add back-to-statistics parameters
    queryParams.set('from', 'statistics')
    queryParams.set('year', String(year))
    queryParams.set('tab', 'monthly')
    queryParams.set('statsType', type)
    if (soloRef.current) {
      queryParams.set('soloCategory', soloRef.current)
    }

    navigate(`/transactions?${queryParams.toString()}`)
  }, [contextMenu, year, type, navigate])

  const closeContextMenu = useCallback((): void => {
    setContextMenu((prev) => ({ ...prev, visible: false }))
  }, [])

  // Restore solo category state from URL parameter
  useEffect(() => {
    if (!initialSoloCategory || !data) return

    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return

    // Check if category exists and has data
    const categoryExists = data.rows.some(
      (r) => r.category_name === initialSoloCategory && r.yearly !== 0
    )
    if (!categoryExists) return

    // Defer execution to next tick to ensure ECharts is ready
    setTimeout(() => {
      const allNames = data.rows.filter((r) => r.yearly !== 0).map((r) => r.category_name)
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

  const series = data.rows
    .filter((row) => row.yearly !== 0)
    .map((row) => ({
      name: row.category_name,
      type: 'bar' as const,
      stack: 'total',
      data: row.months,
      emphasis: { focus: 'series' as const }
    }))

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
      data: MONTH_LABELS
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
