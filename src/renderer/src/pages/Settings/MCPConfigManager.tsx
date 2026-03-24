import { useEffect, useState, useCallback } from 'react'
import {
  Card, Button, Space, message, Typography, Spin, Alert,
  InputNumber, Collapse, Tag
} from 'antd'
import {
  DesktopOutlined, PlayCircleOutlined, CopyOutlined,
  SettingOutlined, ReloadOutlined, EditOutlined, CheckOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

const { Text } = Typography
const { Panel } = Collapse

interface MCPStatus {
  configured: boolean
  serverRunning: boolean
  port: number
  serverError?: string
}

interface ConfigResult {
  success: boolean
  message: string
  needsRestart: boolean
}

interface ConfigPaths {
  claudeConfigPath: string
  mcpServerPath: string
}

const INSTRUCTIONS_TEXT = `# Moneta 账单导入助手使用指南

当用户想要从本地文件导入交易记录到 Moneta 时，请按以下步骤操作：

## 步骤 1: 获取元数据
调用工具获取当前分类和操作人：
- get_categories() - 返回所有启用的分类（含 AI 描述）
- get_operators() - 返回操作人列表

## 步骤 2: 分析文件
用户会提供文件路径或内容，你需要：
1. 识别日期列，统一转换为 YYYY-MM-DD
2. 识别金额列（处理正负号、千分号）
3. 识别描述/商品名称列
4. 判断交易类型（expense/income/investment）

## 步骤 3: 智能分类匹配
结合分类的 name 和 description 进行匹配：
- 美团、饿了么 → 正餐（外卖、堂食）
- 滴滴、地铁 → 交通（地铁、公交、打车）
- 工资、薪资 → 工资（固定薪资收入）
- 不确定时留空 category_id

## 步骤 4: 发送数据
调用 send_transactions({ transactions: [...], source: "描述" })
Moneta 会自动打开确认界面供用户审核。

## 注意事项
- 金额支持正数和负数，负数表示退款/冲正
- 金额不能为 0
- 日期格式严格为 YYYY-MM-DD`

export default function MCPConfigManager(): React.JSX.Element {
  const { t } = useTranslation('settings')
  const [mcpStatus, setMcpStatus] = useState<MCPStatus | null>(null)
  const [startingServer, setStartingServer] = useState(false)
  const [configuringClaude, setConfiguringClaude] = useState(false)
  const [loading, setLoading] = useState(true)
  const [configPaths, setConfigPaths] = useState<ConfigPaths | null>(null)
  const [editingPort, setEditingPort] = useState(false)
  const [portValue, setPortValue] = useState<number>(9615)
  const [updatingPort, setUpdatingPort] = useState(false)

  const loadMCPStatus = useCallback(async (): Promise<void> => {
    try {
      const [status, paths, httpConfig] = await Promise.all([
        window.api.mcp.getStatus(),
        window.api.mcp.getPaths(),
        window.api.mcp.getHttpConfig()
      ])
      setMcpStatus(status)
      setConfigPaths(paths)
      setPortValue(httpConfig.port)
    } catch {
      message.error(t('mcpConfig.messages.statusFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadMCPStatus()

    const unsubscribe = window.api.mcp.onHttpStatusChanged((status) => {
      setMcpStatus(prev => prev ? { ...prev, serverRunning: status.running, serverError: status.error } : null)
    })

    return () => {
      unsubscribe()
    }
  }, [loadMCPStatus])

  const handleStartServer = async (): Promise<void> => {
    setStartingServer(true)
    try {
      const result: ConfigResult = await window.api.mcp.startServer()
      if (result.success) {
        message.success(result.message)
        await loadMCPStatus()
      } else {
        message.error(result.message)
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('mcpConfig.messages.startFailed'))
    } finally {
      setStartingServer(false)
    }
  }

  const handleConfigureClaude = async (): Promise<void> => {
    setConfiguringClaude(true)
    try {
      const result: ConfigResult = await window.api.mcp.configureClaude()
      if (result.success) {
        message.success(result.message)
        await loadMCPStatus()
      } else {
        message.error(result.message)
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('mcpConfig.messages.configureFailed'))
    } finally {
      setConfiguringClaude(false)
    }
  }

  const handleUpdatePort = async (): Promise<void> => {
    if (!portValue || portValue < 1025 || portValue > 65535) {
      message.error(t('mcpConfig.messages.portInvalid'))
      return
    }

    setUpdatingPort(true)
    try {
      const result = await window.api.mcp.updatePort(portValue)
      if (result.success) {
        message.success(result.message)
        await loadMCPStatus()
        setEditingPort(false)
      } else {
        message.error(result.message)
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('mcpConfig.messages.portUpdateFailed'))
    } finally {
      setUpdatingPort(false)
    }
  }

  const handleCopyInstructions = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(INSTRUCTIONS_TEXT)
      message.success(t('mcpConfig.messages.instructionsCopied'))
    } catch {
      message.error(t('mcpConfig.messages.copyFailed'))
    }
  }

  if (loading) {
    return <Spin style={{ display: 'block', textAlign: 'center', padding: 40 }} />
  }

  const isServerRunning = mcpStatus?.serverRunning
  const isConfigured = mcpStatus?.configured
  const hasServerError = mcpStatus?.serverError

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {/* HTTP 服务 */}
      <Card
        size="small"
        title={
          <Space>
            <SettingOutlined />
            <span>{t('mcpConfig.httpServer.title')}</span>
            {isServerRunning
              ? <Tag color="success">{t('mcpConfig.httpServer.statusRunning')}</Tag>
              : <Tag color="warning">{t('mcpConfig.httpServer.statusStopped')}</Tag>
            }
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space wrap>
            {editingPort ? (
              <Space>
                <Text>{t('mcpConfig.httpServer.port')}</Text>
                <InputNumber
                  min={1025}
                  max={65535}
                  value={portValue}
                  onChange={(val) => setPortValue(val || 9615)}
                  style={{ width: 100 }}
                />
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  size="small"
                  loading={updatingPort}
                  onClick={handleUpdatePort}
                >
                  {t('mcpConfig.httpServer.savePort')}
                </Button>
                <Button size="small" onClick={() => setEditingPort(false)}>{t('mcpConfig.httpServer.cancel')}</Button>
              </Space>
            ) : (
              <Space>
                <Text>{t('mcpConfig.httpServer.port')}{mcpStatus?.port || 9615}</Text>
                <Button
                  icon={<EditOutlined />}
                  size="small"
                  onClick={() => setEditingPort(true)}
                >
                  {t('mcpConfig.httpServer.editPort')}
                </Button>
              </Space>
            )}
          </Space>

          {hasServerError && (
            <Alert
              message={t('mcpConfig.httpServer.errorTitle')}
              description={hasServerError}
              type="error"
              showIcon
            />
          )}

          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={startingServer}
            onClick={handleStartServer}
            disabled={isServerRunning}
          >
            {isServerRunning ? t('mcpConfig.httpServer.buttonRunning') : t('mcpConfig.httpServer.buttonStart')}
          </Button>
        </Space>
      </Card>

      {/* Claude Desktop 配置 */}
      <Card
        size="small"
        title={
          <Space>
            <DesktopOutlined />
            <span>{t('mcpConfig.claudeConfig.title')}</span>
            {isConfigured
              ? <Tag color="success">{t('mcpConfig.claudeConfig.statusConfigured')}</Tag>
              : <Tag color="warning">{t('mcpConfig.claudeConfig.statusNotConfigured')}</Tag>
            }
          </Space>
        }
        extra={
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={loadMCPStatus}
          >
            {t('mcpConfig.claudeConfig.refresh')}
          </Button>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button
            icon={<DesktopOutlined />}
            loading={configuringClaude}
            onClick={handleConfigureClaude}
          >
            {isConfigured ? t('mcpConfig.claudeConfig.buttonReconfigure') : t('mcpConfig.claudeConfig.buttonConfigure')}
          </Button>

          {isConfigured && (
            <Text type="secondary" style={{ fontSize: 12 }} copyable>
              {configPaths?.claudeConfigPath || '加载中...'}
            </Text>
          )}

          {!isConfigured && (
            <Alert
              message={t('mcpConfig.claudeConfig.needsRestartInfo')}
              type="info"
              showIcon
            />
          )}
        </Space>
      </Card>

      {/* 使用指南 */}
      <Card
        size="small"
        title={
          <Space>
            <FileTextOutlined />
            <span>{t('mcpConfig.instructions.title')}</span>
          </Space>
        }
        extra={
          <Button
            icon={<CopyOutlined />}
            size="small"
            onClick={handleCopyInstructions}
          >
            {t('mcpConfig.instructions.copy')}
          </Button>
        }
      >
        <Collapse ghost>
          <Panel header={t('mcpConfig.instructions.viewFull')} key="1">
            <pre style={{
              fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
              fontSize: 12,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '40vh',
              overflow: 'auto',
              background: '#f5f5f5',
              padding: 12,
              borderRadius: 4,
              margin: 0
            }}>
              {INSTRUCTIONS_TEXT}
            </pre>
          </Panel>
        </Collapse>
      </Card>
    </Space>
  )
}
