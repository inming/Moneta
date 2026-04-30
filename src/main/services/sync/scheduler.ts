import { getSyncConfig, isSafeStorageAvailable } from './syncStore'
import { syncNow, isSyncRunning } from './syncEngine'

let timer: ReturnType<typeof setInterval> | null = null
let activeIntervalMs = 0

function shouldSchedule(): { ok: true; intervalMs: number } | { ok: false } {
  if (!isSafeStorageAvailable()) return { ok: false }
  const cfg = getSyncConfig()
  if (!cfg.enabled || !cfg.hasCredentials || cfg.cursor === null) return { ok: false }
  const minutes = cfg.autoSyncIntervalMinutes
  if (!minutes || minutes <= 0) return { ok: false }
  return { ok: true, intervalMs: minutes * 60_000 }
}

async function tick(): Promise<void> {
  if (isSyncRunning()) return
  // Re-check config in case it changed since last tick
  if (!shouldSchedule().ok) {
    stopAutoSyncTimer()
    return
  }
  try {
    const r = await syncNow()
    console.log(`[scheduler] tick result: ${r.outcome} — ${r.message}`)
  } catch (e) {
    console.error('[scheduler] tick error:', (e as Error).message)
  }
}

export function restartAutoSyncTimer(): void {
  const decision = shouldSchedule()
  if (!decision.ok) {
    stopAutoSyncTimer()
    return
  }
  if (timer && activeIntervalMs === decision.intervalMs) return
  stopAutoSyncTimer()
  activeIntervalMs = decision.intervalMs
  timer = setInterval(() => {
    void tick()
  }, decision.intervalMs)
  console.log(`[scheduler] auto-sync timer started (${decision.intervalMs / 60_000} min)`)
}

export function stopAutoSyncTimer(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
    activeIntervalMs = 0
    console.log('[scheduler] auto-sync timer stopped')
  }
}
