import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
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
  /** 记账日期（AI 识别用） */
  initialAccountingDate?: Dayjs
  /** 图片路径列表（AI 识别用） */
  imagePaths?: string[]
  /** MCP 数据来源描述 */
  mcpSource?: string
}

export default function ImportConfirm({
  title,
  sourceInfo,
  initialRows,
  onConfirm,
  onCancel,
  draftSource,
  initialAccountingDate,
  imagePaths,
  mcpSource
}: ImportConfirmProps): React.JSX.Element {
  const { t } = useTranslation(['import', 'common'])
  const navigate = useNavigate()
  const draftStore = useDraftStore()
  const [rows, setRows] = useState<ImportRow[]>(initialRows)
  const [categories, setCategories] = useState<Category[]>([])
  const [operators, setOperators] = useState<Operator[]>([])
  const [accountingDate, setAccountingDate] = useState(initialAccountingDate ?? dayjs())
  const [defaultOperatorId, setDefaultOperatorId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 防抖保存的 timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      if (ops.length > 0) {
        setDefaultOperatorId(ops[0].id)
        // 如果初始行没有操作人，设置默认值
        setRows(prev => prev.map(row => ({
          ...row,
          operator_id: row.operator_id ?? ops[0].id
        })))
      }
      
      // 首次进入页面时立即创建草稿（覆盖旧草稿）
      // 这样即使用户不做任何操作就关闭，数据也不会丢失
      const initialDraftData: DraftData = {
        transactions: initialRows.map(row => ({
          key: row.key,
          date: (initialAccountingDate ?? dayjs()).format('YYYY-MM-DD'),
          type: row.type,
          amount: row.amount,
          category_id: row.category_id,
          description: row.description,
          operator_id: row.operator_id ?? ops[0]?.id ?? null
        })),
        operatorId: ops[0]?.id ?? null,
        ...(draftSource === 'ai' && {
          aiSpecific: {
            accountingDate: (initialAccountingDate ?? dayjs()).format('YYYY-MM-DD'),
            imagePaths: imagePaths ?? []
          }
        }),
        ...(draftSource === 'mcp' && mcpSource && {
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
    }
    loadData()
  }, [])

  // 转换为 DraftTransaction
  const toDraftTransactions = useCallback((rows: ImportRow[]): DraftTransaction[] => {
    return rows.map(row => ({
      key: row.key,
      date: accountingDate.format('YYYY-MM-DD'),
      type: row.type,
      amount: row.amount,
      category_id: row.category_id,
      description: row.description,
      operator_id: row.operator_id
    }))
  }, [accountingDate])

  // 保存草稿（防抖）
  const saveDraft = useCallback(() => {
    // 清除之前的 timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    
    // 2 秒后保存
    saveTimerRef.current = setTimeout(async () => {
      const draftData: DraftData = {
        transactions: toDraftTransactions(rows),
        operatorId: defaultOperatorId,
        ...(draftSource === 'ai' && {
          aiSpecific: {
            accountingDate: accountingDate.format('YYYY-MM-DD'),
            imagePaths: imagePaths ?? []
          }
        }),
        ...(draftSource === 'mcp' && mcpSource && {
          mcpSpecific: { source: mcpSource }
        })
      }
      
      await draftStore.saveDraft({
        id: 'current',
        source: draftSource,
        data: draftData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    }, 5000)  // 增加到 5 秒，减少保存频率
  }, [rows, defaultOperatorId, accountingDate, imagePaths, mcpSource, draftSource, draftStore, toDraftTransactions])

  // 即时保存草稿（关键操作）
  const saveDraftImmediate = useCallback(async () => {
    // 清除防抖 timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    
    const draftData: DraftData = {
      transactions: toDraftTransactions(rows),
      operatorId: defaultOperatorId,
      ...(draftSource === 'ai' && {
        aiSpecific: {
          accountingDate: accountingDate.format('YYYY-MM-DD'),
          imagePaths: imagePaths ?? []
        }
      }),
      ...(draftSource === 'mcp' && mcpSource && {
        mcpSpecific: { source: mcpSource }
      })
    }
    
    await draftStore.saveDraft({
      id: 'current',
      source: draftSource,
      data: draftData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
  }, [rows, defaultOperatorId, accountingDate, imagePaths, mcpSource, draftSource, draftStore, toDraftTransactions])

  // 清理草稿
  const clearDraft = useCallback(async () => {
    // 清除防抖 timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    console.log('[ImportConfirm] Clearing draft...')
    await draftStore.deleteDraft()
    console.log('[ImportConfirm] Draft cleared')
  }, [draftStore])

  // 组件卸载时清理 timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
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
    // 防抖保存（5秒）
    saveDraft()
  }, [saveDraft])

  // 删除行
  const deleteRow = useCallback((key: string) => {
    setRows((prev) => prev.filter((row) => row.key !== key))
    // 即时保存
    saveDraftImmediate()
  }, [saveDraftImmediate])

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
    // 即时保存
    saveDraftImmediate()
  }, [defaultOperatorId, saveDraftImmediate])

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
    // 即时保存
    saveDraftImmediate()
  }, [defaultOperatorId, saveDraftImmediate])

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

    setSubmitting(true)
    try {
      await onConfirm(rows, accountingDate)
      // 导入成功后删除草稿
      console.log('[ImportConfirm] Import successful, clearing draft...')
      await clearDraft()
      console.log('[ImportConfirm] Draft cleared after import')
      message.success(t('import:messages.importSuccess', { count: rows.length }))
      navigate('/')
    } catch (err) {
      console.error('[ImportConfirm] Import failed:', err)
      message.error(err instanceof Error ? err.message : t('import:messages.importFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  // 取消/返回
  const handleCancel = async () => {
    // 离开前立即保存草稿
    await saveDraftImmediate()
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
        <Input
          size="small"
          value={desc}
          onChange={(e) => updateRow(record.key, 'description', e.target.value)}
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
              onChange={(date) => {
                if (date) {
                  setAccountingDate(date)
                  // 切换记账日期即时保存
                  saveDraftImmediate()
                }
              }}
              allowClear={false}
            />
            <Text>{t('import:info.operator')}</Text>
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
                // 切换操作人即时保存
                saveDraftImmediate()
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
        virtual
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
