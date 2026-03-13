import { Layout as AntLayout, Menu } from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { TableOutlined, ImportOutlined, SettingOutlined, CameraOutlined } from '@ant-design/icons'

const { Sider, Content } = AntLayout

const menuItems = [
  { key: '/', icon: <TableOutlined />, label: '数据浏览' },
  { key: '/ai-recognition', icon: <CameraOutlined />, label: 'AI 识别' },
  { key: '/import', icon: <ImportOutlined />, label: '导入数据' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' }
]

export default function Layout(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <AntLayout style={{ height: '100vh' }}>
      <Sider width={180} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{ padding: '16px', fontSize: '18px', fontWeight: 600, textAlign: 'center' }}>
          Moneta
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Content style={{ padding: 24, overflow: 'auto', background: '#f5f5f5' }}>
        <Outlet />
      </Content>
    </AntLayout>
  )
}
