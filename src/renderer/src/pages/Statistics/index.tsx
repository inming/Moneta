import { useState, useEffect, useCallback } from 'react'
import { Card, Col, Row, Spin } from 'antd'
import type { TransactionType } from '../../../../shared/types/transaction'
import type { CrossTableData, Operator } from '../../../../shared/types'
import FilterBar from './FilterBar'
import CrossTable from './CrossTable'
import PieChart from './PieChart'
import BarChart from './BarChart'

export default function Statistics(): React.JSX.Element {
  const currentDate = new Date()
  const [year, setYear] = useState(currentDate.getFullYear())
  const [type, setType] = useState<TransactionType>('expense')
  const [operatorId, setOperatorId] = useState<number | undefined>(undefined)

  const [crossTableData, setCrossTableData] = useState<CrossTableData | null>(null)
  const [operators, setOperators] = useState<Operator[]>([])
  const [minYear, setMinYear] = useState(currentDate.getFullYear())
  const [maxYear, setMaxYear] = useState(currentDate.getFullYear())
  const [loading, setLoading] = useState(false)
  const [initLoading, setInitLoading] = useState(true)

  // Initial load: year range + operators
  useEffect(() => {
    Promise.all([
      window.api.stats.yearRange(),
      window.api.operator.list()
    ]).then(([yearRange, ops]) => {
      setMinYear(yearRange.minYear)
      setMaxYear(yearRange.maxYear)
      setOperators(ops)
      setInitLoading(false)
    })
  }, [])

  // Fetch data when filters change
  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const crossTable = await window.api.stats.crossTable({ year, type, operator_id: operatorId })
      setCrossTableData(crossTable)
    } finally {
      setLoading(false)
    }
  }, [year, type, operatorId])

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
      <FilterBar
        year={year}
        type={type}
        operatorId={operatorId}
        minYear={minYear}
        maxYear={maxYear}
        operators={operators}
        onChange={(values) => {
          if (values.year !== undefined) setYear(values.year)
          if (values.type !== undefined) setType(values.type)
          if ('operatorId' in values) setOperatorId(values.operatorId)
        }}
      />
      <Card size="small" title="分类月度明细">
        <CrossTable data={crossTableData} loading={loading} />
      </Card>
      <Row gutter={16}>
        <Col span={10}>
          <Card size="small" title="分类占比">
            <PieChart data={crossTableData} />
          </Card>
        </Col>
        <Col span={14}>
          <Card size="small" title="月度趋势">
            <BarChart data={crossTableData} />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
