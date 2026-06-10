import { useCallback, useEffect, useMemo, useState } from 'react'
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, ConfigProvider, Result, Spin, theme } from 'antd'
import type { BootstrapStatus } from './api/moneta-api'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Settings from './pages/Settings'
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

/** 首启数据迁移失败时的错误屏（旧 Electron 秘密迁移到 OS keyring） */
function BootstrapErrorScreen({
  message,
  onRetry
}: {
  message?: string
  onRetry: () => void
}): React.JSX.Element {
  const { t } = useTranslation('common')
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Result
        status="error"
        title={t('bootstrap.errorTitle')}
        subTitle={
          <>
            <div>{message}</div>
            <div style={{ marginTop: 8 }}>{t('bootstrap.hint')}</div>
          </>
        }
        extra={
          <Button type="primary" onClick={onRetry}>
            {t('bootstrap.retry')}
          </Button>
        }
      />
    </div>
  )
}

function App(): React.JSX.Element {
  const { initialized: authInitialized, hasPIN, isLocked, initialize: initializeAuth } = useAuthStore()
  const { language, initialized: i18nInitialized, initialize: initializeI18n } = useI18nStore()
  const { isDark, initialized: themeInitialized, initialize: initializeTheme } = useThemeStore()
  const [bootstrap, setBootstrap] = useState<BootstrapStatus>({ state: 'pending' })

  // 等待后端首启迁移完成（keychain 授权等），完成前不初始化依赖秘密的 store
  useEffect(() => {
    let cancelled = false
    const poll = async (): Promise<void> => {
      try {
        const status = await window.api.app.bootstrapStatus()
        if (cancelled) return
        if (status.state === 'pending') {
          setTimeout(poll, 300)
          return
        }
        setBootstrap(status)
      } catch {
        if (!cancelled) setTimeout(poll, 500)
      }
    }
    void poll()
    return () => {
      cancelled = true
    }
  }, [])

  // 语言和主题不依赖秘密，可立即初始化
  useEffect(() => {
    initializeI18n()
    initializeTheme()
  }, [initializeI18n, initializeTheme])

  // 认证依赖 keyring，必须等迁移完成
  useEffect(() => {
    if (bootstrap.state === 'ready') {
      initializeAuth()
    }
  }, [bootstrap.state, initializeAuth])

  const handleRetryMigration = useCallback(async () => {
    setBootstrap({ state: 'pending' })
    const status = await window.api.app.retryMigration()
    setBootstrap(status)
  }, [])

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

  // 首启迁移失败：显示错误屏（需要 i18n 就绪以显示文案）
  if (bootstrap.state === 'error' && i18nInitialized) {
    return <BootstrapErrorScreen message={bootstrap.message} onRetry={handleRetryMigration} />
  }

  // 等待迁移与三个初始化都完成
  if (bootstrap.state !== 'ready' || !authInitialized || !i18nInitialized || !themeInitialized) {
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
