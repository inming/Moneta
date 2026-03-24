import React, { useState } from 'react'
import { Card, Radio, Button, Space, message } from 'antd'
import type { RadioChangeEvent } from 'antd'
import { useI18nStore } from '../../stores/i18n.store'

export default function LanguageManager(): React.JSX.Element {
  const { language, setLanguage } = useI18nStore()
  const [selectedLanguage, setSelectedLanguage] = useState(language)
  const [loading, setLoading] = useState(false)

  const handleChange = (e: RadioChangeEvent) => {
    setSelectedLanguage(e.target.value)
  }

  const handleSave = async () => {
    if (selectedLanguage === language) {
      message.info('语言未变更')
      return
    }

    setLoading(true)
    try {
      await setLanguage(selectedLanguage)
      message.success('语言已切换')
    } catch (error) {
      message.error('语言切换失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title="语言设置" bordered={false}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>界面语言</div>
          <Radio.Group value={selectedLanguage} onChange={handleChange}>
            <Space direction="vertical">
              <Radio value="zh-CN">简体中文</Radio>
              <Radio value="en-US">English</Radio>
            </Space>
          </Radio.Group>
        </div>

        <Button type="primary" onClick={handleSave} loading={loading}>
          保存
        </Button>
      </Space>
    </Card>
  )
}
