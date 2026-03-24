import { Tabs, Typography } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('settings')
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : DEFAULT_TAB

  const handleTabChange = (key: string): void => {
    setSearchParams(key === DEFAULT_TAB ? {} : { tab: key }, { replace: true })
  }

  const tabItems = [
    {
      key: 'categories',
      label: t('tabs.categories'),
      children: <CategoryManager />
    },
    {
      key: 'operators',
      label: t('tabs.operators'),
      children: <OperatorManager />
    },
    {
      key: 'ai-providers',
      label: t('tabs.aiProviders'),
      children: <AIProviderManager />
    },
    {
      key: 'mcp',
      label: t('tabs.mcp'),
      children: <MCPConfigManager />
    },
    {
      key: 'language',
      label: t('tabs.language'),
      children: <LanguageManager />
    },
    {
      key: 'security',
      label: t('tabs.security'),
      children: <PinManager />
    },
    {
      key: 'data',
      label: t('tabs.data'),
      children: <DataManager />
    }
  ]

  return (
    <div>
      <Text strong style={{ fontSize: 18, display: 'block', marginBottom: 16, userSelect: 'none' }}>
        {t('title')}
      </Text>
      <Tabs items={tabItems} activeKey={activeTab} onChange={handleTabChange} />
    </div>
  )
}
