import { useEffect, useMemo } from 'react'
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { ConfigProvider, Spin, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Settings from './pages/Settings'
import AIRecognition from './pages/AIRecognition'
import MCPImport from './pages/MCPImport'
import Statistics from './pages/Statistics'
import LockScreen from './pages/LockScreen'
import PinSetup from './pages/LockScreen/PinSetup'
import { useAuthStore } from './stores/auth.store'
import { useI18nStore } from './stores/i18n.store'
import { useThemeStore } from './stores/theme.store'
import { useAutoLock } from './hooks/useAutoLock'
import { setDayjsLocale } from './utils/dayjs-config'

function MainAppContent(): React.JSX.Element {
  const navigate = useNavigate()

  // 监听 MCP 导入打开事件
  useEffect(() => {
    console.log('[App] Setting up MCP import listener')
    const unsubscribe = window.api.mcp.onImportOpen(() => {
      console.log('[App] Received MCP_IMPORT_OPEN event, navigating to /mcp-import')
      navigate('/mcp-import')
    })
    return () => {
      unsubscribe()
    }
  }, [navigate])

  useAutoLock()

  return (
    <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/ai-recognition" element={<AIRecognition />} />
          <Route path="/mcp-import" element={<MCPImport />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
  )
}

function MainApp(): React.JSX.Element {
  return (
    <HashRouter>
      <MainAppContent />
    </HashRouter>
  )
}

function App(): React.JSX.Element {
  const { initialized: authInitialized, hasPIN, isLocked, initialize: initializeAuth } = useAuthStore()
  const { language, initialized: i18nInitialized, initialize: initializeI18n } = useI18nStore()
  const { isDark, initialized: themeInitialized, initialize: initializeTheme } = useThemeStore()

  // 初始化：加载认证、语言和主题配置
  useEffect(() => {
    initializeAuth()
    initializeI18n()
    initializeTheme()
  }, [initializeAuth, initializeI18n, initializeTheme])

  // 语言变化时同步 dayjs locale
  useEffect(() => {
    setDayjsLocale(language)
  }, [language])

  // 动态 Ant Design locale
  const antdLocale = useMemo(() => {
    const localeMap = {
      'zh-CN': zhCN,
      'en-US': enUS
    }
    return localeMap[language as keyof typeof localeMap] || zhCN
  }, [language])

  // 等待三个初始化都完成
  if (!authInitialized || !i18nInitialized || !themeInitialized) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  // 统一 ConfigProvider 到顶层，添加主题配置
  return (
    <div data-theme={isDark ? 'dark' : 'light'} style={{ height: '100vh' }}>
      <ConfigProvider 
        locale={antdLocale}
        theme={{
          algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm
        }}
      >
        {!hasPIN && <PinSetup />}
        {hasPIN && isLocked && <LockScreen />}
        {hasPIN && !isLocked && <MainApp />}
      </ConfigProvider>
    </div>
  )
}

export default App
