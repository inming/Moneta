import { useState } from 'react'
import { Table, Empty } from 'antd'
import { useTranslation } from 'react-i18next'
import type { ColumnsType, ColumnType } from 'antd/es/table'
import type { SorterResult } from 'antd/es/table/interface'
import type { CrossTableData } from '../../../../shared/types'

interface CrossTableProps {
  data: CrossTableData | null
  loading: boolean
}

interface TableRow {
  key: string
  category_name: string
  m1: number; m2: number; m3: number; m4: number; m5: number; m6: number
  m7: number; m8: number; m9: number; m10: number; m11: number; m12: number
  yearly: number
}

type MonthKey = 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6' | 'm7' | 'm8' | 'm9' | 'm10' | 'm11' | 'm12'
type SortableKey = MonthKey | 'yearly'

function formatAmount(value: number): string {
  if (value === 0) return '—'
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toTableRow(categoryName: string, months: number[], yearly: number, key: string): TableRow {
  return {
    key,
    category_name: categoryName,
    m1: months[0], m2: months[1], m3: months[2], m4: months[3],
    m5: months[4], m6: months[5], m7: months[6], m8: months[7],
    m9: months[8], m10: months[9], m11: months[10], m12: months[11],
    yearly
  }
}

function makeSorter(field: SortableKey): ColumnType<TableRow>['sorter'] {
  return (a: TableRow, b: TableRow): number => a[field] - b[field]
}

export default function CrossTable({ data, loading }: CrossTableProps): React.JSX.Element {
  const { t } = useTranslation('statistics')
  const [sortedColumn, setSortedColumn] = useState<SortableKey | null>(null)

  const MONTH_LABELS = [
    t('months.jan'), t('months.feb'), t('months.mar'), t('months.apr'),
    t('months.may'), t('months.jun'), t('months.jul'), t('months.aug'),
    t('months.sep'), t('months.oct'), t('months.nov'), t('months.dec')
  ]

  if (!loading && (!data || data.rows.length === 0)) {
    return <Empty description={t('table.noData')} style={{ padding: 40 }} />
  }

  // 获取某列的合计值，用于算占比
  const getColumnTotal = (field: SortableKey): number => {
    if (!data) return 0
    if (field === 'yearly') return data.totals.yearly
    const monthIndex = parseInt(field.slice(1)) - 1
    return data.totals.months[monthIndex]
  }

  const renderCell = (field: SortableKey) => function RenderCell(v: number): React.ReactNode {
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

  const renderSummaryCell = (field: SortableKey, value: number): React.ReactNode => {
    const amountStr = formatAmount(value)
    if (sortedColumn !== field || value === 0) return amountStr
    return (
      <span>
        {amountStr} <span style={{ color: '#999', fontSize: 12 }}>100%</span>
      </span>
    )
  }

  const columns: ColumnsType<TableRow> = [
    {
      title: t('table.category'),
      dataIndex: 'category_name',
      key: 'category_name',
      fixed: 'left',
      width: 120
    },
    ...MONTH_LABELS.map((label, i) => {
      const field = `m${i + 1}` as MonthKey
      return {
        title: label,
        dataIndex: field,
        key: field,
        minWidth: sortedColumn === field ? 140 : 100,
        align: 'right' as const,
        sorter: makeSorter(field),
        render: renderCell(field)
      }
    }),
    {
      title: t('table.total'),
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
    ? data.rows.map((row) =>
        toTableRow(row.category_name, row.months, row.yearly, String(row.category_id))
      )
    : []

  const handleChange = (
    _pagination: unknown,
    _filters: unknown,
    sorter: SorterResult<TableRow> | SorterResult<TableRow>[]
  ): void => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter
    setSortedColumn(s.order ? (s.field as SortableKey) : null)
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
            <Table.Summary.Row style={{ fontWeight: 600, background: 'var(--table-summary-bg)' }}>
              <Table.Summary.Cell index={0} align="left">{t('table.total')}</Table.Summary.Cell>
              {data.totals.months.map((v, i) => (
                <Table.Summary.Cell key={i} index={i + 1} align="right">
                  {renderSummaryCell(`m${i + 1}` as MonthKey, v)}
                </Table.Summary.Cell>
              ))}
              <Table.Summary.Cell index={13} align="right">
                {renderSummaryCell('yearly', data.totals.yearly)}
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )
      }}
    />
  )
}
