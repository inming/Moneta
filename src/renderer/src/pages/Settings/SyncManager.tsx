import { useEffect, useState, useCallback } from 'react'
import {
  Card,
  Button,
  Typography,
  message,
  Space,
  Form,
  Input,
  Select,
  Switch,
  Modal,
  Alert,
  Tag,
  Descriptions,
  Radio
} from 'antd'
import { CloudUploadOutlined, CloudDownloadOutlined, SyncOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type {
  S3Provider,
  SyncConfig,
  SyncStatus,
  SyncRunResult,
  ConflictInfo,
  ConflictResolution
} from '../../../../shared/types'

type SetupMode = 'initial' | 'join' | null

const { Text } = Typography

const PROVIDER_PRESETS: Record<
  S3Provider,
  { endpoint: string; region: string; pathStyle: boolean }
> = {
  aws: { endpoint: 'https://s3.amazonaws.com', region: 'us-east-1', pathStyle: false },
  aliyun: { endpoint: 'https://oss-cn-hangzhou.aliyuncs.com', region: 'oss-cn-hangzhou', pathStyle: false },
  custom: { endpoint: '', region: 'us-east-1', pathStyle: true }
}

interface ConfigFormValues {
  provider: S3Provider
  endpoint: string
  region: string
  bucket: string
  prefix: string
  pathStyle: boolean
  accessKeyId: string
  secretAccessKey: string
}

export default function SyncManager(): React.JSX.Element {
  const { t } = useTranslation('settings')
  const [form] = Form.useForm<ConfigFormValues>()
  const [config, setConfig] = useState<SyncConfig | null>(null)
  const [safeStorageAvailable, setSafeStorageAvailable] = useState(true)
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [setupMode, setSetupMode] = useState<SetupMode>(null)
  const [passphrase, setPassphrase] = useState('')
  const [passphraseConfirm, setPassphraseConfirm] = useState('')
  const [joinDirection, setJoinDirection] = useState<'use-remote' | 'use-local'>('use-remote')

  const reload = useCallback(async () => {
    const r = await window.api.sync.getConfig()
    setConfig(r.config)
    setSafeStorageAvailable(r.safeStorageAvailable)
    form.setFieldsValue({
      provider: r.config.s3.provider,
      endpoint: r.config.s3.endpoint,
      region: r.config.s3.region,
      bucket: r.config.s3.bucket,
      prefix: r.config.s3.prefix,
      pathStyle: r.config.s3.pathStyle,
      accessKeyId: '',
      secretAccessKey: ''
    })
    const st = await window.api.sync.getStatus()
    setStatus(st)
  }, [form])

  useEffect(() => {
    reload()
    const off = window.api.sync.onEvent((s) => setStatus(s))
    return off
  }, [reload])

  const handleProviderChange = (provider: S3Provider): void => {
    const preset = PROVIDER_PRESETS[provider]
    form.setFieldsValue({
      provider,
      endpoint: preset.endpoint,
      region: preset.region,
      pathStyle: preset.pathStyle
    })
  }

  const handleSave = async (): Promise<void> => {
    const values = await form.validateFields()
    setBusy(true)
    try {
      await window.api.sync.saveConfig({
        provider: values.provider,
        endpoint: values.endpoint,
        region: values.region,
        bucket: values.bucket,
        prefix: values.prefix,
        pathStyle: values.pathStyle
      })
      if (values.accessKeyId && values.secretAccessKey) {
        await window.api.sync.setCredentials({
          accessKeyId: values.accessKeyId,
          secretAccessKey: values.secretAccessKey
        })
      }
      message.success(t('syncManager.messages.saved'))
      await reload()
    } catch (e) {
      const msg = (e as Error).message
      if (msg.includes('SAFE_STORAGE_UNAVAILABLE')) {
        message.error(t('syncManager.messages.safeStorageUnavailable'))
      } else {
        message.error(`${t('syncManager.messages.saveFailed')}: ${msg}`)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleClearCredentials = async (): Promise<void> => {
    Modal.confirm({
      title: t('syncManager.confirm.clearCredentials.title'),
      content: t('syncManager.confirm.clearCredentials.content'),
      okText: t('syncManager.confirm.clearCredentials.okText'),
      cancelText: t('syncManager.buttons.cancel'),
      okType: 'danger',
      onOk: async () => {
        await window.api.sync.clearCredentials()
        message.success(t('syncManager.messages.credentialsCleared'))
        await reload()
      }
    })
  }

  const handleTest = async (): Promise<void> => {
    setBusy(true)
    try {
      const r = await window.api.sync.test()
      if (r.ok) {
        message.success(t('syncManager.messages.testSuccess'))
      } else {
        Modal.error({
          title: t('syncManager.messages.testFailed'),
          content: r.message
        })
      }
    } finally {
      setBusy(false)
    }
  }

  const handleSyncNow = async (): Promise<void> => {
    setBusy(true)
    try {
      const r: SyncRunResult = await window.api.sync.syncNow()
      if (r.outcome === 'conflict' && r.conflict) {
        setConflict(r.conflict)
      } else if (r.outcome === 'needs-setup-initial') {
        setSetupMode('initial')
      } else if (r.outcome === 'needs-setup-join') {
        setSetupMode('join')
      } else if (r.outcome === 'error') {
        Modal.error({
          title: t('syncManager.messages.syncFailed'),
          content: r.message
        })
      } else if (r.outcome === 'noop') {
        message.info(t('syncManager.messages.noop'))
      } else {
        message.success(r.message)
      }
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const closeSetupModal = (): void => {
    setSetupMode(null)
    setPassphrase('')
    setPassphraseConfirm('')
    setJoinDirection('use-remote')
  }

  const callSetupApi = async (): Promise<SyncRunResult> => {
    if (setupMode === 'initial') {
      return window.api.sync.setupInitial({ passphrase })
    }
    if (joinDirection === 'use-local') {
      return window.api.sync.setupAdoptLocal({ passphrase })
    }
    return window.api.sync.setupJoin({ passphrase })
  }

  const handleSetupSubmit = async (): Promise<void> => {
    if (!setupMode) return
    if (passphrase.length < 8) {
      message.error(t('syncManager.messages.passphraseTooShort'))
      return
    }
    if (setupMode === 'initial' && passphrase !== passphraseConfirm) {
      message.error(t('syncManager.messages.passphraseMismatch'))
      return
    }
    setBusy(true)
    try {
      const result = await callSetupApi()
      if (result.outcome === 'error') {
        if (result.error === 'wrong-passphrase') {
          message.error(t('syncManager.messages.wrongPassphrase'))
        } else {
          Modal.error({
            title:
              setupMode === 'initial'
                ? t('syncManager.messages.setupInitialFailed')
                : t('syncManager.messages.setupJoinFailed'),
            content: result.message
          })
        }
      } else {
        message.success(result.message)
        closeSetupModal()
      }
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const handleResetCloud = (): void => {
    Modal.confirm({
      title: t('syncManager.confirm.resetCloud.title'),
      content: t('syncManager.confirm.resetCloud.content'),
      okText: t('syncManager.confirm.resetCloud.okText'),
      cancelText: t('syncManager.buttons.cancel'),
      okType: 'danger',
      onOk: async () => {
        setBusy(true)
        try {
          const r = await window.api.sync.resetCloud()
          if (r.ok) {
            message.success(r.message)
          } else {
            message.error(r.message)
          }
          await reload()
        } finally {
          setBusy(false)
        }
      }
    })
  }

  const handleResolve = async (resolution: ConflictResolution): Promise<void> => {
    setBusy(true)
    setConflict(null)
    try {
      const r = await window.api.sync.resolveConflict(resolution)
      if (r.outcome === 'error') {
        Modal.error({
          title: t('syncManager.messages.syncFailed'),
          content: r.message
        })
      } else if (r.outcome !== 'aborted' && r.outcome !== 'noop') {
        message.success(r.message)
      }
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const phaseColor: Record<string, string> = {
    idle: 'default',
    preparing: 'processing',
    'fetching-manifest': 'processing',
    uploading: 'processing',
    downloading: 'processing',
    finalizing: 'processing',
    success: 'success',
    error: 'error',
    conflict: 'warning'
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {!safeStorageAvailable && (
          <Alert
            type="error"
            showIcon
            message={t('syncManager.alerts.safeStorageMissing.title')}
            description={t('syncManager.alerts.safeStorageMissing.description')}
          />
        )}

        <Card title={t('syncManager.statusCard.title')}>
          {status && (
            <Descriptions column={1} size="small">
              <Descriptions.Item label={t('syncManager.statusCard.phase')}>
                <Tag color={phaseColor[status.phase] ?? 'default'}>
                  {t(`syncManager.phases.${status.phase}`)}
                </Tag>
                {status.message && <Text style={{ marginLeft: 8 }}>{status.message}</Text>}
              </Descriptions.Item>
              <Descriptions.Item label={t('syncManager.statusCard.lastSyncAt')}>
                {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : '—'}
              </Descriptions.Item>
              {status.lastSyncError && (
                <Descriptions.Item label={t('syncManager.statusCard.lastError')}>
                  <Text type="danger">{status.lastSyncError}</Text>
                </Descriptions.Item>
              )}
              {config?.cursor && (
                <Descriptions.Item label={t('syncManager.statusCard.remoteVersion')}>
                  v{config.cursor.manifestVersion}
                </Descriptions.Item>
              )}
              <Descriptions.Item label={t('syncManager.statusCard.deviceId')}>
                <Text code>{config?.deviceId ?? '—'}</Text>
              </Descriptions.Item>
            </Descriptions>
          )}
          <Space style={{ marginTop: 16 }} wrap>
            <Button
              type="primary"
              icon={<SyncOutlined />}
              onClick={handleSyncNow}
              loading={busy}
              disabled={!safeStorageAvailable || !config?.hasCredentials || !config?.s3.bucket}
            >
              {t('syncManager.buttons.syncNow')}
            </Button>
            <Button
              icon={<CloudUploadOutlined />}
              onClick={handleTest}
              loading={busy}
              disabled={!safeStorageAvailable || !config?.hasCredentials || !config?.s3.bucket}
            >
              {t('syncManager.buttons.test')}
            </Button>
            <Button
              danger
              onClick={handleResetCloud}
              loading={busy}
              disabled={!safeStorageAvailable || !config?.hasCredentials || !config?.s3.bucket}
            >
              {t('syncManager.buttons.resetCloud')}
            </Button>
          </Space>
        </Card>

        <Card title={t('syncManager.configCard.title')}>
          <Form
            form={form}
            layout="vertical"
            disabled={!safeStorageAvailable || busy}
            initialValues={{
              provider: 'aws',
              endpoint: PROVIDER_PRESETS.aws.endpoint,
              region: PROVIDER_PRESETS.aws.region,
              bucket: '',
              prefix: 'moneta/',
              pathStyle: false,
              accessKeyId: '',
              secretAccessKey: ''
            }}
          >
            <Form.Item
              label={t('syncManager.fields.provider')}
              name="provider"
              rules={[{ required: true }]}
            >
              <Select
                onChange={handleProviderChange}
                options={[
                  { value: 'aws', label: 'AWS S3' },
                  { value: 'aliyun', label: t('syncManager.providers.aliyun') },
                  { value: 'custom', label: t('syncManager.providers.custom') }
                ]}
              />
            </Form.Item>
            <Form.Item
              label={t('syncManager.fields.endpoint')}
              name="endpoint"
              rules={[{ required: true, message: t('syncManager.fields.endpointRequired') }]}
            >
              <Input placeholder="https://s3.example.com" />
            </Form.Item>
            <Form.Item label={t('syncManager.fields.region')} name="region">
              <Input />
            </Form.Item>
            <Form.Item
              label={t('syncManager.fields.bucket')}
              name="bucket"
              rules={[{ required: true, message: t('syncManager.fields.bucketRequired') }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label={t('syncManager.fields.prefix')}
              name="prefix"
              extra={t('syncManager.fields.prefixHint')}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label={t('syncManager.fields.pathStyle')}
              name="pathStyle"
              valuePropName="checked"
              extra={t('syncManager.fields.pathStyleHint')}
            >
              <Switch />
            </Form.Item>
            <Form.Item
              label={t('syncManager.fields.accessKey')}
              name="accessKeyId"
              extra={
                config?.hasCredentials
                  ? t('syncManager.fields.credentialsExistHint')
                  : t('syncManager.fields.credentialsNewHint')
              }
            >
              <Input
                placeholder={
                  config?.hasCredentials
                    ? t('syncManager.fields.keepUnchanged')
                    : t('syncManager.fields.accessKeyPlaceholder')
                }
                autoComplete="off"
              />
            </Form.Item>
            <Form.Item label={t('syncManager.fields.secretKey')} name="secretAccessKey">
              <Input.Password
                placeholder={
                  config?.hasCredentials
                    ? t('syncManager.fields.keepUnchanged')
                    : t('syncManager.fields.secretKeyPlaceholder')
                }
                autoComplete="off"
              />
            </Form.Item>
            <Space>
              <Button type="primary" onClick={handleSave} loading={busy}>
                {t('syncManager.buttons.save')}
              </Button>
              {config?.hasCredentials && (
                <Button danger onClick={handleClearCredentials}>
                  {t('syncManager.buttons.clearCredentials')}
                </Button>
              )}
            </Space>
          </Form>
        </Card>

        <Modal
          open={!!setupMode}
          title={
            setupMode === 'initial'
              ? t('syncManager.setup.initialTitle')
              : t('syncManager.setup.joinTitle')
          }
          onCancel={closeSetupModal}
          onOk={handleSetupSubmit}
          okText={t('syncManager.buttons.confirm')}
          cancelText={t('syncManager.buttons.cancel')}
          confirmLoading={busy}
          maskClosable={false}
          destroyOnClose
        >
          {setupMode && (
            <div>
              <Alert
                type={setupMode === 'initial' ? 'info' : 'warning'}
                showIcon
                message={
                  setupMode === 'initial'
                    ? t('syncManager.setup.initialWarning')
                    : joinDirection === 'use-remote'
                      ? t('syncManager.setup.joinWarning')
                      : t('syncManager.setup.adoptLocalWarning')
                }
                style={{ marginBottom: 16 }}
              />
              <Form layout="vertical">
                {setupMode === 'join' && (
                  <Form.Item
                    label={t('syncManager.setup.direction')}
                    extra={t('syncManager.setup.directionHint')}
                  >
                    <Radio.Group
                      value={joinDirection}
                      onChange={(e) => setJoinDirection(e.target.value)}
                    >
                      <Space direction="vertical">
                        <Radio value="use-remote">
                          {t('syncManager.setup.directionUseRemote')}
                        </Radio>
                        <Radio value="use-local">
                          {t('syncManager.setup.directionUseLocal')}
                        </Radio>
                      </Space>
                    </Radio.Group>
                  </Form.Item>
                )}
                <Form.Item
                  label={t('syncManager.setup.passphrase')}
                  extra={
                    setupMode === 'initial'
                      ? t('syncManager.setup.passphraseHintInitial')
                      : joinDirection === 'use-remote'
                        ? t('syncManager.setup.passphraseHintJoin')
                        : t('syncManager.setup.passphraseHintAdoptLocal')
                  }
                  required
                >
                  <Input.Password
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder={t('syncManager.setup.passphrasePlaceholder')}
                    autoFocus
                  />
                </Form.Item>
                {setupMode === 'initial' && (
                  <Form.Item label={t('syncManager.setup.passphraseConfirm')} required>
                    <Input.Password
                      value={passphraseConfirm}
                      onChange={(e) => setPassphraseConfirm(e.target.value)}
                      placeholder={t('syncManager.setup.passphraseConfirmPlaceholder')}
                    />
                  </Form.Item>
                )}
              </Form>
            </div>
          )}
        </Modal>

        <Modal
          open={!!conflict}
          title={t('syncManager.conflict.title')}
          onCancel={() => handleResolve('cancel')}
          footer={null}
          maskClosable={false}
          closable={!busy}
        >
          {conflict && (
            <div>
              <Alert
                type="warning"
                showIcon
                message={t('syncManager.conflict.warning')}
                style={{ marginBottom: 16 }}
              />
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label={t('syncManager.conflict.localChangedAt')}>
                  {conflict.localChangedAt
                    ? new Date(conflict.localChangedAt).toLocaleString()
                    : '—'}
                </Descriptions.Item>
                <Descriptions.Item label={t('syncManager.conflict.remoteWriter')}>
                  {conflict.remote.writerDeviceId}
                </Descriptions.Item>
                <Descriptions.Item label={t('syncManager.conflict.remoteWrittenAt')}>
                  {new Date(conflict.remote.writtenAt).toLocaleString()}
                </Descriptions.Item>
                <Descriptions.Item label={t('syncManager.conflict.remoteVersion')}>
                  v{conflict.remote.version}
                </Descriptions.Item>
              </Descriptions>
              <Space style={{ marginTop: 16, width: '100%', justifyContent: 'flex-end' }}>
                <Button onClick={() => handleResolve('cancel')}>
                  {t('syncManager.buttons.cancel')}
                </Button>
                <Button icon={<CloudUploadOutlined />} onClick={() => handleResolve('use-local')}>
                  {t('syncManager.buttons.useLocal')}
                </Button>
                <Button
                  type="primary"
                  icon={<CloudDownloadOutlined />}
                  onClick={() => handleResolve('use-remote')}
                >
                  {t('syncManager.buttons.useRemote')}
                </Button>
              </Space>
            </div>
          )}
        </Modal>
      </Space>
    </div>
  )
}
