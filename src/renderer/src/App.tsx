import { useEffect, useMemo } from 'react'
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { ConfigProvider, Spin } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import Layout from './components/Layout'
import Transactions from './pages/Transactions'
import Settings from './pages/Settings'
import AIRecognition from './pages/AIRecognition'
import MCPImport from './pages/MCPImport'
import Statistics from './pages/Statistics'
import LockScreen from './pages/LockScreen'
import PinSetup from './pages/LockScreen/PinSetup'
import { useAuthStore } from './stores/auth.store'
import { useI18nStore } from './stores/i18n.store'
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
          <Route path="/" element={<Transactions />} />
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

  // 初始化：加载认证和语言配置
  useEffect(() => {
    initializeAuth()
    initializeI18n()
  }, [initializeAuth, initializeI18n])

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

  // 等待两个初始化都完成
  if (!authInitialized || !i18nInitialized) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  // 统一 ConfigProvider 到顶层
  return (
    <ConfigProvider locale={antdLocale}>
      {!hasPIN && <PinSetup />}
      {hasPIN && isLocked && <LockScreen />}
      {hasPIN && !isLocked && <MainApp />}
    </ConfigProvider>
  )
}

export default App
