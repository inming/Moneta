import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Select, InputNumber, Input, Table, Space,
  Alert, Typography, message, Card, DatePicker, Badge
} from 'antd'
import {
  CheckOutlined, ArrowLeftOutlined, PlusOutlined,
  DeleteOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import type { Category, Operator, TransactionType } from '@shared/types'
import { TRANSACTION_TYPE_CONFIG } from '@shared/constants/transaction-type'

const { Text, Title } = Typography

const typeOptions = Object.entries(TRANSACTION_TYPE_CONFIG).map(([value, config]) => ({
  label: config.label,
  value
}))

// 导入行数据接口
export interface ImportRow {
  key: string
  type: 'expense' | 'income' | 'investment'
  amount: number
  category_id: number | null
  description: string
  operator_id: number | null
}

// 组件 Props
interface ImportConfirmProps {
  title: string
  sourceInfo?: string
  initialRows: ImportRow[]
  onConfirm: (rows: ImportRow[], accountingDate: Dayjs) => Promise<void>
  onCancel?: () => void
}

export default function ImportConfirm({
  title,
  sourceInfo,
  initialRows,
  onConfirm,
  onCancel
}: ImportConfirmProps): React.JSX.Element {
  const navigate = useNavigate()
  const [rows, setRows] = useState<ImportRow[]>(initialRows)
  const [categories, setCategories] = useState<Category[]>([])
  const [operators, setOperators] = useState<Operator[]>([])
  const [accountingDate, setAccountingDate] = useState(dayjs())
  const [defaultOperatorId, setDefaultOperatorId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 加载分类和操作人
  useEffect(() => {
    const loadData = async () => {
      const [expense, income, investment, ops] = await Promise.all([
        window.api.category.list('expense'),
        window.api.category.list('income'),
        window.api.category.list('investment'),
        window.api.operator.list()
      ])
      setCategories([...expense, ...income, ...investment])
      setOperators(ops)
      if (ops.length > 0) {
        setDefaultOperatorId(ops[0].id)
        // 如果初始行没有操作人，设置默认值
        setRows(prev => prev.map(row => ({
          ...row,
          operator_id: row.operator_id ?? ops[0].id
        })))
      }
    }
    loadData()
  }, [])

  // 更新行数据
  const updateRow = useCallback((key: string, field: keyof ImportRow, value: unknown) => {
    setRows((prev) => prev.map((row) => {
      if (row.key !== key) return row
      if (field === 'type') {
        return { ...row, type: value as ImportRow['type'], category_id: null }
      }
      return { ...row, [field]: value } as ImportRow
    }))
  }, [])

  // 删除行
  const deleteRow = useCallback((key: string) => {
    setRows((prev) => prev.filter((row) => row.key !== key))
  }, [])

  // 插入行
  const insertRow = useCallback((key: string) => {
    setRows((prev) => {
      const index = prev.findIndex((r) => r.key === key)
      const currentRow = prev[index]
      const newRow: ImportRow = {
        key: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: currentRow!.type,
        amount: 0,
        description: '',
        category_id: null,
        operator_id: currentRow!.operator_id ?? defaultOperatorId
      }
      const newRows = [...prev]
      newRows.splice(index, 0, newRow)
      return newRows
    })
  }, [defaultOperatorId])

  // 追加行
  const appendRow = useCallback(() => {
    setRows((prev) => {
      const lastRow = prev[prev.length - 1]
      const newRow: ImportRow = {
        key: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: lastRow?.type ?? 'expense',
        amount: 0,
        description: '',
        category_id: null,
        operator_id: lastRow?.operator_id ?? defaultOperatorId
      }
      return [...prev, newRow]
    })
  }, [defaultOperatorId])

  // 确认导入
  const handleConfirm = async () => {
    if (rows.length === 0) {
      message.warning('没有可提交的记录')
      return
    }

    const emptyCategories = rows.filter((r) => r.category_id === null)
    if (emptyCategories.length > 0) {
      message.error(`还有 ${emptyCategories.length} 条交易未选择分类，请补充后再提交`)
      return
    }

    setSubmitting(true)
    try {
      await onConfirm(rows, accountingDate)
      message.success(`成功录入 ${rows.length} 条交易记录`)
      navigate('/')
    } catch (err) {
      message.error(err instanceof Error ? err.message : '导入失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 取消/返回
  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    } else {
      navigate('/')
    }
  }

  const getCategoriesForType = (type: TransactionType): Category[] => {
    return categories.filter((c) => c.type === type)
  }

  const unmatchedCount = rows.filter((r) => r.category_id === null).length

  const columns: ColumnsType<ImportRow> = [
    {
      title: '类型',
      dataIndex: 'type',
      width: 110,
      render: (type: TransactionType, record) => (
        <Select
          size="small"
          value={type}
          options={typeOptions}
          style={{ width: '100%' }}
          onChange={(val) => updateRow(record.key, 'type', val)}
        />
      )
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 120,
      render: (amount: number, record) => (
        <InputNumber
          size="small"
          value={amount}
          precision={2}
          style={{ width: '100%' }}
          onChange={(val) => updateRow(record.key, 'amount', val || 0)}
        />
      )
    },
    {
      title: '分类',
      dataIndex: 'category_id',
      width: 150,
      render: (categoryId: number | null, record) => (
        <Select
          size="small"
          value={categoryId}
          placeholder="请选择"
          style={{ width: '100%' }}
          status={categoryId === null ? 'error' : undefined}
          options={getCategoriesForType(record.type).map((c) => ({
            label: c.name,
            value: c.id
          }))}
          onChange={(val) => updateRow(record.key, 'category_id', val)}
        />
      )
    },
    {
      title: '描述',
      dataIndex: 'description',
      render: (desc: string, record) => (
        <Input
          size="small"
          value={desc}
          onChange={(e) => updateRow(record.key, 'description', e.target.value)}
        />
      )
    },
    {
      title: '操作人',
      dataIndex: 'operator_id',
      width: 120,
      render: (operatorId: number | null, record) => (
        <Select
          size="small"
          value={operatorId}
          allowClear
          placeholder="可选"
          style={{ width: '100%' }}
          options={operators.map((o) => ({ label: o.name, value: o.id }))}
          onChange={(val) => updateRow(record.key, 'operator_id', val ?? null)}
        />
      )
    },
    {
      title: '操作',
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Button
            size="small"
            type="text"
            onClick={() => insertRow(record.key)}
          >
            上方插入
          </Button>
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => deleteRow(record.key)}
          />
        </Space>
      )
    }
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={handleCancel}
        />
        <Title level={4} style={{ margin: 0 }}>{title}</Title>
      </div>

      {/* 信息栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space wrap>
            {sourceInfo && (
              <Text>
                <strong>来源：</strong>{sourceInfo}
              </Text>
            )}
            <Text>
              <strong>共识别：</strong>{rows.length} 条记录
              {unmatchedCount > 0 && (
                <Badge
                  count={`待补充分类: ${unmatchedCount}`}
                  style={{ backgroundColor: '#ff4d4f', marginLeft: 8 }}
                />
              )}
            </Text>
          </Space>
          <Space>
            <Text strong>记账日期：</Text>
            <DatePicker
              value={accountingDate}
              onChange={(date) => date && setAccountingDate(date)}
              allowClear={false}
            />
            <Text>操作人：</Text>
            <Select
              value={defaultOperatorId}
              style={{ width: 120 }}
              options={operators.map((o) => ({ label: o.name, value: o.id }))}
              onChange={(val) => {
                setDefaultOperatorId(val)
                setRows((prev) => prev.map((row) => ({
                  ...row,
                  operator_id: val
                })))
              }}
            />
          </Space>
          {unmatchedCount > 0 && (
            <Alert
              message={`还有 ${unmatchedCount} 条交易未选择分类，请补充后提交`}
              type="warning"
              showIcon
            />
          )}
        </Space>
      </Card>

      {/* 数据表格 */}
      <Table
        dataSource={rows}
        columns={columns}
        pagination={false}
        size="small"
        rowClassName={(record) => {
          const typeClass = `row-type-${record.type}`
          const missingClass = record.category_id === null ? ' row-missing-category' : ''
          return `${typeClass}${missingClass}`
        }}
        scroll={{ x: 'max-content' }}
      />

      {/* 底部操作 */}
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <Button icon={<PlusOutlined />} onClick={appendRow}>
          添加一行
        </Button>
        <Button onClick={handleCancel}>取消</Button>
        <Button
          type="primary"
          icon={<CheckOutlined />}
          loading={submitting}
          onClick={handleConfirm}
          disabled={rows.length === 0 || unmatchedCount > 0}
        >
          确认导入 ({rows.length} 条)
        </Button>
      </div>

      <style>{`
        .row-type-expense > td {
          background-color: #fff7e6 !important;
        }
        .row-type-expense:hover > td {
          background-color: #fff1d6 !important;
        }
        .row-type-income > td {
          background-color: #f6ffed !important;
        }
        .row-type-income:hover > td {
          background-color: #eeffdd !important;
        }
        .row-type-investment > td {
          background-color: #e6f4ff !important;
        }
        .row-type-investment:hover > td {
          background-color: #d6ebff !important;
        }
        .row-missing-category > td {
          background-color: #fff2f0 !important;
        }
        .row-missing-category:hover > td {
          background-color: #ffebe8 !important;
        }
      `}</style>
    </div>
  )
}
