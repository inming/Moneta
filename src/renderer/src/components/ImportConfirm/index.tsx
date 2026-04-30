import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Select, InputNumber, Input, Table, Space,
  Alert, Typography, message, Card, DatePicker, Badge
} from 'antd'
import {
  CheckOutlined, ArrowLeftOutlined, PlusOutlined,
  DeleteOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import type { Category, Operator, TransactionType, DraftSource, DraftData, DraftTransaction } from '@shared/types'
import { TRANSACTION_TYPE_CONFIG } from '@shared/constants/transaction-type'
import { useDraftStore } from '../../stores/draft.store'

const { Text, Title } = Typography

// 本地状态编辑的 Input，失焦时才提交，避免每次按键触发全表重渲染
const BlurInput = memo(({ value, onChange, ...props }: {
  value: string
  onChange: (val: string) => void
  size?: 'small' | 'middle' | 'large'
}) => {
  const [local, setLocal] = useState(value)
  const ref = useRef(value)
  ref.current = value

  useEffect(() => { setLocal(value) }, [value])

  return (
    <Input
      {...props}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== ref.current) onChange(local) }}
      onPressEnter={() => { if (local !== ref.current) onChange(local) }}
    />
  )
})

// 本地状态编辑的 InputNumber，失焦时才提交
const BlurInputNumber = memo(({ value, onChange, ...props }: {
  value: number
  onChange: (val: number) => void
  size?: 'small' | 'middle' | 'large'
  precision?: number
  style?: React.CSSProperties
}) => {
  const [local, setLocal] = useState(value)
  const ref = useRef(value)
  ref.current = value

  useEffect(() => { setLocal(value) }, [value])

  return (
    <InputNumber
      {...props}
      value={local}
      onChange={(val) => setLocal(val ?? 0)}
      onBlur={() => { if (local !== ref.current) onChange(local) }}
      onPressEnter={() => { if (local !== ref.current) onChange(local) }}
    />
  )
})

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
  /** 草稿来源 */
  draftSource: DraftSource
  /** 记账日期（草稿恢复用） */
  initialAccountingDate?: Dayjs
  /** MCP 数据来源描述 */
  mcpSource?: string
  /** 初始操作人 ID（草稿恢复用） */
  initialOperatorId?: number | null
  /** 是否从草稿恢复（跳过初始草稿创建，避免覆盖已保存的编辑） */
  restoredFromDraft?: boolean
}

export default function ImportConfirm({
  title,
  sourceInfo,
  initialRows,
  onConfirm,
  onCancel,
  draftSource,
  initialAccountingDate,
  mcpSource,
  initialOperatorId,
  restoredFromDraft = false
}: ImportConfirmProps): React.JSX.Element {
  const { t } = useTranslation(['import', 'common'])
  const navigate = useNavigate()
  const draftStore = useDraftStore()
  const [rows, setRows] = useState<ImportRow[]>(initialRows)
  const [categories, setCategories] = useState<Category[]>([])
  const [operators, setOperators] = useState<Operator[]>([])
  const [accountingDate, setAccountingDate] = useState<Dayjs | null>(initialAccountingDate ?? null)
  const [defaultOperatorId, setDefaultOperatorId] = useState<number | null>(initialOperatorId ?? null)
  const [submitting, setSubmitting] = useState(false)

  // 用于防止已卸载组件触发保存
  const unmountedRef = useRef(false)

  // 交易类型选项（需要在组件内部定义以使用 t()）
  const typeOptions = Object.keys(TRANSACTION_TYPE_CONFIG).map((key) => ({
    label: t(`common:transactionTypes.${key}` as const),
    value: key
  }))

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

      // 从草稿恢复时跳过初始草稿创建，避免覆盖用户已保存的编辑
      if (!restoredFromDraft) {
        // 首次进入页面时立即创建草稿（覆盖旧草稿）
        // 这样即使用户不做任何操作就关闭，数据也不会丢失
        const initialDraftData: DraftData = {
          transactions: initialRows.map(row => ({
            key: row.key,
            date: initialAccountingDate?.format('YYYY-MM-DD') ?? '',
            type: row.type,
            amount: row.amount,
            category_id: row.category_id,
            description: row.description,
            operator_id: row.operator_id ?? null
          })),
          operatorId: null,
          ...(mcpSource && {
            mcpSpecific: { source: mcpSource }
          })
        }

        console.log('[ImportConfirm] Creating initial draft with', initialRows.length, 'rows')
        await draftStore.saveDraft({
          id: 'current',
          source: draftSource,
          data: initialDraftData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        console.log('[ImportConfirm] Initial draft created')
      } else {
        console.log('[ImportConfirm] Restored from draft, skipping initial draft creation')
      }
    }
    loadData()
  }, [])

  // 转换为 DraftTransaction
  const toDraftTransactions = useCallback((rows: ImportRow[]): DraftTransaction[] => {
    return rows.map(row => ({
      key: row.key,
      date: accountingDate?.format('YYYY-MM-DD') ?? '',
      type: row.type,
      amount: row.amount,
      category_id: row.category_id,
      description: row.description,
      operator_id: row.operator_id
    }))
  }, [accountingDate])

  // 自动保存草稿：监听所有可变状态，变化时即时保存
  // 跳过首次渲染（初始草稿由 loadData useEffect 处理）
  const isInitialRenderRef = useRef(true)
  useEffect(() => {
    if (isInitialRenderRef.current) {
      isInitialRenderRef.current = false
      return
    }
    if (unmountedRef.current) return

    const draftData: DraftData = {
      transactions: toDraftTransactions(rows),
      operatorId: defaultOperatorId,
      ...(mcpSource && {
        mcpSpecific: { source: mcpSource }
      })
    }

    draftStore.saveDraft({
      id: 'current',
      source: draftSource,
      data: draftData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
  }, [rows, defaultOperatorId, accountingDate])

  // 清理草稿
  const clearDraft = useCallback(async () => {
    console.log('[ImportConfirm] Clearing draft...')
    unmountedRef.current = true  // 阻止 useEffect 再触发保存
    await draftStore.deleteDraft()
    console.log('[ImportConfirm] Draft cleared')
  }, [draftStore])

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
      message.warning(t('import:messages.noRecords'))
      return
    }

    const emptyCategories = rows.filter((r) => r.category_id === null)
    if (emptyCategories.length > 0) {
      message.error(t('import:messages.missingCategories', { count: emptyCategories.length }))
      return
    }

    if (!accountingDate) {
      message.error(t('import:messages.missingDate'))
      return
    }

    if (!defaultOperatorId) {
      message.error(t('import:messages.missingOperator'))
      return
    }

    setSubmitting(true)
    try {
      await onConfirm(rows, accountingDate)
      // 导入成功后删除草稿
      console.log('[ImportConfirm] Import successful, clearing draft...')
      await clearDraft()
      console.log('[ImportConfirm] Draft cleared after import')
      message.success(t('import:messages.importSuccess', { count: rows.length }))
      navigate('/transactions')
    } catch (err) {
      console.error('[ImportConfirm] Import failed:', err)
      message.error(err instanceof Error ? err.message : t('import:messages.importFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  // 取消/返回
  const handleCancel = async () => {
    if (onCancel) {
      onCancel()
    } else {
      navigate('/transactions')
    }
  }

  const getCategoriesForType = (type: TransactionType): Category[] => {
    return categories.filter((c) => c.type === type)
  }

  const unmatchedCount = rows.filter((r) => r.category_id === null).length

  // 使用 useMemo 缓存 columns 配置，避免每次渲染都重新创建
  const columns = useMemo<ColumnsType<ImportRow>>(() => [
    {
      title: t('import:columns.type'),
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
      title: t('import:columns.amount'),
      dataIndex: 'amount',
      width: 120,
      render: (amount: number, record) => (
        <BlurInputNumber
          size="small"
          value={amount}
          precision={2}
          style={{ width: '100%' }}
          onChange={(val) => updateRow(record.key, 'amount', val)}
        />
      )
    },
    {
      title: t('import:columns.category'),
      dataIndex: 'category_id',
      width: 150,
      render: (categoryId: number | null, record) => (
        <Select
          size="small"
          value={categoryId}
          placeholder={t('import:placeholders.selectCategory')}
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
      title: t('import:columns.description'),
      dataIndex: 'description',
      render: (desc: string, record) => (
        <BlurInput
          size="small"
          value={desc}
          onChange={(val) => updateRow(record.key, 'description', val)}
        />
      )
    },
    {
      title: t('import:columns.operator'),
      dataIndex: 'operator_id',
      width: 120,
      render: (operatorId: number | null, record) => (
        <Select
          size="small"
          value={operatorId}
          allowClear
          placeholder={t('import:placeholders.optional')}
          style={{ width: '100%' }}
          options={operators.map((o) => ({ label: o.name, value: o.id }))}
          onChange={(val) => updateRow(record.key, 'operator_id', val ?? null)}
        />
      )
    },
    {
      title: t('import:columns.actions'),
      width: 160,
      render: (_, record) => (
        <Space size="small">
          <Button
            size="small"
            type="text"
            onClick={() => insertRow(record.key)}
          >
            {t('import:buttons.insertAbove')}
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
  ], [categories, operators, updateRow, insertRow, deleteRow, t, typeOptions])

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
                <strong>{t('import:info.source')}</strong>{sourceInfo}
              </Text>
            )}
            <Text>
              <strong>{t('import:info.totalRecords')}</strong>{t('import:info.recordCount', { count: rows.length })}
              {unmatchedCount > 0 && (
                <Badge
                  count={t('import:info.missingCategory', { count: unmatchedCount })}
                  style={{ backgroundColor: '#ff4d4f', marginLeft: 8 }}
                />
              )}
            </Text>
          </Space>
          <Space>
            <Text strong>{t('import:info.accountingDate')}</Text>
            <DatePicker
              value={accountingDate}
              placeholder={t('import:placeholders.selectDate')}
              status={!accountingDate ? 'error' : undefined}
              onChange={(date) => {
                if (date) {
                  setAccountingDate(date)
                }
              }}
              allowClear={false}
            />
            <Text strong>{t('import:info.operator')}</Text>
            <Select
              value={defaultOperatorId}
              placeholder={t('import:placeholders.selectOperator')}
              status={!defaultOperatorId ? 'error' : undefined}
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
              message={t('import:messages.missingCategoriesAlert', { count: unmatchedCount })}
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
        rowKey="key"
        rowClassName={(record) => {
          const typeClass = `row-type-${record.type}`
          const missingClass = record.category_id === null ? ' row-missing-category' : ''
          return `${typeClass}${missingClass}`
        }}
        scroll={{ x: 'max-content', y: 600 }}
        sticky
      />

      {/* 底部操作 */}
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <Button icon={<PlusOutlined />} onClick={appendRow}>
          {t('import:buttons.addRow')}
        </Button>
        <Button onClick={handleCancel}>{t('import:buttons.cancel')}</Button>
        <Button
          type="primary"
          icon={<CheckOutlined />}
          loading={submitting}
          onClick={handleConfirm}
          disabled={rows.length === 0 || unmatchedCount > 0}
        >
          {t('import:buttons.confirm', { count: rows.length })}
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
