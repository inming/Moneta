import { useRef, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { Empty } from 'antd'
import type { CrossTableData } from '../../../../shared/types'
import type { TransactionType } from '../../../../shared/types/transaction'
import ContextMenu from '../../components/ContextMenu'

interface BarChartProps {
  data: CrossTableData | null
  year: number
  type: TransactionType
}

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  monthIndex: number | null
  categoryName: string | null
  categoryId: number | null
}

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function formatAmount(value: number): string {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function BarChart({ data, year, type }: BarChartProps): React.JSX.Element {
  const navigate = useNavigate()
  const chartRef = useRef<ReactECharts>(null)
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

  // Handle right-click on chart
  const handleContextMenu = useCallback((params: {
    event: { offsetX: number; offsetY: number; clientX: number; clientY: number }
    componentType: string
    seriesName?: string
    name?: string
    dataIndex?: number
  }): void => {
    if (!data) return

    // Only handle clicks on series data (bars)
    if (params.componentType !== 'series') return

    const categoryName = params.seriesName
    const monthIndex = params.dataIndex

    if (!categoryName || monthIndex === undefined) return

    // Find category ID from data
    const row = data.rows.find((r) => r.category_name === categoryName)
    if (!row) return

    setContextMenu({
      visible: true,
      x: params.event.clientX,
      y: params.event.clientY,
      monthIndex,
      categoryName,
      categoryId: row.category_id
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

    navigate(`/?${queryParams.toString()}`)
  }, [contextMenu, year, type, navigate])

  const closeContextMenu = useCallback((): void => {
    setContextMenu((prev) => ({ ...prev, visible: false }))
  }, [])

  if (!data || data.totals.yearly === 0) {
    return <Empty description="暂无数据" style={{ padding: 40 }} />
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
      data: MONTH_LABELS
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
          legendselectchanged: handleLegendClick,
          contextmenu: handleContextMenu
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
