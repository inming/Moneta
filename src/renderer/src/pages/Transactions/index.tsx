import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, Select, DatePicker, InputNumber, Input, Space,
  Typography, message, Popconfirm, Tag
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, EditOutlined, SaveOutlined, CloseOutlined, SearchOutlined,
  CameraOutlined
} from '@ant-design/icons'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import dayjs from 'dayjs'
import type { FilterValue, SorterResult } from 'antd/es/table/interface'
import type {
  Transaction, TransactionType, Category, Operator,
  PaginatedResult, CreateTransactionDTO, UpdateTransactionDTO,
  TransactionListParams
} from '@shared/types'
import { TRANSACTION_TYPE_CONFIG } from '@shared/constants/transaction-type'

const { Text } = Typography

const typeOptions = Object.entries(TRANSACTION_TYPE_CONFIG).map(([value, config]) => ({
  label: config.label,
  value
}))

interface NewRow {
  date: string
  type: TransactionType
  amount: number
  category_id: number | null
  description: string
  operator_id: number | null
}

export default function Transactions(): React.JSX.Element {
  const navigate = useNavigate()
  const [transactions, setTransactions] = useState<PaginatedResult<Transaction>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 50
  })
  const [categories, setCategories] = useState<Category[]>([])
  const [operators, setOperators] = useState<Operator[]>([])
  const [loading, setLoading] = useState(false)

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

  useEffect(() => {
    Promise.all([
      window.api.transaction.list({ page: 1, pageSize: 50, sortField: 'date', sortOrder: 'descend' }),
      window.api.category.list(),
      window.api.operator.list()
    ]).then(([txResult, cats, ops]) => {
      setTransactions(txResult)
      setCategories(cats)
      setOperators(ops)
    })
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
      message.warning('请先保存或取消当前编辑')
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
      if (field === 'date' || field === 'amount') {
        params.sortField = field
        params.sortOrder = singleSorter.order
      }
    }

    // Preserve keyword search
    if (keyword.trim()) {
      params.keyword = keyword.trim()
    }

    setQueryParams(params)
    loadTransactions(pagination.current ?? 1, pagination.pageSize ?? 50, params)
  }

  const handleKeywordSearch = (value: string): void => {
    if (editingKey !== null || newRow !== null) {
      message.warning('请先保存或取消当前编辑')
      return
    }
    setKeyword(value)
    const params = { ...queryParams, keyword: value.trim() || undefined }
    setQueryParams(params)
    loadTransactions(1, transactions.pageSize, params)
  }

  // --- Edit existing row ---
  const startEdit = (record: Transaction): void => {
    if (newRow !== null) {
      message.warning('请先保存或取消新增行')
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
      message.error('请填写所有必填字段（日期、类型、金额、分类）')
      return
    }
    if (editingRow.amount === 0) {
      message.error('金额不能为 0')
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

    if (Object.keys(dto).length === 0) {
      cancelEdit()
      return
    }

    try {
      await window.api.transaction.update(editingKey, dto)
      message.success('保存成功')
      reload()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败')
    }
  }

  // --- New row ---
  const startNewRow = (): void => {
    if (editingKey !== null) {
      message.warning('请先保存或取消当前编辑')
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
      message.error('请填写所有必填字段（日期、类型、金额、分类）')
      return
    }
    if (newRow.amount === 0) {
      message.error('金额不能为 0')
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
      message.success('新增成功')
      setLastInputDate(newRow.date)
      setNewRow(null)
      loadTransactions(1, transactions.pageSize, queryParams)
    } catch (err) {
      message.error(err instanceof Error ? err.message : '新增失败')
    }
  }

  // --- Delete ---
  const handleDelete = async (id: number): Promise<void> => {
    try {
      await window.api.transaction.delete(id)
      message.success('删除成功')
      reload()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除失败')
    }
  }

  const handleBatchDelete = async (): Promise<void> => {
    if (selectedRowKeys.length === 0) return

    try {
      await window.api.transaction.batchDelete(selectedRowKeys)
      message.success(`成功删除 ${selectedRowKeys.length} 条记录`)
      reload()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '批量删除失败')
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
            {TRANSACTION_TYPE_CONFIG[value as TransactionType].label}
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
              placeholder="请选择分类"
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
            <Input
              size="small"
              value={editingRow.description ?? ''}
              onChange={(e) => updateEditField('description', e.target.value)}
            />
          )
        }
        return value as string || '-'

      case 'operator_id':
        if (isEditing) {
          return (
            <Select
              size="small"
              value={editingRow.operator_id ?? undefined}
              allowClear
              placeholder="可选"
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
            placeholder="金额"
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
            placeholder="描述"
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

  const columns: ColumnsType<Transaction> = [
    {
      title: '日期',
      dataIndex: 'date',
      width: 130,
      sorter: true,
      defaultSortOrder: 'descend',
      render: (val: string, record) => renderCell('date', val, record)
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 100,
      filters: typeOptions.map((o) => ({ text: o.label, value: o.value })),
      render: (val: TransactionType, record) => renderCell('type', val, record)
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 110,
      align: 'right',
      sorter: true,
      render: (val: number, record) => renderCell('amount', val, record)
    },
    {
      title: '分类',
      dataIndex: 'category_id',
      width: 130,
      filters: categories.map((c) => ({ text: c.name, value: c.id })),
      render: (val: number, record) => renderCell('category_id', val, record)
    },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
      render: (val: string, record) => renderCell('description', val, record)
    },
    {
      title: '操作人',
      dataIndex: 'operator_id',
      width: 110,
      filters: operators.map((o) => ({ text: o.name, value: o.id })),
      render: (val: number | null, record) => renderCell('operator_id', val, record)
    },
    {
      title: '操作',
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
              title="确认删除这条记录？"
              onConfirm={() => handleDelete(record.id)}
              okText="确认"
              cancelText="取消"
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
      <Text strong style={{ fontSize: 18, display: 'block', marginBottom: 16 }}>
        数据浏览
      </Text>

      {/* Toolbar */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={startNewRow}
            disabled={newRow !== null || editingKey !== null}
          >
            手工录入
          </Button>
          <Button
            icon={<CameraOutlined />}
            onClick={() => navigate('/ai-recognition')}
          >
            图片识别导入
          </Button>
          {selectedRowKeys.length > 0 && (
            <Popconfirm
              title={`确认删除选中的 ${selectedRowKeys.length} 条记录？`}
              onConfirm={handleBatchDelete}
              okText="确认"
              cancelText="取消"
            >
              <Button danger icon={<DeleteOutlined />}>
                批量删除 ({selectedRowKeys.length})
              </Button>
            </Popconfirm>
          )}
        </Space>
        <Space>
          <Input.Search
            placeholder="搜索描述"
            allowClear
            size="small"
            prefix={<SearchOutlined />}
            style={{ width: 200 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={handleKeywordSearch}
          />
          <Text type="secondary">共 {transactions.total} 条</Text>
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
          background: '#fafafa',
          borderRadius: 6,
          border: '1px solid #f0f0f0'
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
          showTotal: (total) => `共 ${total} 条`,
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
      `}</style>
    </div>
  )
}
