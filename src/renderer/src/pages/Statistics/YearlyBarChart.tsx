import { useRef, useCallback, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { Empty } from 'antd'
import type { YearlyCategoryData } from '../../../../shared/types'
import type { TransactionType } from '../../../../shared/types/transaction'
import ContextMenu from '../../components/ContextMenu'

interface YearlyBarChartProps {
  data: YearlyCategoryData | null
  type: TransactionType
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

export default function YearlyBarChart({ data, type }: YearlyBarChartProps): React.JSX.Element {
  const navigate = useNavigate()
  const chartRef = useRef<ReactECharts>(null)
  const soloRef = useRef<string | null>(null)

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

  // Bind right-click event using zrender after chart is ready
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return

    const zr = chart.getZr()

    const handleZrContextMenu = (e: {
      event: MouseEvent
      offsetX: number
      offsetY: number
    }): void => {
      e.event.preventDefault()
      if (!data) return

      // Convert pixel coordinates to grid coordinates
      const pointInGrid = chart.convertFromPixel({ seriesIndex: 0 }, [e.offsetX, e.offsetY])
      if (!pointInGrid) return

      const [dataIndex, seriesIndex] = pointInGrid
      if (dataIndex == null || seriesIndex == null) return

      // Get series info
      const series = chart.getOption().series as Array<{
        name: string
        data: number[]
      }>
      if (!series || seriesIndex < 0 || seriesIndex >= series.length) return

      const categoryName = series[seriesIndex].name
      const rowIndex = Math.floor(dataIndex)

      if (!categoryName || rowIndex < 0 || rowIndex >= data.rows.length) return

      // Find category ID from data
      const catIndex = data.categories.findIndex((c) => c.name === categoryName)
      if (catIndex === -1) return

      const categoryId = data.categories[catIndex].id
      const year = data.rows[rowIndex]?.year
      if (!year) return

      setContextMenu({
        visible: true,
        x: e.event.clientX,
        y: e.event.clientY,
        year,
        categoryName,
        categoryId
      })
    }

    zr.on('contextmenu', handleZrContextMenu)

    return () => {
      zr.off('contextmenu', handleZrContextMenu)
    }
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

    navigate(`/?${queryParams.toString()}`)
  }, [contextMenu, type, navigate])

  const closeContextMenu = useCallback((): void => {
    setContextMenu((prev) => ({ ...prev, visible: false }))
  }, [])

  if (!data || data.totals.yearly === 0) {
    return <Empty description="暂无数据" style={{ padding: 40 }} />
  }

  const yearLabels = data.rows.map((r) => `${r.year}年`)

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
      trigger: 'axis',
      formatter: (params: Array<{ seriesName: string; value: number; color: string; axisValue: string }>): string => {
        if (params.length === 0) return ''
        const sorted = [...params].filter((p) => p.value !== 0).sort((a, b) => b.value - a.value)
        const total = sorted.reduce((sum, p) => sum + p.value, 0)
        let html = `<b>${params[0].axisValue}</b><br/>`
        for (const p of sorted) {
          html += `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:5px;"></span>${p.seriesName}: ¥${formatAmount(p.value)}<br/>`
        }
        if (sorted.length > 1) {
          html += `<b>合计: ¥${formatAmount(total)}</b>`
        }
        return html
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
        formatter: (v: number): string =>
          v >= 10000 ? `${(v / 10000).toFixed(1)}万` : String(v)
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
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: 380 }}
        onEvents={{
          legendselectchanged: handleLegendClick
        }}
      />
      <ContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        items={[
          {
            key: 'view-details',
            label: '查看明细',
            onClick: handleViewDetails
          }
        ]}
        onClose={closeContextMenu}
      />
    </>
  )
}
