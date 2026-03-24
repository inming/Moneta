import { useEffect, useState, useCallback } from 'react'
import {
  Card, Button, Input, Space, Tag, message, Typography, Spin, Modal
} from 'antd'
import {
  ApiOutlined, StarFilled, StarOutlined, SaveOutlined, EyeOutlined, CopyOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { AIProviderView } from '@shared/types'

const { Text } = Typography

export default function AIProviderManager(): React.JSX.Element {
  const { t } = useTranslation('settings')
  const [providers, setProviders] = useState<AIProviderView[]>([])
  const [loading, setLoading] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null)

  // Prompt 预览状态
  const [promptVisible, setPromptVisible] = useState(false)
  const [promptText, setPromptText] = useState('')
  const [promptLoading, setPromptLoading] = useState(false)

  // 每个模型的编辑状态
  const [editState, setEditState] = useState<Record<string, { apiKey: string; endpoint: string; model: string }>>({})

  const loadProviders = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.api.aiProvider.list()
      setProviders(data)
      // 初始化编辑状态
      const initial: Record<string, { apiKey: string; endpoint: string; model: string }> = {}
      for (const p of data) {
        initial[p.id] = { apiKey: '', endpoint: p.endpoint, model: p.model }
      }
      setEditState(initial)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  const handleSave = async (id: string): Promise<void> => {
    const state = editState[id]
    if (!state) return

    setSavingId(id)
    try {
      const dto: { apiKey?: string; endpoint?: string; model?: string } = {}
      const provider = providers.find((p) => p.id === id)
      if (state.apiKey) {
        dto.apiKey = state.apiKey
      }
      if (provider && state.endpoint !== provider.endpoint) {
        dto.endpoint = state.endpoint
      }
      if (provider && state.model !== provider.model) {
        dto.model = state.model
      }
      if (!dto.apiKey && !dto.endpoint && !dto.model) {
        message.info(t('aiProvider.messages.noChanges'))
        return
      }
      await window.api.aiProvider.update(id, dto)
      message.success(t('aiProvider.messages.saveSuccess'))
      await loadProviders()
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('aiProvider.messages.saveFailed'))
    } finally {
      setSavingId(null)
    }
  }

  const handleTest = async (id: string): Promise<void> => {
    setTestingId(id)
    try {
      const result = await window.api.aiProvider.test(id)
      if (result.success) {
        message.success(t('aiProvider.messages.testSuccess', { model: result.modelName }))
      } else {
        message.error(t('aiProvider.messages.testFailed', { error: result.error }))
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('aiProvider.messages.testError'))
    } finally {
      setTestingId(null)
    }
  }

  const handleSetDefault = async (id: string): Promise<void> => {
    setSettingDefaultId(id)
    try {
      await window.api.aiProvider.setDefault(id)
      message.success(t('aiProvider.messages.setDefaultSuccess'))
      await loadProviders()
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('aiProvider.messages.setDefaultFailed'))
    } finally {
      setSettingDefaultId(null)
    }
  }

  const handlePromptPreview = async (): Promise<void> => {
    setPromptVisible(true)
    setPromptLoading(true)
    try {
      const text = await window.api.ai.getPromptPreview()
      setPromptText(text)
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('aiProvider.messages.promptFailed'))
      setPromptVisible(false)
    } finally {
      setPromptLoading(false)
    }
  }

  const handleCopyPrompt = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(promptText)
      message.success(t('aiProvider.messages.clipboardSuccess'))
    } catch {
      message.error(t('aiProvider.messages.clipboardFailed'))
    }
  }

  const updateEditField = (id: string, field: 'apiKey' | 'endpoint' | 'model', value: string): void => {
    setEditState((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }))
  }

  if (loading) {
    return <Spin style={{ display: 'block', textAlign: 'center', padding: 40 }} />
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text type="secondary">
          {t('aiProvider.description')}
        </Text>
        <Button icon={<EyeOutlined />} onClick={handlePromptPreview}>
          {t('aiProvider.viewPrompt')}
        </Button>
      </div>

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {providers.map((provider) => {
          const state = editState[provider.id] || { apiKey: '', endpoint: provider.endpoint, model: provider.model }
          const isConfigured = !!provider.apiKeyMasked
          const modelPlaceholder = provider.id.includes('doubao')
            ? t('aiProvider.fields.modelPlaceholderDoubao')
            : provider.id

          return (
            <Card
              key={provider.id}
              size="small"
              title={
                <Space>
                  <Text strong>{provider.name}</Text>
                  {provider.isDefault && <Tag color="green" icon={<StarFilled />}>{t('aiProvider.defaultTag')}</Tag>}
                  {isConfigured
                    ? <Tag color="success">{t('aiProvider.statusConfigured')}</Tag>
                    : <Tag color="warning">{t('aiProvider.statusNotConfigured')}</Tag>
                  }
                </Space>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                <div>
                  <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
                    {t('aiProvider.fields.endpoint')}
                  </Text>
                  <Input
                    value={state.endpoint}
                    onChange={(e) => updateEditField(provider.id, 'endpoint', e.target.value)}
                    placeholder="https://open.bigmodel.cn/api/paas/v4"
                  />
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
                    {t('aiProvider.fields.model')}
                  </Text>
                  <Input
                    value={state.model}
                    onChange={(e) => updateEditField(provider.id, 'model', e.target.value)}
                    placeholder={modelPlaceholder}
                  />
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
                    {t('aiProvider.fields.apiKey')} {isConfigured && <Text type="secondary">（{t('aiProvider.fields.apiKeyCurrent')}{provider.apiKeyMasked}{t('aiProvider.fields.apiKeyHint')}）</Text>}
                  </Text>
                  <Input.Password
                    value={state.apiKey}
                    onChange={(e) => updateEditField(provider.id, 'apiKey', e.target.value)}
                    placeholder={isConfigured ? t('aiProvider.fields.apiKeyPlaceholderKeep') : t('aiProvider.fields.apiKeyPlaceholderNew')}
                  />
                </div>
                <Space style={{ marginTop: 8 }}>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={savingId === provider.id}
                    onClick={() => handleSave(provider.id)}
                  >
                    {t('aiProvider.buttons.save')}
                  </Button>
                  <Button
                    icon={<ApiOutlined />}
                    loading={testingId === provider.id}
                    onClick={() => handleTest(provider.id)}
                    disabled={!isConfigured}
                  >
                    {t('aiProvider.buttons.test')}
                  </Button>
                  {isConfigured && !provider.isDefault && (
                    <Button
                      icon={<StarOutlined />}
                      loading={settingDefaultId === provider.id}
                      onClick={() => handleSetDefault(provider.id)}
                    >
                      {t('aiProvider.buttons.setDefault')}
                    </Button>
                  )}
                </Space>
              </Space>
            </Card>
          )
        })}
      </Space>

      <Modal
        title={t('aiProvider.promptModal.title')}
        open={promptVisible}
        onCancel={() => setPromptVisible(false)}
        width={700}
        footer={[
          <Button key="copy" type="primary" icon={<CopyOutlined />} onClick={handleCopyPrompt} disabled={promptLoading}>
            {t('aiProvider.promptModal.copyButton')}
          </Button>,
          <Button key="close" onClick={() => setPromptVisible(false)}>
            {t('aiProvider.promptModal.closeButton')}
          </Button>
        ]}
      >
        {promptLoading ? (
          <Spin style={{ display: 'block', textAlign: 'center', padding: 40 }} />
        ) : (
          <pre style={{
            fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
            fontSize: 13,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '60vh',
            overflow: 'auto',
            background: '#f5f5f5',
            padding: 16,
            borderRadius: 6,
            margin: 0
          }}>
            {promptText}
          </pre>
        )}
      </Modal>
    </div>
  )
}
