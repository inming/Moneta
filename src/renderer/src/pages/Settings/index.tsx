import { Tabs, Typography } from 'antd'
import CategoryManager from './CategoryManager'
import OperatorManager from './OperatorManager'

const { Text } = Typography

export default function Settings(): React.JSX.Element {
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
    }
  ]

  return (
    <div>
      <Text strong style={{ fontSize: 18, display: 'block', marginBottom: 16 }}>
        设置
      </Text>
      <Tabs items={tabItems} />
    </div>
  )
}
