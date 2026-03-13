import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Upload, Button, Select, DatePicker, InputNumber, Input, Table, Space,
  Alert, Typography, message, Card, Drawer
} from 'antd'
import {
  CameraOutlined, DeleteOutlined, SendOutlined, CloseOutlined, FileTextOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type {
  AIProviderView, RecognitionResultRow, Category, Operator,
  TransactionType, CreateTransactionDTO
} from '@shared/types'
import { TRANSACTION_TYPE_CONFIG } from '@shared/constants/transaction-type'

const { Text, Title } = Typography
const { Dragger } = Upload

const typeOptions = Object.entries(TRANSACTION_TYPE_CONFIG).map(([value, config]) => ({
  label: config.label,
  value
}))

interface ImageItem {
  id: string
  dataUrl: string
  name: string
}

export default function AIRecognition(): React.JSX.Element {
  const [providers, setProviders] = useState<AIProviderView[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<string>('')
  const [images, setImages] = useState<ImageItem[]>([])
  const [results, setResults] = useState<RecognitionResultRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [operators, setOperators] = useState<Operator[]>([])
  const [accountingDate, setAccountingDate] = useState(dayjs())
  const [defaultOperatorId, setDefaultOperatorId] = useState<number | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [logsOpen, setLogsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const loadProviders = useCallback(async () => {
    const data = await window.api.aiProvider.list()
    setProviders(data)
    const defaultProvider = data.find((p) => p.isDefault)
    if (defaultProvider) {
      setSelectedProviderId(defaultProvider.id)
    } else {
      const configured = data.find((p) => p.apiKeyMasked)
      if (configured) setSelectedProviderId(configured.id)
    }
  }, [])

  const loadCategories = useCallback(async () => {
    const [expense, income, investment] = await Promise.all([
      window.api.category.list('expense'),
      window.api.category.list('income'),
      window.api.category.list('investment')
    ])
    setCategories([...expense, ...income, ...investment])
  }, [])

  const loadOperators = useCallback(async () => {
    const data = await window.api.operator.list()
    setOperators(data)
  }, [])

  useEffect(() => {
    loadProviders()
    loadCategories()
    loadOperators()
  }, [loadProviders, loadCategories, loadOperators])

  // Poll logs while Drawer is open or loading is active
  useEffect(() => {
    if (!logsOpen && !loading) return
    const poll = async (): Promise<void> => {
      try {
        const fetched = await window.api.ai.getLogs()
        setLogs(fetched)
      } catch {
        // ignore
      }
    }
    poll()
    const timer = setInterval(poll, 1000)
    return () => clearInterval(timer)
  }, [logsOpen, loading])

  // Auto-fill operator for all result rows when operator selection changes
  useEffect(() => {
    if (results && results.length > 0) {
      setResults((prev) =>
        prev ? prev.map((row) => ({ ...row, operator_id: defaultOperatorId })) : prev
      )
    }
  }, [defaultOperatorId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clipboard paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent): void => {
      const items = e.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            fileToDataUrl(file).then((dataUrl) => {
              setImages((prev) => [
                ...prev,
                { id: `paste-${Date.now()}`, dataUrl, name: `粘贴图片-${prev.length + 1}` }
              ])
            })
          }
        }
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [])

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleUpload = async (file: File): Promise<false> => {
    if (file.size > 10 * 1024 * 1024) {
      message.error('单张图片不能超过 10MB')
      return false
    }

    const totalSize = images.reduce((sum, img) => sum + img.dataUrl.length * 0.75, 0) + file.size
    if (totalSize > 20 * 1024 * 1024) {
      message.error('总图片大小不能超过 20MB')
      return false
    }

    const dataUrl = await fileToDataUrl(file)
    setImages((prev) => [
      ...prev,
      { id: `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`, dataUrl, name: file.name }
    ])
    return false
  }

  const removeImage = (id: string): void => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }

  const handleRecognize = async (): Promise<void> => {
    if (images.length === 0) {
      message.warning('请先上传图片')
      return
    }
    if (!selectedProviderId) {
      message.warning('请选择 AI 供应商')
      return
    }

    setLoading(true)
    setLogs([])
    try {
      const response = await window.api.ai.recognize({
        images: images.map((img) => img.dataUrl),
        providerId: selectedProviderId
      })

      // Set default operator for all rows
      const rowsWithDefaults = response.items.map((row) => ({
        ...row,
        operator_id: defaultOperatorId
      }))

      setResults(rowsWithDefaults)

      if (response.warnings.length > 0) {
        response.warnings.forEach((w) => message.warning(w))
      }
      if (response.items.length > 0) {
        message.success(`成功识别 ${response.items.length} 条交易记录`)
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'AI 识别失败')
    } finally {
      setLoading(false)
      // Final log fetch after recognition completes
      try {
        const fetchedLogs = await window.api.ai.getLogs()
        setLogs(fetchedLogs)
      } catch {
        // Ignore log fetch errors
      }
    }
  }

  const updateRow = (key: string, field: keyof RecognitionResultRow, value: unknown): void => {
    setResults((prev) => {
      if (!prev) return prev
      return prev.map((row) => {
        if (row.key !== key) return row

        // When type changes, reset category_id since categories are type-specific
        if (field === 'type') {
          return { ...row, [field]: value, category_id: null }
        }
        return { ...row, [field]: value }
      })
    })
  }

  const deleteRow = (key: string): void => {
    setResults((prev) => prev ? prev.filter((row) => row.key !== key) : prev)
  }

  const handleConfirm = async (): Promise<void> => {
    if (!results || results.length === 0) {
      message.warning('没有可提交的记录')
      return
    }

    const emptyCategories = results.filter((r) => r.category_id === null)
    if (emptyCategories.length > 0) {
      message.error(`还有 ${emptyCategories.length} 条交易未选择分类，请补充后再提交`)
      return
    }

    const dateStr = accountingDate.format('YYYY-MM-DD')

    const items: CreateTransactionDTO[] = results.map((row) => ({
      date: dateStr,
      type: row.type,
      amount: row.amount,
      category_id: row.category_id!,
      description: row.description || '',
      operator_id: row.operator_id
    }))

    try {
      const result = await window.api.transaction.batchCreate(items)
      message.success(`成功录入 ${(result as { count: number }).count} 条交易记录`)
      setResults(null)
      setImages([])
    } catch (err) {
      message.error(err instanceof Error ? err.message : '批量录入失败')
    }
  }

  const handleCancel = (): void => {
    setResults(null)
  }

  const configuredProviders = providers.filter((p) => p.apiKeyMasked)
  const hasNoProvider = configuredProviders.length === 0

  const unmatchedCount = results ? results.filter((r) => r.category_id === null).length : 0

  const getCategoriesForType = (type: TransactionType): Category[] => {
    return categories.filter((c) => c.type === type)
  }

  const columns: ColumnsType<RecognitionResultRow> = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
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
      key: 'amount',
      width: 120,
      render: (amount: number, record) => (
        <InputNumber
          size="small"
          value={amount}
          min={0.01}
          precision={2}
          style={{ width: '100%' }}
          onChange={(val) => updateRow(record.key, 'amount', val || 0)}
        />
      )
    },
    {
      title: '分类',
      dataIndex: 'category_id',
      key: 'category_id',
      width: 150,
      render: (categoryId: number | null, record) => (
        <Select
          size="small"
          value={categoryId}
          placeholder="请选择分类"
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
      key: 'description',
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
      key: 'operator_id',
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
      title: '',
      key: 'actions',
      width: 50,
      render: (_, record) => (
        <Button
          size="small"
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => deleteRow(record.key)}
        />
      )
    }
  ]

  return (
    <div ref={containerRef}>
      <Title level={4} style={{ marginBottom: 16 }}>AI 图片识别</Title>

      {hasNoProvider && (
        <Alert
          type="warning"
          message="未配置 AI 模型"
          description={
            <span>
              请先前往 <a onClick={() => window.location.hash = '#/settings?tab=ai-providers'}>设置 &gt; AI 模型</a> 配置 API Key
            </span>
          }
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {/* Control bar */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Text>记账日期：</Text>
          <DatePicker
            value={accountingDate}
            onChange={(date) => date && setAccountingDate(date)}
            allowClear={false}
          />
          {configuredProviders.length > 1 && (
            <>
              <Text>AI 模型：</Text>
              <Select
                value={selectedProviderId || undefined}
                placeholder="选择模型"
                style={{ width: 200 }}
                options={configuredProviders.map((p) => ({
                  label: `${p.name}${p.isDefault ? ' (默认)' : ''}`,
                  value: p.id
                }))}
                onChange={setSelectedProviderId}
              />
            </>
          )}
          <Text>操作人：</Text>
          <Select
            value={defaultOperatorId}
            allowClear
            placeholder="可选"
            style={{ width: 120 }}
            options={operators.map((o) => ({ label: o.name, value: o.id }))}
            onChange={(val) => setDefaultOperatorId(val ?? null)}
          />
        </Space>
      </Card>

      {/* Image upload area */}
      {!results && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Dragger
            accept=".jpg,.jpeg,.png,.webp,.bmp"
            multiple
            showUploadList={false}
            beforeUpload={handleUpload}
            style={{ marginBottom: images.length > 0 ? 12 : 0 }}
          >
            <p>
              <CameraOutlined style={{ fontSize: 32, color: '#999' }} />
            </p>
            <p>点击或拖拽图片到此处上传，也可以使用 Ctrl+V 粘贴截图</p>
            <p style={{ color: '#999', fontSize: 12 }}>
              支持 JPEG、PNG、WebP、BMP，单张不超过 10MB，总量不超过 20MB
            </p>
          </Dragger>

          {images.length > 0 && (
            <div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {images.map((img) => (
                  <div
                    key={img.id}
                    style={{
                      position: 'relative',
                      width: 100,
                      height: 100,
                      border: '1px solid #d9d9d9',
                      borderRadius: 4,
                      overflow: 'hidden'
                    }}
                  >
                    <img
                      src={img.dataUrl}
                      alt={img.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        background: 'rgba(255,255,255,0.8)',
                        borderRadius: '50%',
                        width: 20,
                        height: 20,
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      onClick={() => removeImage(img.id)}
                    />
                  </div>
                ))}
              </div>
              <Space>
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={loading}
                  onClick={handleRecognize}
                  disabled={hasNoProvider || images.length === 0}
                >
                  开始识别 ({images.length} 张图片)
                </Button>
                {(loading || logs.length > 0) && (
                  <a onClick={() => setLogsOpen(true)}>
                    <FileTextOutlined /> 查看日志
                  </a>
                )}
              </Space>
            </div>
          )}
        </Card>
      )}

      {/* Results table */}
      {results && (
        <Card size="small">
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Text strong>
                共识别 {results.length} 条
              </Text>
              {unmatchedCount > 0 && (
                <Text type="danger">
                  {unmatchedCount} 条待补充分类
                </Text>
              )}
            </Space>
            <Space>
              {logs.length > 0 && (
                <a onClick={() => setLogsOpen(true)}>
                  <FileTextOutlined /> 查看日志
                </a>
              )}
              <Button icon={<CloseOutlined />} onClick={handleCancel}>
                取消
              </Button>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleConfirm}
                disabled={results.length === 0}
              >
                确认录入
              </Button>
            </Space>
          </div>

          <Table
            columns={columns}
            dataSource={results}
            rowKey="key"
            pagination={false}
            size="small"
            rowClassName={(record) => {
              const typeClass = `row-type-${record.type}`
              const missingClass = record.category_id === null ? ' row-missing-category' : ''
              return `${typeClass}${missingClass}`
            }}
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
            .row-missing-category > td {
              background-color: #fff2f0 !important;
            }
            .row-missing-category:hover > td {
              background-color: #ffebe8 !important;
            }
          `}</style>
        </Card>
      )}

      <Drawer
        title="AI 识别日志"
        open={logsOpen}
        onClose={() => setLogsOpen(false)}
        width={520}
      >
        <pre style={{
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: 12,
          lineHeight: 1.8,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          margin: 0,
          padding: 12,
          background: '#fafafa',
          borderRadius: 6,
          border: '1px solid #f0f0f0'
        }}>
          {logs.join('\n') || '暂无日志'}
        </pre>
      </Drawer>
    </div>
  )
}
