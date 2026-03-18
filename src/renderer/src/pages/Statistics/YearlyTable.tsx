import { useState } from 'react'
import { Table, Empty } from 'antd'
import type { ColumnsType, ColumnType } from 'antd/es/table'
import type { SorterResult } from 'antd/es/table/interface'
import type { YearlyCategoryData } from '../../../../shared/types'

interface YearlyTableProps {
  data: YearlyCategoryData | null
  loading: boolean
}

interface TableRow {
  key: string
  year: number
  yearly: number
  [field: string]: string | number
}

function formatAmount(value: number): string {
  if (value === 0) return '—'
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function YearlyTable({ data, loading }: YearlyTableProps): React.JSX.Element {
  const [sortedColumn, setSortedColumn] = useState<string | null>(null)

  if (!loading && (!data || data.rows.length === 0)) {
    return <Empty description="暂无数据" style={{ padding: 40 }} />
  }

  const categories = data?.categories ?? []

  const getColumnTotal = (field: string): number => {
    if (!data) return 0
    if (field === 'yearly') return data.totals.yearly
    const index = parseInt(field.slice(1))
    return data.totals.amounts[index]
  }

  const renderCell = (field: string) => function RenderCell(v: number): React.ReactNode {
    const amountStr = formatAmount(v)
    if (sortedColumn !== field || v === 0) return amountStr

    const total = getColumnTotal(field)
    const percent = total !== 0 ? ((v / total) * 100).toFixed(1) : '0.0'

    return (
      <span>
        {amountStr} <span style={{ color: '#999', fontSize: 12 }}>{percent}%</span>
      </span>
    )
  }

  const renderSummaryCell = (field: string, value: number): React.ReactNode => {
    const amountStr = formatAmount(value)
    if (sortedColumn !== field || value === 0) return amountStr
    return (
      <span>
        {amountStr} <span style={{ color: '#999', fontSize: 12 }}>100%</span>
      </span>
    )
  }

  const makeSorter = (field: string): ColumnType<TableRow>['sorter'] => {
    return (a: TableRow, b: TableRow): number => (a[field] as number) - (b[field] as number)
  }

  const columns: ColumnsType<TableRow> = [
    {
      title: '年度',
      dataIndex: 'year',
      key: 'year',
      fixed: 'left',
      width: 80
    },
    ...categories.map((cat, i) => {
      const field = `c${i}`
      return {
        title: cat.name,
        dataIndex: field,
        key: field,
        minWidth: sortedColumn === field ? 140 : 100,
        align: 'right' as const,
        sorter: makeSorter(field),
        render: renderCell(field)
      }
    }),
    {
      title: '合计',
      dataIndex: 'yearly',
      key: 'yearly',
      fixed: 'right',
      minWidth: sortedColumn === 'yearly' ? 160 : 120,
      align: 'right' as const,
      sorter: makeSorter('yearly'),
      render: renderCell('yearly')
    }
  ]

  const dataSource: TableRow[] = data
    ? data.rows.map((row) => {
        const record: TableRow = {
          key: String(row.year),
          year: row.year,
          yearly: row.yearly
        }
        row.amounts.forEach((v, i) => {
          record[`c${i}`] = v
        })
        return record
      })
    : []

  const handleChange = (
    _pagination: unknown,
    _filters: unknown,
    sorter: SorterResult<TableRow> | SorterResult<TableRow>[]
  ): void => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter
    setSortedColumn(s.order ? (s.field as string) : null)
  }

  return (
    <Table<TableRow>
      columns={columns}
      dataSource={dataSource}
      loading={loading}
      pagination={false}
      size="small"
      bordered
      sortDirections={['descend', 'ascend']}
      scroll={{ x: 'max-content', y: 'calc(100vh - 360px)' }}
      onChange={handleChange}
      summary={() => {
        if (!data) return null
        return (
          <Table.Summary fixed>
            <Table.Summary.Row style={{ fontWeight: 600, background: '#fafafa' }}>
              <Table.Summary.Cell index={0} align="left">合计</Table.Summary.Cell>
              {data.totals.amounts.map((v, i) => (
                <Table.Summary.Cell key={i} index={i + 1} align="right">
                  {renderSummaryCell(`c${i}`, v)}
                </Table.Summary.Cell>
              ))}
              <Table.Summary.Cell index={categories.length + 1} align="right">
                {renderSummaryCell('yearly', data.totals.yearly)}
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )
      }}
    />
  )
}
