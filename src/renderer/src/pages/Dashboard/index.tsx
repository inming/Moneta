import { useEffect, useState, useMemo } from 'react'
import { Select, Empty, Typography, Spin } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useTranslation } from 'react-i18next'
import { useThemeStore } from '../../stores/theme.store'
import type { Category, ForecastResult } from '@shared/types'

const { Text } = Typography

function formatAmount(value: number): string {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Dashboard(): React.JSX.Element {
  const { t, i18n } = useTranslation(['dashboard', 'statistics'])
  const { isDark } = useThemeStore()

  const [categories, setCategories] = useState<Category[]>([])
  const ALL_CATEGORIES = -1
  const [selectedCategoryId, setSelectedCategoryId] = useState<number>(ALL_CATEGORIES)
  const [forecast, setForecast] = useState<ForecastResult | null>(null)
  const [loading, setLoading] = useState(false)

  const MONTH_LABELS = [
    t('statistics:months.jan'), t('statistics:months.feb'), t('statistics:months.mar'),
    t('statistics:months.apr'), t('statistics:months.may'), t('statistics:months.jun'),
    t('statistics:months.jul'), t('statistics:months.aug'), t('statistics:months.sep'),
    t('statistics:months.oct'), t('statistics:months.nov'), t('statistics:months.dec')
  ]

  const formatLargeNumber = (v: number): string => {
    if (i18n.language === 'zh-CN') {
      return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : String(v)
    }
    return v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v)
  }

  useEffect(() => {
    window.api.category.list('expense').then(setCategories)
  }, [])

  useEffect(() => {
    setLoading(true)
    window.api.stats
      .forecast({ category_id: selectedCategoryId === ALL_CATEGORIES ? undefined : selectedCategoryId })
      .then(setForecast)
      .finally(() => setLoading(false))
  }, [selectedCategoryId])

  const hasData = forecast && forecast.months.some((m) => m.amount > 0)

  const chartOption = useMemo(() => {
    if (!forecast) return {}

    const currentMonthIdx = new Date().getMonth() // 0-based
    const actualData = forecast.months.map((m, i) => (m.isActual && i !== currentMonthIdx ? m.amount : null))
    const predictedData = forecast.months.map((m, i) => (!m.isActual || i === currentMonthIdx ? m.amount : null))

    // Build cumulative data
    const cumulativeActual: (number | null)[] = []
    const cumulativePredicted: (number | null)[] = []
    let cumSum = 0
    let lastActualCum = 0

    for (let i = 0; i < 12; i++) {
      cumSum += forecast.months[i].amount
      if (forecast.months[i].isActual) {
        cumulativeActual.push(cumSum)
        cumulativePredicted.push(null)
        lastActualCum = cumSum
      } else {
        cumulativeActual.push(null)
        // Connect the predicted line from last actual point
        if (i > 0 && cumulativePredicted[i - 1] === null && lastActualCum > 0) {
          // First predicted month — also push to cumulativeActual to connect the lines
          cumulativeActual[i] = null
        }
        cumulativePredicted.push(cumSum)
      }
    }

    // Make the predicted line connect from the last actual point
    // Find the transition index
    const transitionIdx = forecast.months.findIndex((m) => !m.isActual)
    if (transitionIdx > 0) {
      cumulativePredicted[transitionIdx - 1] = cumulativeActual[transitionIdx - 1]
    }

    const actualLabel = t('dashboard:actual')
    const predictedLabel = t('dashboard:predicted')
    const cumActualLabel = t('dashboard:cumulativeActual')
    const cumPredictedLabel = t('dashboard:cumulativePredicted')

    return {
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: Array<{ seriesName: string; value: number | null; color: string; marker: string }>) => {
          const items = params.filter((p) => p.value != null && p.value > 0)
          if (items.length === 0) return ''
          const month = params[0] && 'axisValue' in params[0] ? (params[0] as unknown as { axisValue: string }).axisValue : ''
          let html = `<b>${month}</b>`
          for (const item of items) {
            html += `<br/>${item.marker}${item.seriesName}: ¥${formatAmount(item.value!)}`
          }
          return html
        }
      },
      legend: {
        bottom: 0,
        left: 'center',
        data: [actualLabel, predictedLabel, cumActualLabel, cumPredictedLabel]
      },
      grid: {
        left: 60,
        right: 60,
        top: 20,
        bottom: 60
      },
      xAxis: {
        type: 'category' as const,
        data: MONTH_LABELS
      },
      yAxis: [
        {
          type: 'value' as const,
          axisLabel: {
            formatter: formatLargeNumber
          }
        },
        {
          type: 'value' as const,
          axisLabel: {
            formatter: formatLargeNumber
          },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: actualLabel,
          type: 'bar',
          yAxisIndex: 0,
          data: actualData,
          itemStyle: {
            borderRadius: [2, 2, 0, 0]
          }
        },
        {
          name: predictedLabel,
          type: 'bar',
          yAxisIndex: 0,
          data: predictedData,
          itemStyle: {
            opacity: 0.45,
            borderType: 'dashed' as const,
            borderWidth: 1,
            borderRadius: [2, 2, 0, 0]
          }
        },
        {
          name: cumActualLabel,
          type: 'line',
          yAxisIndex: 1,
          data: cumulativeActual,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: {
            width: 2
          }
        },
        {
          name: cumPredictedLabel,
          type: 'line',
          yAxisIndex: 1,
          data: cumulativePredicted,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: {
            width: 2,
            type: 'dashed' as const
          },
          markPoint: {
            data: [
              {
                coord: [11, cumulativePredicted[11] ?? cumSum],
                value: `¥${formatAmount(forecast.totalForecast)}`,
                itemStyle: { color: 'transparent' },
                label: {
                  show: true,
                  position: 'top',
                  formatter: t('dashboard:annualForecast', {
                    amount: formatAmount(forecast.totalForecast)
                  }),
                  fontSize: 12,
                  fontWeight: 'bold' as const
                }
              }
            ],
            symbol: 'pin',
            symbolSize: 0
          }
        }
      ]
    }
  }, [forecast, t, i18n.language])

  const categoryOptions = [
    { label: t('dashboard:allCategories'), value: ALL_CATEGORIES },
    ...categories.map((c) => ({ label: c.name, value: c.id }))
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Text strong style={{ fontSize: 18, userSelect: 'none' }}>
          {t('dashboard:title', { year: new Date().getFullYear() })}
        </Text>
        <Select
          value={selectedCategoryId}
          options={categoryOptions}
          onChange={setSelectedCategoryId}
          style={{ width: 160 }}
          size="small"
        />
      </div>

      <div style={{ flex: 1, minHeight: 400 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Spin size="large" />
          </div>
        ) : !hasData ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Empty description={t('dashboard:noData')} />
          </div>
        ) : (
          <ReactECharts
            option={chartOption}
            theme={isDark ? 'dark' : undefined}
            style={{ height: '100%', width: '100%' }}
            notMerge={true}
          />
        )}
      </div>
    </div>
  )
}
