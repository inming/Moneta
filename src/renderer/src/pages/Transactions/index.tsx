import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Table, Button, Select, DatePicker, InputNumber, Input, Space,
  Typography, message, Popconfirm, Tag, Alert, Modal, Checkbox
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, EditOutlined, SaveOutlined, CloseOutlined, SearchOutlined,
  FileTextOutlined, ExclamationCircleOutlined, ArrowLeftOutlined
} from '@ant-design/icons'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import dayjs, { Dayjs } from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useTranslation } from 'react-i18next'

dayjs.extend(relativeTime)
import type { FilterValue, SorterResult } from 'antd/es/table/interface'
import type {
  Transaction, TransactionType, Category, Operator,
  PaginatedResult, CreateTransactionDTO, UpdateTransactionDTO,
  TransactionListParams
} from '@shared/types'
import { TRANSACTION_TYPE_CONFIG } from '@shared/constants/transaction-type'
import { useDraftStore } from '../../stores/draft.store'

const { Text } = Typography
const { RangePicker } = DatePicker

interface NewRow {
  date: string
  type: TransactionType
  amount: number
  category_id: number | null
  description: string
  operator_id: number | null
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : value
}

export default function Transactions(): React.JSX.Element {
  const { t } = useTranslation(['transactions', 'common'])
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const draftStore = useDraftStore()

  // Date range presets
  const rangePresets = [
    { label: t('transactions:rangePresets.all'), value: null as [Dayjs, Dayjs] | null },
    { label: t('transactions:rangePresets.thisMonth'), value: [dayjs().startOf('month'), dayjs().endOf('month')] as [Dayjs, Dayjs] },
    { label: t('transactions:rangePresets.lastMonth'), value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] as [Dayjs, Dayjs] },
    { label: t('transactions:rangePresets.thisQuarter'), value: [dayjs().startOf('quarter'), dayjs().endOf('quarter')] as [Dayjs, Dayjs] },
    { label: t('transactions:rangePresets.thisYear'), value: [dayjs().startOf('year'), dayjs().endOf('year')] as [Dayjs, Dayjs] }
  ]

  const typeOptions = Object.keys(TRANSACTION_TYPE_CONFIG).map((key) => ({
    label: t(`common:transactionTypes.${key}` as const),
    value: key
  }))

  const [transactions, setTransactions] = useState<PaginatedResult<Transaction>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 50
  })
  const [categories, setCategories] = useState<Category[]>([])
  const [operators, setOperators] = useState<Operator[]>([])
  const [loading, setLoading] = useState(false)
  const [draftModalOpen, setDraftModalOpen] = useState(false)

  // Back-to-statistics: parse parameters and navigation handler
  const fromStats = searchParams.get('from') === 'statistics'
  const statsYear = searchParams.get('year')
  const statsTab = searchParams.get('tab')
  const statsType = searchParams.get('statsType')
  const statsSoloCategory = searchParams.get('soloCategory')

  const handleBackToStats = (): void => {
    const params = new URLSearchParams()
    if (statsYear) params.set('year', statsYear)
    if (statsTab) params.set('tab', statsTab)
    if (statsType) params.set('type', statsType)
    if (statsSoloCategory) params.set('soloCategory', statsSoloCategory)

    const queryString = params.toString()
    navigate(queryString ? `/statistics?${queryString}` : '/statistics', { replace: true })
  }

  // Editing state
  const [editingKey, setEditingKey] = useState<number | null>(null)
  const [editingRow, setEditingRow] = useState<Partial<Transaction>>({})

  // New row state
  const [newRow, setNewRow] = useState<NewRow | null>(null)
  const [lastInputDate, setLastInputDate] = useState(dayjs().format('YYYY-MM-DD'))

  // Batch selection
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([])

  // Server-side query params (sort + filter) — default: date descending
  const [queryParams, setQueryParams] = useState<TransactionListParams>({
    sortField: 'date',
    sortOrder: 'descend'
  })

  // Keyword search for description
  const [keyword, setKeyword] = useState('')

  // Date range filter
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const dateRangeDebounceRef = useRef<NodeJS.Timeout | null>(null)

  const categoryMap = new Map(categories.map((c) => [c.id, c]))
  const operatorMap = new Map(operators.map((o) => [o.id, o.name]))

  const getCategoriesForType = (type: TransactionType): Category[] => {
    return categories.filter((c) => c.type === type)
  }

  const loadTransactions = useCallback(async (page: number, pageSize: number, params?: TransactionListParams) => {
    setLoading(true)
    try {
      const result = await window.api.transaction.list({ page, pageSize, ...params })
      setTransactions(result)
    } finally {
      setLoading(false)
    }
  }, [])

  // Parse URL search params on mount
  useEffect(() => {
    const params: TransactionListParams = {
      sortField: 'date',
      sortOrder: 'descend'
    }

    // Parse date range
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    if (dateFrom && dateTo) {
      const startDate = dayjs(dateFrom)
      const endDate = dayjs(dateTo)
      if (startDate.isValid() && endDate.isValid()) {
        params.dateFrom = dateFrom
        params.dateTo = dateTo
        setDateRange([startDate, endDate])
      }
    }

    // Parse type filter
    const typeParam = searchParams.get('type')
    if (typeParam && ['expense', 'income', 'investment'].includes(typeParam)) {
      params.type = typeParam as TransactionType
    }

    // Parse category filter
    const categoryId = searchParams.get('category_id')
    if (categoryId) {
      const catId = parseInt(categoryId, 10)
      if (!isNaN(catId)) {
        params.category_id = catId
      }
    }

    // Parse keyword
    const keywordParam = searchParams.get('keyword')
    if (keywordParam) {
      params.keyword = keywordParam
      setKeyword(keywordParam)
    }

    setQueryParams(params)

    Promise.all([
      window.api.transaction.list({ page: 1, pageSize: 50, ...params }),
      window.api.category.list(),
      window.api.operator.list(),
      draftStore.initialize()
    ]).then(([txResult, cats, ops]) => {
      setTransactions(txResult)
      setCategories(cats)
      setOperators(ops)
    })

    // Cleanup debounce timer on unmount
    return () => {
      if (dateRangeDebounceRef.current) {
        clearTimeout(dateRangeDebounceRef.current)
      }
    }
  }, [])

  const reload = (): void => {
    const { page, pageSize, total } = transactions
    // Clamp page if all items on current page were deleted
    const maxPage = Math.max(1, Math.ceil((total - 1) / pageSize))
    const safePage = Math.min(page, maxPage)
    loadTransactions(safePage, pageSize, queryParams)
    setEditingKey(null)
    setEditingRow({})
    setNewRow(null)
    setSelectedRowKeys([])
  }

  const handleTableChange = (
    pagination: TablePaginationConfig,
    filters: Record<string, FilterValue | null>,
    sorter: SorterResult<Transaction> | SorterResult<Transaction>[]
  ): void => {
    // Handle editing guard
    if (editingKey !== null || newRow !== null) {
      message.warning(t('transactions:messages.saveEditFirst'))
      return
    }

    // Build server-side params from filters and sorter
    const params: TransactionListParams = {}

    // Filters
    const typeFilter = filters.type as string[] | null
    if (typeFilter && typeFilter.length > 0) {
      params.types = typeFilter as TransactionType[]
    }
    const categoryFilter = filters.category_id as number[] | null
    if (categoryFilter && categoryFilter.length > 0) {
      params.category_ids = categoryFilter
    }
    const operatorFilter = filters.operator_id as number[] | null
    if (operatorFilter && operatorFilter.length > 0) {
      params.operator_ids = operatorFilter
    }

    // Sorter (single column only)
    const singleSorter = Array.isArray(sorter) ? sorter[0] : sorter
    if (singleSorter?.order && singleSorter?.field) {
      const field = singleSorter.field as string
      if (field === 'date' || field === 'amount' || field === 'created_at') {
        params.sortField = field
        params.sortOrder = singleSorter.order
      }
    }

    // Preserve keyword search
    if (keyword.trim()) {
      params.keyword = keyword.trim()
    }

    // Preserve date range
    if (dateRange && dateRange[0] && dateRange[1]) {
      params.dateFrom = dateRange[0].format('YYYY-MM-DD')
      params.dateTo = dateRange[1].format('YYYY-MM-DD')
    }

    setQueryParams(params)
    loadTransactions(pagination.current ?? 1, pagination.pageSize ?? 50, params)
  }

  const handleKeywordSearch = (value: string): void => {
    if (editingKey !== null || newRow !== null) {
      message.warning(t('transactions:messages.saveEditFirst'))
      return
    }
    setKeyword(value)
    const params: TransactionListParams = { ...queryParams, keyword: value.trim() || undefined }
    // Preserve date range in params
    if (dateRange && dateRange[0] && dateRange[1]) {
      params.dateFrom = dateRange[0].format('YYYY-MM-DD')
      params.dateTo = dateRange[1].format('YYYY-MM-DD')
    }
    setQueryParams(params)
    loadTransactions(1, transactions.pageSize, params)
  }

  // Handle date range change with debounce
  const handleDateRangeChange = (dates: [Dayjs | null, Dayjs | null] | null): void => {
    if (editingKey !== null || newRow !== null) {
      message.warning(t('transactions:messages.saveEditFirst'))
      return
    }
    setDateRange(dates)

    // Clear previous debounce timer
    if (dateRangeDebounceRef.current) {
      clearTimeout(dateRangeDebounceRef.current)
    }

    // Debounce the query to avoid frequent requests
    dateRangeDebounceRef.current = setTimeout(() => {
      const params: TransactionListParams = { ...queryParams }
      if (dates && dates[0] && dates[1]) {
        params.dateFrom = dates[0].format('YYYY-MM-DD')
        params.dateTo = dates[1].format('YYYY-MM-DD')
      } else {
        delete params.dateFrom
        delete params.dateTo
      }
      setQueryParams(params)
      loadTransactions(1, transactions.pageSize, params)
    }, 300)
  }

  // --- Edit existing row ---
  const startEdit = (record: Transaction): void => {
    if (newRow !== null) {
      message.warning(t('transactions:messages.saveNewFirst'))
      return
    }
    setEditingKey(record.id)
    setEditingRow({ ...record })
  }

  const cancelEdit = (): void => {
    setEditingKey(null)
    setEditingRow({})
  }

  const updateEditField = (field: keyof Transaction, value: unknown): void => {
    setEditingRow((prev) => {
      if (field === 'type') {
        const newType = value as TransactionType
        const currentCategoryId = prev.category_id
        const validCategories = getCategoriesForType(newType)
        const categoryValid = validCategories.some((c) => c.id === currentCategoryId)
        return { ...prev, type: newType, category_id: categoryValid ? currentCategoryId : undefined }
      }
      return { ...prev, [field]: value }
    })
  }

  const saveEdit = async (): Promise<void> => {
    if (editingKey === null) return

    const original = transactions.items.find((t) => t.id === editingKey)
    if (!original) return

    // Validate required fields
    if (!editingRow.date || !editingRow.type || !editingRow.amount || !editingRow.category_id) {
      message.error(t('transactions:messages.requiredFields'))
      return
    }
    if (editingRow.amount === 0) {
      message.error(t('transactions:messages.amountNotZero'))
      return
    }

    // Build changed fields
    const dto: UpdateTransactionDTO = {}
    if (editingRow.date !== original.date) dto.date = editingRow.date
    if (editingRow.type !== original.type) dto.type = editingRow.type
    if (editingRow.amount !== original.amount) dto.amount = editingRow.amount
    if (editingRow.category_id !== original.category_id) dto.category_id = editingRow.category_id
    if (editingRow.description !== original.description) dto.description = editingRow.description ?? ''
    if (editingRow.operator_id !== original.operator_id) dto.operator_id = editingRow.operator_id ?? null
    if (editingRow.is_occasional !== original.is_occasional) dto.is_occasional = editingRow.is_occasional ?? false

    if (Object.keys(dto).length === 0) {
      cancelEdit()
      return
    }

    try {
      await window.api.transaction.update(editingKey, dto)
      message.success(t('transactions:messages.saveSuccess'))
      reload()
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('transactions:messages.saveFailed'))
    }
  }

  // --- New row ---
  const startNewRow = (): void => {
    if (editingKey !== null) {
      message.warning(t('transactions:messages.saveEditFirst'))
      return
    }
    setNewRow({
      date: lastInputDate,
      type: 'expense',
      amount: 0,
      category_id: null,
      description: '',
      operator_id: null
    })
  }

  const cancelNewRow = (): void => {
    setNewRow(null)
  }

  const updateNewField = (field: keyof NewRow, value: unknown): void => {
    setNewRow((prev) => {
      if (!prev) return prev
      if (field === 'type') {
        const newType = value as TransactionType
        const validCategories = getCategoriesForType(newType)
        const categoryValid = validCategories.some((c) => c.id === prev.category_id)
        return { ...prev, type: newType, category_id: categoryValid ? prev.category_id : null }
      }
      return { ...prev, [field]: value }
    })
  }

  const saveNewRow = async (): Promise<void> => {
    if (!newRow) return

    if (!newRow.date || !newRow.type || !newRow.amount || !newRow.category_id) {
      message.error(t('transactions:messages.requiredFields'))
      return
    }
    if (newRow.amount === 0) {
      message.error(t('transactions:messages.amountNotZero'))
      return
    }

    const dto: CreateTransactionDTO = {
      date: newRow.date,
      type: newRow.type,
      amount: newRow.amount,
      category_id: newRow.category_id,
      description: newRow.description || '',
      operator_id: newRow.operator_id
    }

    try {
      await window.api.transaction.create(dto)
      message.success(t('transactions:messages.createSuccess'))
      setLastInputDate(newRow.date)
      setNewRow(null)
      loadTransactions(1, transactions.pageSize, queryParams)
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('transactions:messages.createFailed'))
    }
  }

  // --- Delete ---
  const handleDelete = async (id: number): Promise<void> => {
    try {
      await window.api.transaction.delete(id)
      message.success(t('transactions:messages.deleteSuccess'))
      reload()
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('transactions:messages.deleteFailed'))
    }
  }

  const handleBatchDelete = async (): Promise<void> => {
    if (selectedRowKeys.length === 0) return

    try {
      await window.api.transaction.batchDelete(selectedRowKeys)
      message.success(t('transactions:messages.batchDeleteSuccess', { count: selectedRowKeys.length }))
      reload()
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('transactions:messages.batchDeleteFailed'))
    }
  }

  // --- Render helpers for editable cells ---
  const renderCell = (
    field: keyof Transaction,
    value: unknown,
    record: Transaction
  ): React.ReactNode => {
    const isEditing = record.id === editingKey

    switch (field) {
      case 'date':
        if (isEditing) {
          return (
            <DatePicker
              size="small"
              value={editingRow.date ? dayjs(editingRow.date) : null}
              onChange={(d) => updateEditField('date', d?.format('YYYY-MM-DD') ?? '')}
              allowClear={false}
              style={{ width: '100%' }}
              status={!editingRow.date ? 'error' : undefined}
            />
          )
        }
        return value as string

      case 'created_at':
        return formatDateTime(value as string | null | undefined)

      case 'type':
        if (isEditing) {
          return (
            <Select
              size="small"
              value={editingRow.type}
              options={typeOptions}
              style={{ width: '100%' }}
              onChange={(val) => updateEditField('type', val)}
            />
          )
        }
        return (
          <Tag color={TRANSACTION_TYPE_CONFIG[value as TransactionType].color}>
            {t(`common:transactionTypes.${value}` as const)}
          </Tag>
        )

      case 'amount':
        if (isEditing) {
          return (
            <InputNumber
              size="small"
              value={editingRow.amount}
              precision={2}
              style={{ width: '100%' }}
              status={editingRow.amount == null || editingRow.amount === 0 ? 'error' : undefined}
              onChange={(val) => updateEditField('amount', val ?? 0)}
            />
          )
        }
        {
          const num = value as number
          const formatted = num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          return num < 0 ? <span style={{ color: '#f5222d' }}>{formatted}</span> : formatted
        }

      case 'category_id':
        if (isEditing) {
          const type = editingRow.type ?? record.type
          return (
            <Select
              size="small"
              value={editingRow.category_id ?? undefined}
              placeholder={t('transactions:placeholders.selectCategory')}
              style={{ width: '100%' }}
              status={!editingRow.category_id ? 'error' : undefined}
              options={getCategoriesForType(type).map((c) => ({
                label: c.name,
                value: c.id
              }))}
              onChange={(val) => updateEditField('category_id', val)}
            />
          )
        }
        return categoryMap.get(value as number)?.name ?? '-'

      case 'description':
        if (isEditing) {
          return (
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Input
                size="small"
                value={editingRow.description ?? ''}
                onChange={(e) => updateEditField('description', e.target.value)}
              />
              <Checkbox
                checked={editingRow.is_occasional ?? false}
                onChange={(e) => updateEditField('is_occasional', e.target.checked)}
              >
                <span style={{ fontSize: 12 }}>{t('transactions:fields.occasional')}</span>
              </Checkbox>
            </Space>
          )
        }
        return (
          <Space size={4}>
            <span>{(value as string) || '-'}</span>
            {!!record.is_occasional && (
              <Tag color="orange" style={{ fontSize: 11, lineHeight: '18px', padding: '0 4px' }}>
                {t('transactions:fields.occasional')}
              </Tag>
            )}
          </Space>
        )

      case 'operator_id':
        if (isEditing) {
          return (
            <Select
              size="small"
              value={editingRow.operator_id ?? undefined}
              allowClear
              placeholder={t('transactions:placeholders.optional')}
              style={{ width: '100%' }}
              options={operators.map((o) => ({ label: o.name, value: o.id }))}
              onChange={(val) => updateEditField('operator_id', val ?? null)}
            />
          )
        }
        return value ? operatorMap.get(value as number) ?? '-' : '-'

      default:
        return String(value ?? '')
    }
  }

  // --- New row rendering ---
  const renderNewRowCell = (field: keyof NewRow): React.ReactNode => {
    if (!newRow) return null

    switch (field) {
      case 'date':
        return (
          <DatePicker
            size="small"
            value={newRow.date ? dayjs(newRow.date) : null}
            onChange={(d) => {
              const dateStr = d?.format('YYYY-MM-DD') ?? ''
              updateNewField('date', dateStr)
            }}
            allowClear={false}
            style={{ width: '100%' }}
            status={!newRow.date ? 'error' : undefined}
          />
        )
      case 'type':
        return (
          <Select
            size="small"
            value={newRow.type}
            options={typeOptions}
            style={{ width: '100%' }}
            onChange={(val) => updateNewField('type', val)}
          />
        )
      case 'amount':
        return (
          <InputNumber
            size="small"
            value={newRow.amount || undefined}
            precision={2}
            placeholder={t('transactions:placeholders.amount')}
            style={{ width: '100%' }}
            status={newRow.amount == null || newRow.amount === 0 ? 'error' : undefined}
            onChange={(val) => updateNewField('amount', val ?? 0)}
          />
        )
      case 'category_id':
        return (
          <Select
            size="small"
            value={newRow.category_id ?? undefined}
            placeholder="请选择分类"
            style={{ width: '100%' }}
            status={!newRow.category_id ? 'error' : undefined}
            options={getCategoriesForType(newRow.type).map((c) => ({
              label: c.name,
              value: c.id
            }))}
            onChange={(val) => updateNewField('category_id', val)}
          />
        )
      case 'description':
        return (
          <Input
            size="small"
            value={newRow.description}
            placeholder={t('transactions:placeholders.description')}
            onChange={(e) => updateNewField('description', e.target.value)}
          />
        )
      case 'operator_id':
        return (
          <Select
            size="small"
            value={newRow.operator_id ?? undefined}
            allowClear
            placeholder="可选"
            style={{ width: '100%' }}
            options={operators.map((o) => ({ label: o.name, value: o.id }))}
            onChange={(val) => updateNewField('operator_id', val ?? null)}
          />
        )
    }
  }

  // Get filtered values from URL params for table filter display
  const getTypeFilteredValue = (): string[] | undefined => {
    const typeParam = searchParams.get('type')
    return typeParam ? [typeParam] : undefined
  }

  const getCategoryFilteredValue = (): number[] | undefined => {
    const categoryId = searchParams.get('category_id')
    return categoryId ? [parseInt(categoryId, 10)] : undefined
  }

  const columns: ColumnsType<Transaction> = [
    {
      title: t('transactions:columns.date'),
      dataIndex: 'date',
      width: 130,
      sorter: true,
      defaultSortOrder: 'descend',
      render: (val: string, record) => renderCell('date', val, record)
    },
    {
      title: t('transactions:columns.type'),
      dataIndex: 'type',
      width: 100,
      filters: typeOptions.map((o) => ({ text: o.label, value: o.value })),
      filteredValue: getTypeFilteredValue(),
      render: (val: TransactionType, record) => renderCell('type', val, record)
    },
    {
      title: t('transactions:columns.amount'),
      dataIndex: 'amount',
      width: 110,
      align: 'right',
      sorter: true,
      render: (val: number, record) => renderCell('amount', val, record)
    },
    {
      title: t('transactions:columns.category'),
      dataIndex: 'category_id',
      width: 130,
      filters: categories.map((c) => ({ text: c.name, value: c.id })),
      filteredValue: getCategoryFilteredValue(),
      render: (val: number, record) => renderCell('category_id', val, record)
    },
    {
      title: t('transactions:columns.description'),
      dataIndex: 'description',
      ellipsis: true,
      render: (val: string, record) => renderCell('description', val, record)
    },
    {
      title: t('transactions:columns.operator'),
      dataIndex: 'operator_id',
      width: 110,
      filters: operators.map((o) => ({ text: o.name, value: o.id })),
      render: (val: number | null, record) => renderCell('operator_id', val, record)
    },
    {
      title: t('transactions:columns.createdAt'),
      dataIndex: 'created_at',
      width: 180,
      sorter: true,
      render: (val: string, record) => renderCell('created_at', val, record)
    },
    {
      title: t('transactions:columns.actions'),
      key: 'actions',
      width: 100,
      render: (_, record) => {
        if (record.id === editingKey) {
          return (
            <Space size={4}>
              <Button size="small" type="link" icon={<SaveOutlined />} onClick={saveEdit} />
              <Button size="small" type="link" icon={<CloseOutlined />} onClick={cancelEdit} />
            </Space>
          )
        }
        return (
          <Space size={4}>
            <Button
              size="small"
              type="link"
              icon={<EditOutlined />}
              onClick={() => startEdit(record)}
              disabled={editingKey !== null || newRow !== null}
            />
            <Popconfirm
              title={t('transactions:confirmations.deleteOne')}
              onConfirm={() => handleDelete(record.id)}
              okText={t('common:buttons.confirm')}
              cancelText={t('common:buttons.cancel')}
            >
              <Button
                size="small"
                type="link"
                danger
                icon={<DeleteOutlined />}
                disabled={editingKey !== null || newRow !== null}
              />
            </Popconfirm>
          </Space>
        )
      }
    }
  ]

  // Data source from server
  const dataItems = transactions.items

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        {fromStats && (
          <Button
            type="link"
            icon={<ArrowLeftOutlined />}
            onClick={handleBackToStats}
            style={{ padding: 0, marginRight: 8 }}
          >
            {t('transactions:buttons.backToStatistics')}
          </Button>
        )}
        <Text strong style={{ fontSize: 18, userSelect: 'none' }}>
          {t('transactions:title')}
        </Text>
      </div>

      {/* Draft Alert */}
      {draftStore.summary.exists && (
        <Alert
          message={
            <Space>
              <FileTextOutlined />
              <span>
                {t('transactions:draft.alertTitle', {
                  count: draftStore.summary.count,
                  missingCategory: draftStore.summary.missingCategoryCount > 0
                    ? t('transactions:draft.missingCategory', { count: draftStore.summary.missingCategoryCount })
                    : ''
                })}
              </span>
              <Tag color="purple">
                {t('transactions:draft.sourceMCP')}
              </Tag>
              {draftStore.summary.updatedAt && (
                <span style={{ color: '#888', fontSize: 12 }}>
                  {t('transactions:draft.lastEdited', { time: dayjs(draftStore.summary.updatedAt).fromNow() })}
                </span>
              )}
            </Space>
          }
          type="warning"
          showIcon={false}
          style={{
            marginBottom: 12,
            borderLeft: '4px solid var(--warning-color)'
          }}
          action={
            <Space>
              <Button
                size="small"
                type="primary"
                onClick={() => setDraftModalOpen(true)}
              >
                {t('transactions:buttons.continueImport')}
              </Button>
              <Button
                size="small"
                onClick={() => {
                  Modal.confirm({
                    title: t('common:buttons.discard'),
                    icon: <ExclamationCircleOutlined />,
                    content: t('transactions:confirmations.discardDraft'),
                    okText: t('transactions:confirmations.discardDraftOk'),
                    okType: 'danger',
                    cancelText: t('common:buttons.cancel'),
                    onOk: async () => {
                      await draftStore.deleteDraft()
                      message.success(t('transactions:messages.draftDiscarded'))
                    }
                  })
                }}
              >
                {t('transactions:buttons.discard')}
              </Button>
            </Space>
          }
        />
      )}

      {/* Draft Continue Modal */}
      <Modal
        title={t('transactions:draft.modalTitle')}
        open={draftModalOpen}
        onCancel={() => setDraftModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setDraftModalOpen(false)}>
            {t('common:buttons.cancel')}
          </Button>,
          <Button
            key="continue"
            type="primary"
            onClick={async () => {
              setDraftModalOpen(false)
              const draft = await draftStore.getDraft()
              if (draft) {
                navigate('/mcp-import')
              }
            }}
          >
            {t('transactions:buttons.continueImport')}
          </Button>
        ]}
      >
        {draftStore.summary.exists ? (
          <div>
            <p>
              <strong>{t('transactions:draft.source')}</strong>
              {t('transactions:draft.sourceMCPLabel')}
            </p>
            <p>
              <strong>{t('transactions:draft.count')}</strong>
              {t('transactions:draft.countValue', { count: draftStore.summary.count })}
            </p>
            {draftStore.summary.missingCategoryCount > 0 && (
              <p style={{ color: '#ff4d4f' }}>
                <strong>{t('transactions:draft.missingCategoryLabel')}</strong>
                {t('transactions:draft.missingCategoryValue', { count: draftStore.summary.missingCategoryCount })}
              </p>
            )}
            {draftStore.summary.updatedAt && (
              <p>
                <strong>{t('transactions:draft.lastEditedLabel')}</strong>
                {dayjs(draftStore.summary.updatedAt).format('YYYY-MM-DD HH:mm:ss')}
              </p>
            )}
          </div>
        ) : (
          <p>{t('transactions:draft.draftNotFound')}</p>
        )}
      </Modal>

      {/* Toolbar */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={startNewRow}
            disabled={newRow !== null || editingKey !== null}
          >
            {t('transactions:buttons.manualEntry')}
          </Button>
          {selectedRowKeys.length > 0 && (
            <Popconfirm
              title={t('transactions:confirmations.deleteBatch', { count: selectedRowKeys.length })}
              onConfirm={handleBatchDelete}
              okText={t('common:buttons.confirm')}
              cancelText={t('common:buttons.cancel')}
            >
              <Button danger icon={<DeleteOutlined />}>
                {t('transactions:buttons.batchDelete')} ({selectedRowKeys.length})
              </Button>
            </Popconfirm>
          )}
        </Space>
        <Space>
          <RangePicker
            size="small"
            value={dateRange}
            onChange={(dates) => handleDateRangeChange(dates as [Dayjs | null, Dayjs | null] | null)}
            presets={rangePresets}
            format="YYYY-MM-DD"
            placeholder={[t('transactions:placeholders.dateRangeStart'), t('transactions:placeholders.dateRangeEnd')]}
            disabled={editingKey !== null || newRow !== null}
            style={{ width: 240 }}
          />
          <Input.Search
            placeholder={t('transactions:placeholders.searchDescription')}
            allowClear
            size="small"
            prefix={<SearchOutlined />}
            style={{ width: 200 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={handleKeywordSearch}
          />
          <Text type="secondary">{t('transactions:pagination.total', { total: transactions.total })}</Text>
        </Space>
      </div>

      {/* New row form */}
      {newRow && (
        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: '8px 12px',
          marginBottom: 8,
          background: 'var(--table-summary-bg)',
          borderRadius: 6,
          border: '1px solid var(--border-color)'
        }}>
          <div style={{ width: 130 }}>{renderNewRowCell('date')}</div>
          <div style={{ width: 100 }}>{renderNewRowCell('type')}</div>
          <div style={{ width: 110 }}>{renderNewRowCell('amount')}</div>
          <div style={{ width: 130 }}>{renderNewRowCell('category_id')}</div>
          <div style={{ flex: 1 }}>{renderNewRowCell('description')}</div>
          <div style={{ width: 110 }}>{renderNewRowCell('operator_id')}</div>
          <Space size={4}>
            <Button size="small" type="link" icon={<SaveOutlined />} onClick={saveNewRow} />
            <Button size="small" type="link" icon={<CloseOutlined />} onClick={cancelNewRow} />
          </Space>
        </div>
      )}

      <Table<Transaction>
        columns={columns}
        dataSource={dataItems}
        rowKey="id"
        size="small"
        loading={loading}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as number[]),
          getCheckboxProps: () => ({
            disabled: editingKey !== null || newRow !== null
          })
        }}
        pagination={{
          current: transactions.page,
          pageSize: transactions.pageSize,
          total: transactions.total,
          showTotal: (total) => t('transactions:pagination.showTotal', { total }),
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100']
        }}
        onChange={(pagination, filters, sorter) =>
          handleTableChange(pagination, filters, sorter)
        }
        rowClassName={(record) => `row-type-${record.type}`}
      />

      <style>{`
        .row-type-expense > td {
          background-color: var(--row-expense-bg, #fff7e6) !important;
        }
        .row-type-expense:hover > td {
          background-color: var(--row-expense-hover, #fff1d6) !important;
        }
        .row-type-income > td {
          background-color: var(--row-income-bg, #f6ffed) !important;
        }
        .row-type-income:hover > td {
          background-color: var(--row-income-hover, #eeffdd) !important;
        }
        .row-type-investment > td {
          background-color: var(--row-investment-bg, #e6f4ff) !important;
        }
        .row-type-investment:hover > td {
          background-color: var(--row-investment-hover, #d6ebff) !important;
        }
      `}</style>
    </div>
  )
}
