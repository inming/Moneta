import { Layout as AntLayout, Menu } from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  TableOutlined,
  SettingOutlined,
  LockOutlined
} from '@ant-design/icons'
import { useAuthStore } from '../../stores/auth.store'

const { Sider, Content } = AntLayout

const menuItems = [
  { key: '/', icon: <TableOutlined />, label: '数据浏览' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' }
]

const LOCK_KEY = '__lock__'

export default function Layout(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const lock = useAuthStore((s) => s.lock)

  const handleMenuClick = ({ key }: { key: string }): void => {
    if (key === LOCK_KEY) {
      lock()
    } else {
      navigate(key)
    }
  }

  return (
    <AntLayout style={{ height: '100vh' }}>
      <Sider
        width={180}
        theme="light"
        style={{
          borderRight: '1px solid #f0f0f0',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{ padding: '16px', fontSize: '18px', fontWeight: 600, textAlign: 'center' }}>
          Moneta
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ flex: 1 }}
        />
        <Menu
          mode="inline"
          selectable={false}
          items={[{ key: LOCK_KEY, icon: <LockOutlined />, label: '锁屏' }]}
          onClick={handleMenuClick}
          style={{ borderTop: '1px solid #f0f0f0' }}
        />
      </Sider>
      <Content style={{ padding: 24, overflow: 'auto', background: '#f5f5f5' }}>
        <Outlet />
      </Content>
    </AntLayout>
  )
}
