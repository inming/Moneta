import { HashRouter, Routes, Route } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import Layout from './components/Layout'
import Transactions from './pages/Transactions'
import ImportExport from './pages/ImportExport'
import Settings from './pages/Settings'
import AIRecognition from './pages/AIRecognition'

function App(): React.JSX.Element {
  return (
    <ConfigProvider locale={zhCN}>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Transactions />} />
            <Route path="/ai-recognition" element={<AIRecognition />} />
            <Route path="/import" element={<ImportExport />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </HashRouter>
    </ConfigProvider>
  )
}

export default App
