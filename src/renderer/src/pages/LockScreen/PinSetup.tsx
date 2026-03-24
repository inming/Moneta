import { useRef, useCallback, useState } from 'react'
import { Typography, message } from 'antd'
import { useTranslation } from 'react-i18next'
import PinInput, { type PinInputRef } from './PinInput'
import { useAuthStore } from '../../stores/auth.store'

const { Title, Text } = Typography

type Step = 'create' | 'confirm'

export default function PinSetup(): React.JSX.Element {
  const { t } = useTranslation('auth')
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
        setError(t('pinSetup.errors.mismatch'))
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
        message.success(t('pinSetup.messages.setupSuccess'))
      } catch {
        setError(t('pinSetup.errors.setupFailed'))
        pinRef.current?.shake()
        setTimeout(() => {
          pinRef.current?.clear()
          setStep('create')
          setFirstPin('')
        }, 500)
      }
    },
    [firstPin, setHasPIN, unlock, t]
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
        <img
          src="./logo.png"
          alt="Moneta"
          style={{ height: 64, width: 'auto', objectFit: 'contain', marginBottom: 16 }}
        />
        <Title level={3} style={{ marginBottom: 8 }}>
          Moneta
        </Title>
        <Text type="secondary" style={{ marginBottom: 32 }}>
          {step === 'create' ? t('pinSetup.prompts.create') : t('pinSetup.prompts.confirm')}
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
