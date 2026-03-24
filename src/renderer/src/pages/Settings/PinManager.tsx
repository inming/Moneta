import { useRef, useState, useCallback } from 'react'
import { Card, Button, Typography, message, Steps, Select, Space } from 'antd'
import { LockOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons'
import PinInput, { type PinInputRef } from '../LockScreen/PinInput'
import { useAuthStore } from '../../stores/auth.store'
import { useTranslation } from 'react-i18next'

const { Text } = Typography

type ChangePinStep = 'idle' | 'current' | 'new' | 'confirm'

export default function PinManager(): React.JSX.Element {
  const { t } = useTranslation('settings')
  const pinRef = useRef<PinInputRef>(null)
  const [step, setStep] = useState<ChangePinStep>('idle')
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [error, setError] = useState('')
  const { autoLockMinutes, setAutoLockMinutes } = useAuthStore()

  // 自动锁屏选项（需要在组件内部定义以使用 t()）
  const AUTO_LOCK_OPTIONS = [
    { value: 5, label: t('pinManager.autoLock.minutes5') },
    { value: 10, label: t('pinManager.autoLock.minutes10') },
    { value: 15, label: t('pinManager.autoLock.minutes15') },
    { value: 30, label: t('pinManager.autoLock.minutes30') },
    { value: 60, label: t('pinManager.autoLock.hour1') },
    { value: 0, label: t('pinManager.autoLock.disabled') }
  ]

  const reset = useCallback(() => {
    setStep('idle')
    setCurrentPin('')
    setNewPin('')
    setError('')
  }, [])

  const handleStartChange = useCallback(() => {
    setStep('current')
    setError('')
    setTimeout(() => pinRef.current?.focus(), 100)
  }, [])

  const handleCurrentPin = useCallback((pin: string) => {
    setCurrentPin(pin)
    setStep('new')
    setError('')
    setTimeout(() => {
      pinRef.current?.clear()
      pinRef.current?.focus()
    }, 100)
  }, [])

  const handleNewPin = useCallback((pin: string) => {
    setNewPin(pin)
    setStep('confirm')
    setError('')
    setTimeout(() => {
      pinRef.current?.clear()
      pinRef.current?.focus()
    }, 100)
  }, [])

  const handleConfirmPin = useCallback(
    async (pin: string) => {
      if (pin !== newPin) {
        setError(t('pinManager.messages.mismatch'))
        pinRef.current?.shake()
        setTimeout(() => {
          pinRef.current?.clear()
          setStep('new')
          setNewPin('')
        }, 500)
        return
      }

      try {
        const result = await window.api.auth.changePIN(currentPin, pin)
        if (result.success) {
          message.success(t('pinManager.messages.changeSuccess'))
          reset()
        } else {
          setError(t('pinManager.messages.currentPinFailed'))
          pinRef.current?.shake()
          setTimeout(() => {
            pinRef.current?.clear()
            setStep('current')
            setCurrentPin('')
            setNewPin('')
          }, 500)
        }
      } catch {
        setError(t('pinManager.messages.changeFailed'))
        pinRef.current?.shake()
        setTimeout(() => pinRef.current?.clear(), 500)
      }
    },
    [newPin, currentPin, reset, t]
  )

  const handleAutoLockChange = useCallback(
    async (minutes: number) => {
      try {
        await window.api.auth.setAutoLockMinutes(minutes)
        setAutoLockMinutes(minutes)
        message.success(t('pinManager.messages.autoLockUpdated'))
      } catch {
        message.error(t('pinManager.messages.autoLockFailed'))
      }
    },
    [setAutoLockMinutes, t]
  )

  const stepLabels: Record<ChangePinStep, string> = {
    idle: '',
    current: t('pinManager.prompts.current'),
    new: t('pinManager.prompts.new'),
    confirm: t('pinManager.prompts.confirm')
  }

  const currentStepIndex = step === 'current' ? 0 : step === 'new' ? 1 : step === 'confirm' ? 2 : -1

  const handleComplete =
    step === 'current' ? handleCurrentPin : step === 'new' ? handleNewPin : handleConfirmPin

  return (
    <div style={{ maxWidth: 480 }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <CheckCircleOutlined style={{ fontSize: 20, color: '#52c41a', marginRight: 8 }} />
            <Text strong>{t('pinManager.title')}</Text>
          </div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
            {t('pinManager.description')}
          </Text>

          {step === 'idle' ? (
            <Button icon={<LockOutlined />} onClick={handleStartChange}>
              {t('pinManager.buttons.changePin')}
            </Button>
          ) : (
            <div>
              <Steps
                size="small"
                current={currentStepIndex}
                items={[
                  { title: t('pinManager.steps.verifyCurrent') },
                  { title: t('pinManager.steps.enterNew') },
                  { title: t('pinManager.steps.confirmNew') }
                ]}
                style={{ marginBottom: 24 }}
              />
              <div style={{ textAlign: 'center' }}>
                <Text style={{ display: 'block', marginBottom: 16 }}>{stepLabels[step]}</Text>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <PinInput ref={pinRef} onComplete={handleComplete} />
                </div>
                {error && (
                  <Text type="danger" style={{ display: 'block', marginBottom: 16 }}>
                    {error}
                  </Text>
                )}
                <Button size="small" onClick={reset}>
                  {t('pinManager.buttons.cancel')}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <ClockCircleOutlined style={{ fontSize: 20, color: '#1677ff', marginRight: 8 }} />
            <Text strong>{t('pinManager.autoLock.title')}</Text>
          </div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {t('pinManager.autoLock.description')}
          </Text>
          <Select
            value={autoLockMinutes}
            onChange={handleAutoLockChange}
            options={AUTO_LOCK_OPTIONS}
            style={{ width: 160 }}
          />
        </Card>
      </Space>
    </div>
  )
}
