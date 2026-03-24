import React, { useState } from 'react'
import { Card, Radio, Button, Space, message } from 'antd'
import type { RadioChangeEvent } from 'antd'
import { useTranslation } from 'react-i18next'
import { useI18nStore } from '../../stores/i18n.store'

export default function LanguageManager(): React.JSX.Element {
  const { t } = useTranslation(['settings', 'common'])
  const { language, setLanguage } = useI18nStore()
  const [selectedLanguage, setSelectedLanguage] = useState(language)
  const [loading, setLoading] = useState(false)

  const handleChange = (e: RadioChangeEvent) => {
    setSelectedLanguage(e.target.value)
  }

  const handleSave = async () => {
    if (selectedLanguage === language) {
      message.info(t('settings:language.noChange'))
      return
    }

    setLoading(true)
    try {
      await setLanguage(selectedLanguage)
      message.success(t('settings:language.saveSuccess'))
    } catch (error) {
      message.error(t('settings:language.saveFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title={t('settings:language.title')} bordered={false}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('settings:language.uiLanguage')}</div>
          <Radio.Group value={selectedLanguage} onChange={handleChange}>
            <Space direction="vertical">
              <Radio value="zh-CN">{t('settings:language.zhCN')}</Radio>
              <Radio value="en-US">{t('settings:language.enUS')}</Radio>
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
