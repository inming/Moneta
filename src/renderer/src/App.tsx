import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { ConfigProvider, Spin } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import Layout from './components/Layout'
import Transactions from './pages/Transactions'
import Settings from './pages/Settings'
import AIRecognition from './pages/AIRecognition'
import LockScreen from './pages/LockScreen'
import PinSetup from './pages/LockScreen/PinSetup'
import { useAuthStore } from './stores/auth.store'
import { useAutoLock } from './hooks/useAutoLock'

function MainApp(): React.JSX.Element {
  useAutoLock()

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Transactions />} />
          <Route path="/ai-recognition" element={<AIRecognition />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
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
