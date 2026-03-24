import { create } from 'zustand'

interface I18nState {
  language: string
  initialized: boolean
  initialize: () => Promise<void>
  setLanguage: (language: string) => Promise<void>
}

export const useI18nStore = create<I18nState>((set) => ({
  language: 'zh-CN',
  initialized: false,

  initialize: async () => {
    try {
      const language = await window.api.i18n.getLanguage()
      set({ language, initialized: true })
    } catch (error) {
      console.error('[I18n] 初始化失败:', error)
      set({ language: 'zh-CN', initialized: true }) // 回退到中文
    }
  },

  setLanguage: async (language: string) => {
    try {
      await window.api.i18n.setLanguage(language)
      set({ language })
    } catch (error) {
      console.error('[I18n] 语言切换失败:', error)
      throw error
    }
  }
}))
