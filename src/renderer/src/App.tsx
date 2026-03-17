import { useEffect } from 'react'
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { ConfigProvider, Spin } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import Layout from './components/Layout'
import Transactions from './pages/Transactions'
import Settings from './pages/Settings'
import AIRecognition from './pages/AIRecognition'
import MCPImport from './pages/MCPImport'
import Statistics from './pages/Statistics'
import LockScreen from './pages/LockScreen'
import PinSetup from './pages/LockScreen/PinSetup'
import { useAuthStore } from './stores/auth.store'
import { useAutoLock } from './hooks/useAutoLock'

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
  const { initialized, hasPIN, isLocked, initialize } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  if (!initialized) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!hasPIN) {
    return (
      <ConfigProvider locale={zhCN}>
        <PinSetup />
      </ConfigProvider>
    )
  }

  if (isLocked) {
    return (
      <ConfigProvider locale={zhCN}>
        <LockScreen />
      </ConfigProvider>
    )
  }

  return (
    <ConfigProvider locale={zhCN}>
      <MainApp />
    </ConfigProvider>
  )
}

export default App
