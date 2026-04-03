import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Card, Alert, Descriptions, Modal, Spin, Space, Tag, Typography,
  message, Radio, DatePicker, Checkbox, Select, Input, Collapse
} from 'antd'
import {
  UploadOutlined, ImportOutlined, DeleteOutlined, WarningOutlined,
  DownloadOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { TransactionType, Category, Operator, TransactionListParams } from '@shared/types'
import { TRANSACTION_TYPE_CONFIG } from '@shared/constants/transaction-type'
import type { Dayjs } from 'dayjs'

const { Text } = Typography
const { RangePicker } = DatePicker

interface PreviewData {
  rowCount: number
  uniqueOperators: string[]
  uniqueCategories: { name: string; type: string }[]
  errors: string[]
}

interface ImportResultData {
  imported: number
  operatorsCreated: number
  categoriesCreated: number
}

type ExportFormat = 'xlsx' | 'csv'

export default function DataManager(): React.JSX.Element {
  const { t } = useTranslation(['settings', 'common'])
  const navigate = useNavigate()

  // ── 导入状态 ──
  const [filePath, setFilePath] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [importResult, setImportResult] = useState<ImportResultData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── 导出状态 ──
  const [exportFormat, setExportFormat] = useState<ExportFormat>('xlsx')
  const [exportDateRange, setExportDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [exportTypes, setExportTypes] = useState<TransactionType[]>([])
  const [exportCategoryIds, setExportCategoryIds] = useState<number[]>([])
  const [exportOperatorIds, setExportOperatorIds] = useState<number[]>([])
  const [exportKeyword, setExportKeyword] = useState('')
  const [exportCount, setExportCount] = useState<number | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [operators, setOperators] = useState<Operator[]>([])
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── 构建导出筛选参数 ──
  const buildExportParams = useCallback((): TransactionListParams => {
    const params: TransactionListParams = {}
    if (exportDateRange && exportDateRange[0]) {
      params.dateFrom = exportDateRange[0].format('YYYY-MM-DD')
    }
    if (exportDateRange && exportDateRange[1]) {
      params.dateTo = exportDateRange[1].format('YYYY-MM-DD')
    }
    if (exportTypes.length > 0) params.types = exportTypes
    if (exportCategoryIds.length > 0) params.category_ids = exportCategoryIds
    if (exportOperatorIds.length > 0) params.operator_ids = exportOperatorIds
    if (exportKeyword.trim()) params.keyword = exportKeyword.trim()
    return params
  }, [exportDateRange, exportTypes, exportCategoryIds, exportOperatorIds, exportKeyword])

  // ── 加载分类和操作人列表 ──
  useEffect(() => {
    const load = async (): Promise<void> => {
      const [cats, ops] = await Promise.all([
        window.api.category.listAll(),
        window.api.operator.list()
      ])
      setCategories(cats)
      setOperators(ops)
    }
    load()
  }, [])

  // ── 筛选条件变化时刷新 count（debounce 300ms）──
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(async () => {
      try {
        const count = await window.api.importExport.exportCount(buildExportParams())
        setExportCount(count)
      } catch {
        setExportCount(null)
      }
    }, 300)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [buildExportParams])

  // ── 导出 ──
  const handleExport = async (): Promise<void> => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const ext = exportFormat === 'csv' ? 'csv' : 'xlsx'
    const defaultName = `Moneta_Export_${today}.${ext}`
    const filters = exportFormat === 'csv'
      ? [{ name: 'CSV Files', extensions: ['csv'] }]
      : [{ name: 'Excel Files', extensions: ['xlsx'] }]

    const savePath = await window.api.dialog.saveFile(filters, defaultName)
    if (!savePath) return

    setExportLoading(true)
    try {
      const params = buildExportParams()
      const result = await window.api.importExport.executeExport({
        format: exportFormat,
        filePath: savePath,
        ...params
      })
      message.success(t('settings:dataManager.export.successMessage', { count: result.exported }))
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('settings:dataManager.export.failedMessage'))
    } finally {
      setExportLoading(false)
    }
  }

  // ── 导入 ──
  const handleSelectFile = async (): Promise<void> => {
    setError(null)
    setPreview(null)
    setImportResult(null)

    const selected = await window.api.dialog.openFile([
      { name: 'Excel Files', extensions: ['xlsx', 'xls'] }
    ])

    if (!selected) return
    setFilePath(selected)

    setLoading(true)
    try {
      const data = (await window.api.importExport.preview(selected)) as PreviewData
      setPreview(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleImport = (): void => {
    if (!filePath) return

    Modal.confirm({
      title: t('settings:dataManager.import.confirmTitle'),
      content: t('settings:dataManager.import.confirmContent'),
      okText: t('settings:dataManager.import.confirmButton'),
      okType: 'danger',
      cancelText: t('settings:dataManager.import.cancel'),
      onOk: async () => {
        setLoading(true)
        setError(null)
        try {
          const result = (await window.api.importExport.executeImport(filePath)) as ImportResultData
          setImportResult(result)
          message.success(t('settings:dataManager.messages.importSuccess', { count: result.imported }))
          // 导入成功后返回数据浏览页面
          setTimeout(() => {
            navigate('/transactions')
          }, 1500)
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setLoading(false)
        }
      }
    })
  }

  const handleClearTransactions = (): void => {
    Modal.confirm({
      title: t('settings:dataManager.dangerous.clearConfirmTitle'),
      icon: <WarningOutlined style={{ color: '#ff4d4f' }} />,
      content: t('settings:dataManager.dangerous.clearConfirmContent'),
      okText: t('settings:dataManager.dangerous.clearButton'),
      okType: 'danger',
      cancelText: t('settings:dataManager.import.cancel'),
      onOk: async () => {
        try {
          await window.api.data.clearTransactions()
          message.success(t('settings:dataManager.dangerous.clearSuccessMessage'))
        } catch (err) {
          message.error(err instanceof Error ? err.message : t('settings:dataManager.dangerous.clearFailedMessage'))
        }
      }
    })
  }

  const handleFactoryReset = (): void => {
    Modal.confirm({
      title: t('settings:dataManager.dangerous.resetConfirmTitle'),
      icon: <WarningOutlined style={{ color: '#ff4d4f' }} />,
      content: t('settings:dataManager.dangerous.resetConfirmContent'),
      okText: t('settings:dataManager.dangerous.resetButton'),
      okType: 'danger',
      cancelText: t('settings:dataManager.import.cancel'),
      onOk: async () => {
        try {
          await window.api.data.factoryReset()
          message.success(t('settings:dataManager.dangerous.resetSuccessMessage'))
        } catch (err) {
          message.error(err instanceof Error ? err.message : t('settings:dataManager.dangerous.resetFailedMessage'))
        }
      }
    })
  }

  // ── 按类型过滤的分类选项 ──
  const filteredCategories = exportTypes.length > 0
    ? categories.filter((c) => exportTypes.includes(c.type))
    : categories

  return (
    <div>
      {/* Excel 导入 */}
      <Card title={t('settings:dataManager.import.title')} size="small" style={{ marginBottom: 16 }}>
        <Space>
          <Button icon={<UploadOutlined />} onClick={handleSelectFile} loading={loading}>
            {t('settings:dataManager.import.selectFile')}
          </Button>
          {filePath && <Text type="secondary">{filePath}</Text>}
        </Space>

        {error && (
          <Alert type="error" message={t('settings:dataManager.import.error')} description={error} showIcon closable style={{ marginTop: 12 }} />
        )}

        {loading && !preview && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Spin tip={t('settings:dataManager.import.parsing')} />
          </div>
        )}

        {preview && (
          <div style={{ marginTop: 12 }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('settings:dataManager.import.validRows')}>{preview.rowCount}</Descriptions.Item>
              <Descriptions.Item label={t('settings:dataManager.import.operators')}>
                {preview.uniqueOperators.length > 0
                  ? preview.uniqueOperators.map((name) => (
                      <Tag key={name} color="blue">
                        {name}
                      </Tag>
                    ))
                  : t('settings:dataManager.import.none')}
              </Descriptions.Item>
              <Descriptions.Item label={t('settings:dataManager.import.categories')}>
                {preview.uniqueCategories.map((cat) => (
                  <Tag key={`${cat.name}:${cat.type}`} color={TRANSACTION_TYPE_CONFIG[cat.type as TransactionType]?.tagColor ?? 'default'}>
                    {cat.name}
                  </Tag>
                ))}
              </Descriptions.Item>
            </Descriptions>

            {preview.errors.length > 0 && (
              <Alert
                type="warning"
                message={`${preview.errors.length} ${t('settings:dataManager.import.errors')}`}
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {preview.errors.slice(0, 10).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                    {preview.errors.length > 10 && <li>{t('settings:dataManager.import.moreErrors', { count: preview.errors.length - 10 })}</li>}
                  </ul>
                }
                showIcon
                style={{ marginTop: 12 }}
              />
            )}

            <div style={{ marginTop: 12 }}>
              <Button
                type="primary"
                danger
                icon={<ImportOutlined />}
                onClick={handleImport}
                loading={loading}
                disabled={preview.rowCount === 0}
              >
                {t('settings:dataManager.import.execute')}
              </Button>
            </div>
          </div>
        )}

        {importResult && (
          <Alert
            type="success"
            message={t('settings:dataManager.import.success')}
            description={
              <Descriptions column={1} size="small">
                <Descriptions.Item label={t('settings:dataManager.import.importedRecords')}>{importResult.imported}</Descriptions.Item>
                <Descriptions.Item label={t('settings:dataManager.import.operatorsCreated')}>{importResult.operatorsCreated}</Descriptions.Item>
                <Descriptions.Item label={t('settings:dataManager.import.categoriesCreated')}>{importResult.categoriesCreated}</Descriptions.Item>
              </Descriptions>
            }
            showIcon
            style={{ marginTop: 12 }}
          />
        )}
      </Card>

      {/* 数据导出 */}
      <Card title={t('settings:dataManager.export.title')} size="small" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <Text style={{ marginRight: 8 }}>{t('settings:dataManager.export.formatLabel')}</Text>
          <Radio.Group
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
          >
            <Radio.Button value="xlsx">{t('settings:dataManager.export.formatExcel')}</Radio.Button>
            <Radio.Button value="csv">{t('settings:dataManager.export.formatCsv')}</Radio.Button>
          </Radio.Group>
        </div>

        <Collapse
          size="small"
          items={[
            {
              key: 'filters',
              label: t('settings:dataManager.export.filtersLabel'),
              children: (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>{t('settings:dataManager.export.dateRange')}</Text>
                    <RangePicker
                      style={{ width: '100%' }}
                      value={exportDateRange}
                      onChange={(dates) => setExportDateRange(dates)}
                      allowClear
                    />
                  </div>
                  <div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>{t('settings:dataManager.export.transactionType')}</Text>
                    <Checkbox.Group
                      value={exportTypes}
                      onChange={(values) => {
                        setExportTypes(values as TransactionType[])
                        setExportCategoryIds([])
                      }}
                      options={Object.keys(TRANSACTION_TYPE_CONFIG).map((key) => ({
                        label: t(`common:transactionTypes.${key}` as const),
                        value: key
                      }))}
                    />
                  </div>
                  <div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>{t('settings:dataManager.export.category')}</Text>
                    <Select
                      mode="multiple"
                      style={{ width: '100%' }}
                      placeholder={t('settings:dataManager.export.categoryPlaceholder')}
                      value={exportCategoryIds}
                      onChange={setExportCategoryIds}
                      allowClear
                      options={filteredCategories.map((c) => ({
                        label: `${c.name}（${t(`common:transactionTypes.${c.type}` as const)}）`,
                        value: c.id
                      }))}
                    />
                  </div>
                  <div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>{t('settings:dataManager.export.operator')}</Text>
                    <Select
                      mode="multiple"
                      style={{ width: '100%' }}
                      placeholder={t('settings:dataManager.export.operatorPlaceholder')}
                      value={exportOperatorIds}
                      onChange={setExportOperatorIds}
                      allowClear
                      options={operators.map((o) => ({
                        label: o.name,
                        value: o.id
                      }))}
                    />
                  </div>
                  <div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>{t('settings:dataManager.export.keyword')}</Text>
                    <Input
                      placeholder={t('settings:dataManager.export.keywordPlaceholder')}
                      value={exportKeyword}
                      onChange={(e) => setExportKeyword(e.target.value)}
                      allowClear
                    />
                  </div>
                </Space>
              )
            }
          ]}
        />

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary">
            {exportCount !== null ? t('settings:dataManager.export.recordCount', { count: exportCount }) : t('settings:dataManager.export.calculating')}
          </Text>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExport}
            loading={exportLoading}
            disabled={exportCount === 0}
          >
            {t('settings:dataManager.export.exportButton')}
          </Button>
        </div>

        {exportCount === 0 && (
          <Alert
            type="info"
            message={t('settings:dataManager.export.noRecords')}
            description={t('settings:dataManager.export.noRecordsHint')}
            showIcon
            style={{ marginTop: 12 }}
          />
        )}
      </Card>

      {/* 危险操作 */}
      <Card
        title={<Text type="danger">{t('settings:dataManager.dangerous.title')}</Text>}
        size="small"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <Text strong>{t('settings:dataManager.dangerous.clearTitle')}</Text>
            <br />
            <Text type="secondary">{t('settings:dataManager.dangerous.clearDescription')}</Text>
          </div>
          <Button danger icon={<DeleteOutlined />} onClick={handleClearTransactions}>
            {t('settings:dataManager.dangerous.clearButton')}
          </Button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text strong>{t('settings:dataManager.dangerous.resetTitle')}</Text>
            <br />
            <Text type="secondary">{t('settings:dataManager.dangerous.resetDescription')}</Text>
          </div>
          <Button danger icon={<DeleteOutlined />} onClick={handleFactoryReset}>
            {t('settings:dataManager.dangerous.resetButton')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
