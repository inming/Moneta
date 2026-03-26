import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, Radio, Spin } from 'antd'
import { useTranslation } from 'react-i18next'
import type { TransactionType } from '../../../../shared/types/transaction'
import type { CrossTableData, YearlyCategoryData } from '../../../../shared/types'
import FilterBar from './FilterBar'
import CrossTable from './CrossTable'
import YearlyTable from './YearlyTable'
import BarChart from './BarChart'
import YearlyBarChart from './YearlyBarChart'

export default function Statistics(): React.JSX.Element {
  const { t } = useTranslation('statistics')
  const [searchParams] = useSearchParams()
  const currentDate = new Date()

  // Restore state from URL parameters
  const urlYear = searchParams.get('year')
  const urlTab = searchParams.get('tab')
  const urlType = searchParams.get('type') as TransactionType | null
  const urlSoloCategory = searchParams.get('soloCategory')

  const [year, setYear] = useState(
    urlYear ? parseInt(urlYear, 10) || currentDate.getFullYear() : currentDate.getFullYear()
  )
  const [type, setType] = useState<TransactionType>(
    urlType && ['expense', 'income', 'investment'].includes(urlType) ? urlType : 'expense'
  )
  const [viewTab, setViewTab] = useState<'monthly' | 'yearly'>(urlTab === 'yearly' ? 'yearly' : 'monthly')

  // Save soloCategory for passing to chart components
  const [initialSoloCategory] = useState<string | null>(urlSoloCategory)

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
          { value: 'monthly', label: t('viewTabs.monthly') },
          { value: 'yearly', label: t('viewTabs.yearly') }
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
        <Card size="small" title={t('chartTitles.monthlyTrend')}>
          <BarChart data={crossTableData} year={year} type={type} initialSoloCategory={initialSoloCategory} />
        </Card>
      ) : (
        <Card size="small" title={t('chartTitles.yearlyTrend')}>
          <YearlyBarChart data={yearlyCategoryData} type={type} year={year} initialSoloCategory={initialSoloCategory} />
        </Card>
      )}
    </div>
  )
}
