import { useState } from 'react'
import { Button, Card, Alert, Descriptions, Modal, Spin, Space, Tag, Typography, message } from 'antd'
import { UploadOutlined, ImportOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons'
import type { TransactionType } from '@shared/types'
import { TRANSACTION_TYPE_CONFIG } from '@shared/constants/transaction-type'

const { Text } = Typography

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

export default function DataManager(): React.JSX.Element {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [importResult, setImportResult] = useState<ImportResultData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      title: '确认导入',
      content: '导入将清空所有现有交易记录和操作人数据，此操作不可撤销。确定继续？',
      okText: '确认导入',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setLoading(true)
        setError(null)
        try {
          const result = (await window.api.importExport.executeImport(filePath)) as ImportResultData
          setImportResult(result)
          message.success(`成功导入 ${result.imported} 条记录`)
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
      title: '确认清空交易记录',
      icon: <WarningOutlined style={{ color: '#ff4d4f' }} />,
      content: '将删除所有交易记录和操作人数据，分类设置将保留。此操作不可撤销，确定继续？',
      okText: '清空交易记录',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await window.api.data.clearTransactions()
          message.success('已清空所有交易记录和操作人')
        } catch (err) {
          message.error(err instanceof Error ? err.message : '清空失败')
        }
      }
    })
  }

  const handleFactoryReset = (): void => {
    Modal.confirm({
      title: '确认恢复出厂设置',
      icon: <WarningOutlined style={{ color: '#ff4d4f' }} />,
      content: '将清空所有数据（交易记录、操作人、自定义分类），恢复到初始安装状态。此操作不可撤销，确定继续？',
      okText: '恢复出厂设置',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await window.api.data.factoryReset()
          message.success('已恢复出厂设置')
        } catch (err) {
          message.error(err instanceof Error ? err.message : '恢复失败')
        }
      }
    })
  }

  return (
    <div>
      {/* Excel 导入 */}
      <Card title="Excel 导入" size="small" style={{ marginBottom: 16 }}>
        <Space>
          <Button icon={<UploadOutlined />} onClick={handleSelectFile} loading={loading}>
            选择 Excel 文件
          </Button>
          {filePath && <Text type="secondary">{filePath}</Text>}
        </Space>

        {error && (
          <Alert type="error" message="错误" description={error} showIcon closable style={{ marginTop: 12 }} />
        )}

        {loading && !preview && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Spin tip="解析中..." />
          </div>
        )}

        {preview && (
          <div style={{ marginTop: 12 }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="有效记录数">{preview.rowCount} 条</Descriptions.Item>
              <Descriptions.Item label="操作人">
                {preview.uniqueOperators.length > 0
                  ? preview.uniqueOperators.map((name) => (
                      <Tag key={name} color="blue">
                        {name}
                      </Tag>
                    ))
                  : '无'}
              </Descriptions.Item>
              <Descriptions.Item label="分类">
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
                message={`${preview.errors.length} 行数据有问题（已跳过）`}
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {preview.errors.slice(0, 10).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                    {preview.errors.length > 10 && <li>...还有 {preview.errors.length - 10} 条</li>}
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
                执行导入（全量覆盖）
              </Button>
            </div>
          </div>
        )}

        {importResult && (
          <Alert
            type="success"
            message="导入成功"
            description={
              <Descriptions column={1} size="small">
                <Descriptions.Item label="导入记录数">{importResult.imported} 条</Descriptions.Item>
                <Descriptions.Item label="创建操作人">{importResult.operatorsCreated} 个</Descriptions.Item>
                <Descriptions.Item label="新建分类">{importResult.categoriesCreated} 个</Descriptions.Item>
              </Descriptions>
            }
            showIcon
            style={{ marginTop: 12 }}
          />
        )}
      </Card>

      {/* 危险操作 */}
      <Card
        title={<Text type="danger">危险操作</Text>}
        size="small"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <Text strong>清空交易记录</Text>
            <br />
            <Text type="secondary">删除所有交易记录和操作人，保留分类设置</Text>
          </div>
          <Button danger icon={<DeleteOutlined />} onClick={handleClearTransactions}>
            清空交易记录
          </Button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text strong>恢复出厂设置</Text>
            <br />
            <Text type="secondary">清空所有数据，恢复到初始安装状态</Text>
          </div>
          <Button danger icon={<DeleteOutlined />} onClick={handleFactoryReset}>
            恢复出厂设置
          </Button>
        </div>
      </Card>
    </div>
  )
}
