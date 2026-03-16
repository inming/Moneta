import { useState, useEffect, useCallback } from 'react'
import { Card, Radio, Spin } from 'antd'
import type { TransactionType } from '../../../../shared/types/transaction'
import type { CrossTableData, YearlyCategoryData } from '../../../../shared/types'
import FilterBar from './FilterBar'
import CrossTable from './CrossTable'
import YearlyTable from './YearlyTable'
import BarChart from './BarChart'
import YearlyBarChart from './YearlyBarChart'

export default function Statistics(): React.JSX.Element {
  const currentDate = new Date()
  const [year, setYear] = useState(currentDate.getFullYear())
  const [type, setType] = useState<TransactionType>('expense')
  const [viewTab, setViewTab] = useState<'monthly' | 'yearly'>('monthly')

  const [crossTableData, setCrossTableData] = useState<CrossTableData | null>(null)
  const [yearlyCategoryData, setYearlyCategoryData] = useState<YearlyCategoryData | null>(null)
  const [minYear, setMinYear] = useState(currentDate.getFullYear())
  const [maxYear, setMaxYear] = useState(currentDate.getFullYear())
  const [loading, setLoading] = useState(false)
  const [initLoading, setInitLoading] = useState(true)

  // Initial load: year range
  useEffect(() => {
    window.api.stats.yearRange().then((yearRange) => {
      setMinYear(yearRange.minYear)
      setMaxYear(yearRange.maxYear)
      setInitLoading(false)
    })
  }, [])

  // Fetch data when filters change
  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      if (viewTab === 'monthly') {
        const crossTable = await window.api.stats.crossTable({ year, type })
        setCrossTableData(crossTable)
      } else {
        const yearlyCategory = await window.api.stats.yearlyCategory({ type })
        setYearlyCategoryData(yearlyCategory)
      }
    } finally {
      setLoading(false)
    }
  }, [year, type, viewTab])

  useEffect(() => {
    if (!initLoading) {
      fetchData()
    }
  }, [fetchData, initLoading])

  if (initLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 100 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Radio.Group
        value={viewTab}
        onChange={(e) => setViewTab(e.target.value as 'monthly' | 'yearly')}
        optionType="button"
        buttonStyle="solid"
        options={[
          { value: 'monthly', label: '月度明细' },
          { value: 'yearly', label: '年度汇总' }
        ]}
      />
      <FilterBar
        year={year}
        type={type}
        minYear={minYear}
        maxYear={maxYear}
        showYearFilter={viewTab === 'monthly'}
        onChange={(values) => {
          if (values.year !== undefined) setYear(values.year)
          if (values.type !== undefined) setType(values.type)
        }}
      />
      <Card size="small">
        {viewTab === 'monthly'
          ? <CrossTable data={crossTableData} loading={loading} />
          : <YearlyTable data={yearlyCategoryData} loading={loading} />
        }
      </Card>
      {viewTab === 'monthly' ? (
        <Card size="small" title="月度趋势">
          <BarChart data={crossTableData} />
        </Card>
      ) : (
        <Card size="small" title="年度趋势">
          <YearlyBarChart data={yearlyCategoryData} />
        </Card>
      )}
    </div>
  )
}
