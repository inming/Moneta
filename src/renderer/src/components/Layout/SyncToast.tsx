import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'

const TOAST_DURATION_S = 6

function isOnSyncSettings(pathname: string, search: string): boolean {
  if (pathname !== '/settings') return false
  return new URLSearchParams(search).get('tab') === 'sync'
}

/**
 * Renders nothing — just listens for sync:event and surfaces background
 * conflict/error outcomes as a global toast so the user notices auto-sync
 * problems without forcing a modal. The SyncManager page handles its own
 * modals for user-initiated sync runs.
 */
export default function SyncToast(): null {
  const { t } = useTranslation('navigation')
  const navigate = useNavigate()
  const location = useLocation()
  const lastShownKey = useRef<string>('')

  useEffect(() => {
    const off = window.api.sync.onEvent((s) => {
      if (s.phase !== 'conflict' && s.phase !== 'error') return
      // Don't double-notify when user is already on the sync settings page
      if (isOnSyncSettings(location.pathname, location.search)) return
      const key = `${s.phase}|${s.message}|${s.lastSyncAt ?? ''}`
      if (key === lastShownKey.current) return
      lastShownKey.current = key

      const titleKey = s.phase === 'conflict' ? 'syncToast.conflict' : 'syncToast.error'
      const content = (
        <span>
          {t(titleKey)}
          {s.message ? ` — ${s.message}` : ''}{' '}
          <a
            onClick={(e) => {
              e.preventDefault()
              navigate('/settings?tab=sync')
            }}
            style={{ marginLeft: 8 }}
          >
            {t('syncToast.viewDetails')}
          </a>
        </span>
      )
      if (s.phase === 'conflict') {
        message.warning(content, TOAST_DURATION_S)
      } else {
        message.error(content, TOAST_DURATION_S)
      }
    })
    return off
  }, [location.pathname, location.search, navigate, t])

  return null
}
