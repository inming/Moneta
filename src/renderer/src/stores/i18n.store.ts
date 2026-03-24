import { create } from 'zustand'
import i18n from '../locales'

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
      await i18n.changeLanguage(language) // 同步 i18next
      set({ language, initialized: true })
    } catch (error) {
      console.error('[I18n] 初始化失败:', error)
      await i18n.changeLanguage('zh-CN') // 回退到中文
      set({ language: 'zh-CN', initialized: true })
    }
  },

  setLanguage: async (language: string) => {
    try {
      await window.api.i18n.setLanguage(language)
      await i18n.changeLanguage(language) // 同步 i18next
      set({ language })
    } catch (error) {
      console.error('[I18n] 语言切换失败:', error)
      throw error
    }
  }
}))
