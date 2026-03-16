import { useRef, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import { Empty } from 'antd'
import type { CrossTableData } from '../../../../shared/types'

interface BarChartProps {
  data: CrossTableData | null
}

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function formatAmount(value: number): string {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function BarChart({ data }: BarChartProps): React.JSX.Element {
  const chartRef = useRef<ReactECharts>(null)
  // 记录当前是否处于「独显」模式，以及独显的分类名
  const soloRef = useRef<string | null>(null)

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
    <ReactECharts
      ref={chartRef}
      option={option}
      style={{ height: 380 }}
      onEvents={{ legendselectchanged: handleLegendClick }}
    />
  )
}
