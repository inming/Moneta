import { Typography } from 'antd'

const { Text } = Typography

interface PageTitleProps {
  children: React.ReactNode
}

/**
 * 页面标题组件
 *
 * 规范：
 * - 字体大小：18px
 * - 粗体显示
 * - 块级布局
 * - 底部间距：16px
 * - 不可选中（userSelect: 'none'）
 *
 * 使用示例：
 * <PageTitle>数据浏览</PageTitle>
 */
export default function PageTitle({ children }: PageTitleProps): React.JSX.Element {
  return (
    <Text strong style={{ fontSize: 18, display: 'block', marginBottom: 16, userSelect: 'none' }}>
      {children}
    </Text>
  )
}
