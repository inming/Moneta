import { useRef, useState, useCallback } from 'react'
import { Card, Button, Typography, message, Steps, Select, Space } from 'antd'
import { LockOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons'
import PinInput, { type PinInputRef } from '../LockScreen/PinInput'
import { useAuthStore } from '../../stores/auth.store'

const { Text } = Typography

type ChangePinStep = 'idle' | 'current' | 'new' | 'confirm'

const AUTO_LOCK_OPTIONS = [
  { value: 5, label: '5 分钟' },
  { value: 10, label: '10 分钟' },
  { value: 15, label: '15 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 60, label: '1 小时' },
  { value: 0, label: '不自动锁屏' }
]

export default function PinManager(): React.JSX.Element {
  const pinRef = useRef<PinInputRef>(null)
  const [step, setStep] = useState<ChangePinStep>('idle')
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [error, setError] = useState('')
  const { autoLockMinutes, setAutoLockMinutes } = useAuthStore()

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
        setError('两次输入的新 PIN 码不一致')
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
          message.success('PIN 码修改成功')
          reset()
        } else {
          setError('当前 PIN 码验证失败')
          pinRef.current?.shake()
          setTimeout(() => {
            pinRef.current?.clear()
            setStep('current')
            setCurrentPin('')
            setNewPin('')
          }, 500)
        }
      } catch {
        setError('修改失败，请重试')
        pinRef.current?.shake()
        setTimeout(() => pinRef.current?.clear(), 500)
      }
    },
    [newPin, currentPin, reset]
  )

  const handleAutoLockChange = useCallback(
    async (minutes: number) => {
      try {
        await window.api.auth.setAutoLockMinutes(minutes)
        setAutoLockMinutes(minutes)
        message.success('自动锁屏时间已更新')
      } catch {
        message.error('设置失败')
      }
    },
    [setAutoLockMinutes]
  )

  const stepLabels: Record<ChangePinStep, string> = {
    idle: '',
    current: '请输入当前 PIN 码',
    new: '请输入新 PIN 码',
    confirm: '请再次输入新 PIN 码确认'
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
            <Text strong>PIN 码已启用</Text>
          </div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
            每次启动应用时需要输入 4 位 PIN 码解锁
          </Text>

          {step === 'idle' ? (
            <Button icon={<LockOutlined />} onClick={handleStartChange}>
              修改 PIN 码
            </Button>
          ) : (
            <div>
              <Steps
                size="small"
                current={currentStepIndex}
                items={[
                  { title: '验证当前 PIN' },
                  { title: '输入新 PIN' },
                  { title: '确认新 PIN' }
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
                  取消
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <ClockCircleOutlined style={{ fontSize: 20, color: '#1677ff', marginRight: 8 }} />
            <Text strong>自动锁屏</Text>
          </div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            无操作超过设定时间后自动锁定应用
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
