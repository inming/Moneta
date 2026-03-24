import { useRef, useCallback, useState, useEffect } from 'react'
import { Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import PinInput, { type PinInputRef } from './PinInput'
import { useAuthStore } from '../../stores/auth.store'

const { Title, Text } = Typography

export default function LockScreen(): React.JSX.Element {
  const { t } = useTranslation('auth')
  const pinRef = useRef<PinInputRef>(null)
  const { lockedUntilMs, setRemainingAttempts, setLockedUntilMs, unlock } = useAuthStore()
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(0)

  const isLockedOut = lockedUntilMs !== null && lockedUntilMs > Date.now()

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockedUntilMs) return

    const updateCountdown = (): void => {
      const remaining = Math.ceil((lockedUntilMs - Date.now()) / 1000)
      if (remaining <= 0) {
        setCountdown(0)
        setLockedUntilMs(null)
        setRemainingAttempts(5)
        setError('')
        pinRef.current?.clear()
        pinRef.current?.focus()
      } else {
        setCountdown(remaining)
      }
    }

    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)
    return (): void => clearInterval(timer)
  }, [lockedUntilMs, setLockedUntilMs, setRemainingAttempts])

  const handleVerify = useCallback(
    async (pin: string) => {
      try {
        const result = await window.api.auth.verifyPIN(pin)
        if (result.success) {
          unlock()
        } else {
          setRemainingAttempts(result.remainingAttempts)
          if (result.lockedUntilMs) {
            setLockedUntilMs(result.lockedUntilMs)
            setError(t('lockScreen.errors.tooManyAttempts'))
          } else {
            setError(t('lockScreen.errors.wrongPin', { count: result.remainingAttempts }))
          }
          pinRef.current?.shake()
          setTimeout(() => pinRef.current?.clear(), 500)
        }
      } catch {
        setError(t('lockScreen.errors.verifyFailed'))
        pinRef.current?.shake()
        setTimeout(() => pinRef.current?.clear(), 500)
      }
    },
    [unlock, setRemainingAttempts, setLockedUntilMs, t]
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
          {t('lockScreen.title')}
        </Text>

        <PinInput ref={pinRef} onComplete={handleVerify} disabled={isLockedOut} />

        <div style={{ height: 32, marginTop: 16, textAlign: 'center' }}>
          {isLockedOut && countdown > 0 ? (
            <Text type="danger">{t('lockScreen.lockedMessage', { seconds: countdown })}</Text>
          ) : error ? (
            <Text type="danger">{error}</Text>
          ) : null}
        </div>
      </div>
    </div>
  )
}
