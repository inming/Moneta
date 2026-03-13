import { useEffect, useState, useCallback } from 'react'
import {
  Card, Button, Input, Space, Tag, message, Typography, Spin
} from 'antd'
import {
  ApiOutlined, StarFilled, SaveOutlined
} from '@ant-design/icons'
import type { AIProviderView } from '@shared/types'

const { Text } = Typography

export default function AIProviderManager(): React.JSX.Element {
  const [providers, setProviders] = useState<AIProviderView[]>([])
  const [loading, setLoading] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

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
        message.info('无修改内容')
        return
      }
      await window.api.aiProvider.update(id, dto)
      message.success('配置已保存')
      await loadProviders()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingId(null)
    }
  }

  const handleTest = async (id: string): Promise<void> => {
    setTestingId(id)
    try {
      const result = await window.api.aiProvider.test(id)
      if (result.success) {
        message.success(`连接成功！模型: ${result.modelName}`)
      } else {
        message.error(`连接失败: ${result.error}`)
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '测试失败')
    } finally {
      setTestingId(null)
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
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        配置 AI 模型以启用图片识别功能。填入 API Key 即可使用，Endpoint 可修改为第三方平台地址。
      </Text>

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {providers.map((provider) => {
          const state = editState[provider.id] || { apiKey: '', endpoint: provider.endpoint, model: provider.model }
          const isConfigured = !!provider.apiKeyMasked

          return (
            <Card
              key={provider.id}
              size="small"
              title={
                <Space>
                  <Text strong>{provider.name}</Text>
                  {provider.isDefault && <Tag color="green" icon={<StarFilled />}>默认</Tag>}
                  {isConfigured
                    ? <Tag color="success">已配置</Tag>
                    : <Tag color="warning">未配置</Tag>
                  }
                </Space>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                <div>
                  <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
                    API Endpoint
                  </Text>
                  <Input
                    value={state.endpoint}
                    onChange={(e) => updateEditField(provider.id, 'endpoint', e.target.value)}
                    placeholder="https://open.bigmodel.cn/api/paas/v4"
                  />
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
                    模型标识
                  </Text>
                  <Input
                    value={state.model}
                    onChange={(e) => updateEditField(provider.id, 'model', e.target.value)}
                    placeholder="glm-4.5v"
                  />
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
                    API Key {isConfigured && <Text type="secondary">（当前: {provider.apiKeyMasked}，留空则保持不变）</Text>}
                  </Text>
                  <Input.Password
                    value={state.apiKey}
                    onChange={(e) => updateEditField(provider.id, 'apiKey', e.target.value)}
                    placeholder={isConfigured ? '留空保持不变' : '请输入 API Key'}
                  />
                </div>
                <Space style={{ marginTop: 8 }}>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={savingId === provider.id}
                    onClick={() => handleSave(provider.id)}
                  >
                    保存
                  </Button>
                  <Button
                    icon={<ApiOutlined />}
                    loading={testingId === provider.id}
                    onClick={() => handleTest(provider.id)}
                    disabled={!isConfigured}
                  >
                    测试连接
                  </Button>
                </Space>
              </Space>
            </Card>
          )
        })}
      </Space>
    </div>
  )
}
