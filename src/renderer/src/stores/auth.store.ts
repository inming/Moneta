import { create } from 'zustand'

interface AuthState {
  initialized: boolean
  hasPIN: boolean
  isLocked: boolean
  remainingAttempts: number
  lockedUntilMs: number | null
  autoLockMinutes: number
  initialize: () => Promise<void>
  lock: () => void
  unlock: () => void
  setHasPIN: (value: boolean) => void
  setRemainingAttempts: (value: number) => void
  setLockedUntilMs: (value: number | null) => void
  setAutoLockMinutes: (value: number) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  initialized: false,
  hasPIN: false,
  isLocked: true,
  remainingAttempts: 5,
  lockedUntilMs: null,
  autoLockMinutes: 30,

  initialize: async (): Promise<void> => {
    const has = await window.api.auth.hasPIN()
    const minutes = await window.api.auth.getAutoLockMinutes()
    set({
      initialized: true,
      hasPIN: has,
      isLocked: has,
      autoLockMinutes: minutes
    })
  },

  lock: (): void => {
    set({ isLocked: true })
  },

  unlock: (): void => {
    set({ isLocked: false, remainingAttempts: 5, lockedUntilMs: null })
  },

  setHasPIN: (value: boolean): void => {
    set({ hasPIN: value })
  },

  setRemainingAttempts: (value: number): void => {
    set({ remainingAttempts: value })
  },

  setLockedUntilMs: (value: number | null): void => {
    set({ lockedUntilMs: value })
  },

  setAutoLockMinutes: (value: number): void => {
    set({ autoLockMinutes: value })
  }
}))
