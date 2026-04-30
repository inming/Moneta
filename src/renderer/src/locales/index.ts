import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// 导入翻译文件
import zhCN_common from './zh-CN/common.json'
import zhCN_navigation from './zh-CN/navigation.json'
import zhCN_settings from './zh-CN/settings.json'
import zhCN_transactions from './zh-CN/transactions.json'
import zhCN_statistics from './zh-CN/statistics.json'
import zhCN_import from './zh-CN/import.json'
import zhCN_auth from './zh-CN/auth.json'
import zhCN_dashboard from './zh-CN/dashboard.json'

import enUS_common from './en-US/common.json'
import enUS_navigation from './en-US/navigation.json'
import enUS_settings from './en-US/settings.json'
import enUS_transactions from './en-US/transactions.json'
import enUS_statistics from './en-US/statistics.json'
import enUS_import from './en-US/import.json'
import enUS_auth from './en-US/auth.json'
import enUS_dashboard from './en-US/dashboard.json'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': {
        common: zhCN_common,
        navigation: zhCN_navigation,
        settings: zhCN_settings,
        transactions: zhCN_transactions,
        statistics: zhCN_statistics,
        import: zhCN_import,
        auth: zhCN_auth,
        dashboard: zhCN_dashboard
      },
      'en-US': {
        common: enUS_common,
        navigation: enUS_navigation,
        settings: enUS_settings,
        transactions: enUS_transactions,
        statistics: enUS_statistics,
        import: enUS_import,
        auth: enUS_auth,
        dashboard: enUS_dashboard
      }
    },
    lng: 'zh-CN', // 默认语言（会被 Zustand store 覆盖）
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false // React 已自动转义
    }
  })

export default i18n
