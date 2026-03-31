import React, { useState } from 'react'
import { Card, Radio, Button, Space, message } from 'antd'
import type { RadioChangeEvent } from 'antd'
import { useTranslation } from 'react-i18next'
import { useThemeStore } from '../../stores/theme.store'
import type { ThemeMode } from '../../../../shared/types'

export default function ThemeManager(): React.JSX.Element {
  const { t } = useTranslation(['settings', 'common'])
  const { mode, setMode } = useThemeStore()
  const [selectedMode, setSelectedMode] = useState<ThemeMode>(mode)
  const [loading, setLoading] = useState(false)

  const handleChange = (e: RadioChangeEvent) => {
    setSelectedMode(e.target.value)
  }

  const handleSave = async () => {
    if (selectedMode === mode) {
      message.info(t('settings:appearance.noChange'))
      return
    }

    setLoading(true)
    try {
      await setMode(selectedMode)
      message.success(t('settings:appearance.saveSuccess'))
    } catch (error) {
      message.error(t('settings:appearance.saveFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title={t('settings:appearance.title')} bordered={false}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>
            {t('settings:appearance.theme')}
          </div>
          <Radio.Group value={selectedMode} onChange={handleChange}>
            <Space direction="vertical">
              <Radio value="system">{t('settings:appearance.system')}</Radio>
              <Radio value="light">{t('settings:appearance.light')}</Radio>
              <Radio value="dark">{t('settings:appearance.dark')}</Radio>
            </Space>
          </Radio.Group>
        </div>
        <Button type="primary" onClick={handleSave} loading={loading}>
          {t('common:buttons.save')}
        </Button>
      </Space>
    </Card>
  )
}
