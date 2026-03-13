import { useRef, useCallback, useState } from 'react'
import { Typography, message } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import PinInput, { type PinInputRef } from './PinInput'
import { useAuthStore } from '../../stores/auth.store'

const { Title, Text } = Typography

type Step = 'create' | 'confirm'

export default function PinSetup(): React.JSX.Element {
  const pinRef = useRef<PinInputRef>(null)
  const { setHasPIN, unlock } = useAuthStore()
  const [step, setStep] = useState<Step>('create')
  const [firstPin, setFirstPin] = useState('')
  const [error, setError] = useState('')

  const handleCreate = useCallback((pin: string) => {
    setFirstPin(pin)
    setStep('confirm')
    setError('')
    // Wait for state update then clear and focus
    setTimeout(() => {
      pinRef.current?.clear()
      pinRef.current?.focus()
    }, 100)
  }, [])

  const handleConfirm = useCallback(
    async (pin: string) => {
      if (pin !== firstPin) {
        setError('两次输入的 PIN 码不一致，请重新设置')
        pinRef.current?.shake()
        setTimeout(() => {
          pinRef.current?.clear()
          setStep('create')
          setFirstPin('')
        }, 500)
        return
      }

      try {
        await window.api.auth.setPIN(pin)
        setHasPIN(true)
        unlock()
        message.success('PIN 码设置成功')
      } catch {
        setError('设置失败，请重试')
        pinRef.current?.shake()
        setTimeout(() => {
          pinRef.current?.clear()
          setStep('create')
          setFirstPin('')
        }, 500)
      }
    },
    [firstPin, setHasPIN, unlock]
  )

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        userSelect: 'none'
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 48,
          borderRadius: 16,
          background: 'rgba(255, 255, 255, 0.95)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)'
        }}
      >
        <LockOutlined style={{ fontSize: 48, color: '#1677ff', marginBottom: 16 }} />
        <Title level={3} style={{ marginBottom: 8 }}>
          Moneta
        </Title>
        <Text type="secondary" style={{ marginBottom: 32 }}>
          {step === 'create' ? '请设置 4 位数字 PIN 码' : '请再次输入确认'}
        </Text>

        <PinInput
          ref={pinRef}
          onComplete={step === 'create' ? handleCreate : handleConfirm}
        />

        <div style={{ height: 32, marginTop: 16, textAlign: 'center' }}>
          {error ? <Text type="danger">{error}</Text> : null}
        </div>
      </div>
    </div>
  )
}
