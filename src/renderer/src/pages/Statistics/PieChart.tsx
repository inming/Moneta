import ReactECharts from 'echarts-for-react'
import { Empty } from 'antd'
import { useTranslation } from 'react-i18next'
import type { CrossTableData } from '../../../../shared/types'
import { useThemeStore } from '../../stores/theme.store'

interface PieChartProps {
  data: CrossTableData | null
}

function formatAmount(value: number): string {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function PieChart({ data }: PieChartProps): React.JSX.Element {
  const { t } = useTranslation('statistics')
  const { isDark } = useThemeStore()

  if (!data || data.rows.length === 0) {
    return <Empty description={t('table.noData')} style={{ padding: 40 }} />
  }

  // Merge items < 2% into "其他"
  const total = data.totals.yearly
  const threshold = total * 0.02
  const items: { name: string; value: number }[] = []
  let otherValue = 0

  for (const row of data.rows) {
    if (row.yearly === 0) continue
    if (Math.abs(row.yearly) < threshold) {
      otherValue += row.yearly
    } else {
      items.push({ name: row.category_name, value: row.yearly })
    }
  }
  if (otherValue !== 0) {
    items.push({ name: t('chart.other'), value: otherValue })
  }

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: (params: { name: string; value: number; percent: number }): string =>
        `${params.name}: ¥${formatAmount(params.value)} (${params.percent}%)`
    },
    legend: {
      orient: 'horizontal' as const,
      bottom: 0,
      left: 'center',
      type: 'plain'
    },
    graphic: {
      type: 'text',
      left: 'center',
      top: '42%',
      style: {
        text: `¥${formatAmount(total)}`,
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'center',
        fill: isDark ? '#ffffff' : '#000000'
      }
    },
    series: [
      {
        type: 'pie',
        radius: ['35%', '60%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: false,
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 14, fontWeight: 'bold' }
        },
        data: items
      }
    ]
  }

  return <ReactECharts option={option} theme={isDark ? 'dark' : undefined} notMerge={true} style={{ height: 300 }} />
}
