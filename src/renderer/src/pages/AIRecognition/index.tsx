import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, Button, Select, Alert, Typography, message, Card,
  Drawer, Space, Image, Modal
} from 'antd'
import {
  CameraOutlined, DeleteOutlined, SendOutlined, CloseOutlined,
  FileTextOutlined, ArrowLeftOutlined, LoadingOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import type { AIProviderView, CreateTransactionDTO, ImportDraft } from '@shared/types'

import ImportConfirm, { type ImportRow } from '../../components/ImportConfirm'
import { useDraftStore } from '../../stores/draft.store'

const { Text, Title } = Typography
const { Dragger } = Upload



interface ImageItem {
  id: string
  dataUrl: string
  name: string
}

export default function AIRecognition(): React.JSX.Element {
  const { t } = useTranslation(['ai', 'common'])
  const navigate = useNavigate()
  const draftStore = useDraftStore()
  const [providers, setProviders] = useState<AIProviderView[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<string>('')
  const [images, setImages] = useState<ImageItem[]>([])
  const [results, setResults] = useState<ImportRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [logsOpen, setLogsOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [draftRestored, setDraftRestored] = useState(false)
  const [draftAccountingDate, setDraftAccountingDate] = useState<Dayjs | undefined>(undefined)
  const [draftOperatorId, setDraftOperatorId] = useState<number | null>(null)
  const [showDraftOverwriteAlert, setShowDraftOverwriteAlert] = useState(false)
  const hasCheckedDraftRef = useRef(false)

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

  useEffect(() => {
    loadProviders()
    // 检查并恢复草稿
    checkAndRestoreDraft()
  }, [loadProviders])

  // 检查并恢复草稿
  const checkAndRestoreDraft = async (): Promise<void> => {
    const draft = await draftStore.getDraft()
    if (draft && draft.source === 'ai' && !draftRestored) {
      // 恢复草稿数据
      const aiSpecific = draft.data.aiSpecific
      if (aiSpecific) {
        // 恢复图片（只恢复存在的）
        const validImages: ImageItem[] = []
        let missingCount = 0
        
        for (const path of aiSpecific.imagePaths) {
          try {
            // 尝试检查文件是否存在（通过 electron API）
            const exists = await window.api.dialog.openFile([])
            // 这里简化处理，实际应该添加一个检查文件存在的 IPC
            // 暂时假设图片可能丢失
            missingCount++
          } catch {
            missingCount++
          }
        }
        
        // 恢复交易数据
        const importRows: ImportRow[] = draft.data.transactions.map(t => ({
          key: t.key,
          type: t.type,
          amount: t.amount ?? 0,
          category_id: t.category_id,
          description: t.description,
          operator_id: t.operator_id
        }))
        
        setResults(importRows)
        setDraftRestored(true)
        // 恢复日期和操作人
        if (aiSpecific.accountingDate) {
          setDraftAccountingDate(dayjs(aiSpecific.accountingDate))
        }
        setDraftOperatorId(draft.data.operatorId ?? null)
        
        if (missingCount > 0) {
          message.warning(t('ai:messages.imagesMissing', { count: missingCount }))
        }
        // 不显示恢复成功提示，用户主动点击继续导入，无需额外提示
      }
    }
  }

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
                { id: `paste-${Date.now()}`, dataUrl, name: t('ai:recognition.pastedImageName', { index: prev.length + 1 }) }
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
      message.error(t('ai:messages.imagesTooLarge'))
      return false
    }

    const totalSize = images.reduce((sum, img) => sum + img.dataUrl.length * 0.75, 0) + file.size
    if (totalSize > 20 * 1024 * 1024) {
      message.error(t('ai:messages.totalTooLarge'))
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

  const startTimer = (): void => {
    setElapsed(0)
    elapsedRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
  }

  const stopTimer = (): void => {
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current)
      elapsedRef.current = null
    }
  }

  const formatElapsed = (s: number): string => {
    const min = Math.floor(s / 60)
    const sec = s % 60
    return min > 0
      ? `${min}${t('ai:time.minutes')}${sec}${t('ai:time.seconds')}`
      : `${sec}${t('ai:time.seconds')}`
  }

  const handleRecognize = async (): Promise<void> => {
    if (images.length === 0) {
      message.warning(t('ai:messages.uploadFirst'))
      return
    }
    if (!selectedProviderId) {
      message.warning(t('ai:messages.selectProvider'))
      return
    }

    setLoading(true)
    setLogs([])
    startTimer()
    try {
      const response = await window.api.ai.recognize({
        images: images.map((img) => img.dataUrl),
        providerId: selectedProviderId
      })

      // Convert RecognitionResultRow to ImportRow
      const importRows: ImportRow[] = response.items.map((row, index) => ({
        key: row.key || `ai-${index}-${Date.now()}`,
        type: row.type,
        amount: row.amount,
        category_id: row.category_id,
        description: row.description,
        operator_id: row.operator_id ?? null
      }))

      // 检查是否覆盖了旧草稿（只检查一次，避免 ImportConfirm 创建草稿后误判）
      if (!hasCheckedDraftRef.current) {
        const summary = await window.api.draft.getSummary()
        if (summary.exists) {
          setShowDraftOverwriteAlert(true)
        }
        hasCheckedDraftRef.current = true
      }

      setResults(importRows)

      if (response.warnings.length > 0) {
        response.warnings.forEach((w) => message.warning(w))
      }
      if (response.items.length > 0) {
        message.success(t('ai:messages.recognitionSuccess', { count: response.items.length }))
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : t('ai:messages.recognitionFailed')
      if (!errMsg.includes('用户已取消')) {
        message.error(errMsg)
      }
    } finally {
      stopTimer()
      setLoading(false)
      try {
        const fetchedLogs = await window.api.ai.getLogs()
        setLogs(fetchedLogs)
      } catch {
        // Ignore log fetch errors
      }
    }
  }

  const handleAbortRecognize = async (): Promise<void> => {
    try {
      await window.api.ai.abortRecognize()
      message.info(t('ai:messages.cancelled'))
    } catch {
      // ignore
    }
  }

  const handleConfirm = async (rows: ImportRow[], accountingDate: Dayjs) => {
    const dateStr = accountingDate.format('YYYY-MM-DD')
    const items: CreateTransactionDTO[] = rows.map((row) => ({
      date: dateStr,
      type: row.type,
      amount: row.amount,
      category_id: row.category_id!,
      description: row.description || '',
      operator_id: row.operator_id
    }))

    const result = await window.api.transaction.batchCreate(items)
    if ((result as { count: number }).count !== rows.length) {
      throw new Error(t('ai:messages.importMismatch'))
    }
  }

  const handleCancel = () => {
    setResults(null)
    setImages([])
  }

  const configuredProviders = providers.filter((p) => p.apiKeyMasked)
  const hasNoProvider = configuredProviders.length === 0

  // Show ImportConfirm when results are available
  if (results) {
    return (
      <div style={{ padding: 24 }}>
        {showDraftOverwriteAlert && (
          <Alert
            message={t('ai:messages.draftReplaced', { count: draftStore.summary.count })}
            type="info"
            showIcon
            closable
            onClose={() => setShowDraftOverwriteAlert(false)}
            style={{ marginBottom: 16 }}
          />
        )}
        <ImportConfirm
          title={t('ai:recognition.confirmTitle')}
          sourceInfo={t('ai:recognition.sourceInfo', { count: images.length })}
          initialRows={results}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          draftSource="ai"
          imagePaths={images.map(img => img.name)}
          restoredFromDraft={draftRestored}
          initialAccountingDate={draftAccountingDate}
          initialOperatorId={draftOperatorId}
        />
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/transactions')}
        />
        <Title level={4} style={{ margin: 0 }}>{t('ai:recognition.title')}</Title>
      </div>

      {hasNoProvider && (
        <Alert
          type="warning"
          message={t('ai:alerts.notConfigured')}
          description={
            <span>
              {t('ai:alerts.notConfiguredHint')}
            </span>
          }
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {/* Control bar */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          {configuredProviders.length > 0 ? (
            <>
              <Text>{t('ai:recognition.selectModel')}</Text>
              <Select
                value={selectedProviderId || undefined}
                placeholder={t('ai:recognition.selectModelPlaceholder')}
                style={{ width: 200 }}
                options={configuredProviders.map((p) => ({
                  label: `${p.name}${p.isDefault ? t('ai:recognition.defaultSuffix') : ''}`,
                  value: p.id
                }))}
                onChange={setSelectedProviderId}
              />
            </>
          ) : null}
        </Space>
      </Card>

      {/* Image upload area */}
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
          <p>{t('ai:recognition.uploadHint')}</p>
          <p style={{ color: '#999', fontSize: 12 }}>
            {t('ai:recognition.uploadLimits')}
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
                  <Image
                    src={img.dataUrl}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    preview={{ mask: null }}
                  />
                  <Button
                    type="text"
                    size="small"
                    danger
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      padding: '2px 6px',
                      minWidth: 'auto',
                      background: 'rgba(255,255,255,0.8)'
                    }}
                    onClick={() => removeImage(img.id)}
                  >
                    <DeleteOutlined />
                  </Button>
                </div>
              ))}
            </div>
            <Space>
              <Button
                type="primary"
                icon={loading ? <LoadingOutlined /> : <SendOutlined />}
                loading={loading}
                onClick={handleRecognize}
                disabled={images.length === 0 || !selectedProviderId}
              >
                {loading ? t('ai:recognition.recognizing', { elapsed: formatElapsed(elapsed) }) : t('ai:recognition.startRecognition')}
              </Button>
              {loading && (
                <Button onClick={handleAbortRecognize}>
                  {t('ai:recognition.cancel')}
                </Button>
              )}
              {logs.length > 0 && (
                <Button onClick={() => setLogsOpen(true)}>
                  <FileTextOutlined /> {t('ai:recognition.viewLogs')}
                </Button>
              )}
              <Button onClick={() => setImages([])}>
                <CloseOutlined /> {t('ai:recognition.clearImages')}
              </Button>
            </Space>
          </div>
        )}
      </Card>

      {/* Log Drawer */}
      <Drawer
        title={t('ai:recognition.logsTitle')}
        placement="right"
        width={600}
        onClose={() => setLogsOpen(false)}
        open={logsOpen}
      >
        <pre style={{
          background: '#f5f5f5',
          padding: 12,
          borderRadius: 4,
          minHeight: '80vh',
          fontSize: 12,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}>
          {logs.join('\n') || t('ai:recognition.noLogs')}
        </pre>
      </Drawer>
    </div>
  )
}
