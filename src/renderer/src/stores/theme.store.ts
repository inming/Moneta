import { create } from 'zustand'
import type { ThemeMode } from '../../../shared/types'

interface ThemeStore {
  mode: ThemeMode
  isDark: boolean
  initialized: boolean
  initialize: () => Promise<void>
  setMode: (mode: ThemeMode) => Promise<void>
}

let systemThemeHandler: ((e: MediaQueryListEvent) => void) | null = null

function getSystemIsDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function startSystemThemeListener(
  set: (partial: Partial<ThemeStore>) => void,
  get: () => ThemeStore
): void {
  if (systemThemeHandler) return

  systemThemeHandler = (e: MediaQueryListEvent) => {
    const currentMode = get().mode
    if (currentMode === 'system') {
      set({ isDark: e.matches })
    }
  }

  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', systemThemeHandler)
}

function stopSystemThemeListener(): void {
  if (!systemThemeHandler) return

  window.matchMedia('(prefers-color-scheme: dark)')
    .removeEventListener('change', systemThemeHandler)
  systemThemeHandler = null
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  mode: 'system',
  isDark: false,
  initialized: false,

  initialize: async () => {
    // 防重复调用保护
    if (get().initialized) return

    try {
      const mode = await window.api.theme.getMode()
      const isDark = mode === 'dark' || (mode === 'system' && getSystemIsDark())

      // 如果是 system 模式，启动监听
      if (mode === 'system') {
        startSystemThemeListener(set, get)
      }

      set({ mode, isDark, initialized: true })
    } catch (error) {
      console.error('[Theme] 初始化失败:', error)
      set({ mode: 'system', isDark: getSystemIsDark(), initialized: true })
    }
  },

  setMode: async (mode: ThemeMode) => {
    try {
      await window.api.theme.setMode(mode)

      const isDark = mode === 'dark' || (mode === 'system' && getSystemIsDark())

      // 管理系统主题监听器
      if (mode === 'system') {
        startSystemThemeListener(set, get)
      } else {
        stopSystemThemeListener()
      }

      set({ mode, isDark })
    } catch (error) {
      console.error('[Theme] 切换主题失败:', error)
      throw error
    }
  }
}))
