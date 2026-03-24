import { Tabs, Typography } from 'antd'
import { useSearchParams } from 'react-router-dom'
import CategoryManager from './CategoryManager'
import OperatorManager from './OperatorManager'
import AIProviderManager from './AIProviderManager'
import MCPConfigManager from './MCPConfigManager'
import LanguageManager from './LanguageManager'
import PinManager from './PinManager'
import DataManager from './DataManager'

const { Text } = Typography

const VALID_TABS = ['categories', 'operators', 'ai-providers', 'mcp', 'language', 'security', 'data']
const DEFAULT_TAB = 'categories'

export default function Settings(): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : DEFAULT_TAB

  const handleTabChange = (key: string): void => {
    setSearchParams(key === DEFAULT_TAB ? {} : { tab: key }, { replace: true })
  }

  const tabItems = [
    {
      key: 'categories',
      label: '分类管理',
      children: <CategoryManager />
    },
    {
      key: 'operators',
      label: '操作人管理',
      children: <OperatorManager />
    },
    {
      key: 'ai-providers',
      label: 'AI 模型',
      children: <AIProviderManager />
    },
    {
      key: 'mcp',
      label: 'MCP 配置',
      children: <MCPConfigManager />
    },
    {
      key: 'language',
      label: '语言',
      children: <LanguageManager />
    },
    {
      key: 'security',
      label: '安全设置',
      children: <PinManager />
    },
    {
      key: 'data',
      label: '数据管理',
      children: <DataManager />
    }
  ]

  return (
    <div>
      <Text strong style={{ fontSize: 18, display: 'block', marginBottom: 16, userSelect: 'none' }}>
        设置
      </Text>
      <Tabs items={tabItems} activeKey={activeTab} onChange={handleTabChange} />
    </div>
  )
}
