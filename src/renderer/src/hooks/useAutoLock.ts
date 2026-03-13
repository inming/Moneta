import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../stores/auth.store'

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'click'
]

export function useAutoLock(): void {
  const lock = useAuthStore((s) => s.lock)
  const autoLockMinutes = useAuthStore((s) => s.autoLockMinutes)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetTimer = useCallback(() => {
    if (autoLockMinutes <= 0) return

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => {
      lock()
    }, autoLockMinutes * 60 * 1000)
  }, [autoLockMinutes, lock])

  useEffect(() => {
    if (autoLockMinutes <= 0) return

    resetTimer()

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true })
    }

    return (): void => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer)
      }
    }
  }, [autoLockMinutes, resetTimer])
}
