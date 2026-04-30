import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Tooltip } from 'antd'
import {
  SyncOutlined,
  CheckCircleFilled,
  WarningFilled,
  CloseCircleFilled
} from '@ant-design/icons'
import type { SyncStatus, SyncPhase } from '@shared/types'

const SUCCESS_FADE_MS = 4000

const ACTIVE_PHASES: ReadonlySet<SyncPhase> = new Set([
  'preparing',
  'fetching-manifest',
  'uploading',
  'downloading',
  'finalizing'
])

export default function SyncIndicator(): React.JSX.Element | null {
  const { t } = useTranslation('navigation')
  const navigate = useNavigate()
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [hasCursor, setHasCursor] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let mounted = true

    void window.api.sync.getConfig().then(({ config }) => {
      if (mounted) setHasCursor(config.cursor !== null)
    })
    void window.api.sync.getStatus().then((s) => {
      if (mounted) setStatus(s)
    })

    const off = window.api.sync.onEvent((s) => {
      setStatus(s)
      if (s.phase === 'success') {
        setShowSuccess(true)
        if (successTimer.current) clearTimeout(successTimer.current)
        successTimer.current = setTimeout(() => setShowSuccess(false), SUCCESS_FADE_MS)
      }
      // After any sync run that mutates cursor (initial-uploaded / downloaded),
      // refresh the cursor flag so the indicator becomes visible.
      if (s.phase === 'success' || s.phase === 'idle') {
        void window.api.sync.getConfig().then(({ config }) => setHasCursor(config.cursor !== null))
      }
    })

    return () => {
      mounted = false
      off()
      if (successTimer.current) clearTimeout(successTimer.current)
    }
  }, [])

  if (!status || !hasCursor) return null

  const phase = status.phase
  const isActive = ACTIVE_PHASES.has(phase)
  const isError = phase === 'error' || !!status.lastSyncError
  const isConflict = phase === 'conflict'
  const renderSuccess = showSuccess && phase === 'success'

  if (!isActive && !isError && !isConflict && !renderSuccess) return null

  let icon: React.ReactNode
  let color = ''
  let tooltipKey = ''
  if (isActive) {
    icon = <SyncOutlined spin />
    color = 'var(--ant-color-primary, #1677ff)'
    tooltipKey = `syncIndicator.phases.${phase}`
  } else if (isConflict) {
    icon = <WarningFilled />
    color = '#faad14'
    tooltipKey = 'syncIndicator.phases.conflict'
  } else if (isError) {
    icon = <CloseCircleFilled />
    color = '#ff4d4f'
    tooltipKey = 'syncIndicator.phases.error'
  } else {
    icon = <CheckCircleFilled />
    color = '#52c41a'
    tooltipKey = 'syncIndicator.phases.success'
  }

  const tooltipText = status.message || t(tooltipKey, { defaultValue: phase })

  return (
    <Tooltip title={tooltipText} placement="right">
      <div
        onClick={() => navigate('/settings?tab=sync')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '8px 12px',
          cursor: 'pointer',
          color,
          borderTop: '1px solid var(--border-color)',
          fontSize: 14,
          userSelect: 'none'
        }}
      >
        {icon}
        <span style={{ fontSize: 12 }}>
          {t(tooltipKey, { defaultValue: '' })}
        </span>
      </div>
    </Tooltip>
  )
}
