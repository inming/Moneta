import { Layout as AntLayout, Menu } from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  DashboardOutlined,
  TableOutlined,
  BarChartOutlined,
  SettingOutlined,
  LockOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth.store'
import { useThemeStore } from '../../stores/theme.store'
import SyncIndicator from './SyncIndicator'
import SyncToast from './SyncToast'

const { Sider, Content } = AntLayout

const LOCK_KEY = '__lock__'

export default function Layout(): React.JSX.Element {
  const { t } = useTranslation('navigation')
  const navigate = useNavigate()
  const location = useLocation()
  const lock = useAuthStore((s) => s.lock)
  const isDark = useThemeStore((s) => s.isDark)

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: t('menu.dashboard') },
    { key: '/transactions', icon: <TableOutlined />, label: t('menu.transactions') },
    { key: '/statistics', icon: <BarChartOutlined />, label: t('menu.statistics') },
    { key: '/settings', icon: <SettingOutlined />, label: t('menu.settings') }
  ]

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
        theme={isDark ? 'dark' : 'light'}
        style={{
          borderRight: '1px solid var(--border-color)',
          background: 'var(--sidebar-bg)'
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%'
          }}
        >
          <div
            style={{
              padding: '16px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderBottom: '1px solid var(--border-color)',
              userSelect: 'none'
            }}
          >
            <img
              src="./logo.png"
              alt="Moneta"
              style={{ height: 36, width: 'auto', objectFit: 'contain' }}
            />
            <span style={{ fontSize: '18px', fontWeight: 600, color: isDark ? '#ffffff' : '#000000' }}>Moneta</span>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={handleMenuClick}
            style={{ flex: 1, userSelect: 'none' }}
          />
          <SyncIndicator />
          <Menu
            mode="inline"
            selectable={false}
            items={[{ key: LOCK_KEY, icon: <LockOutlined />, label: t('menu.lock') }]}
            onClick={handleMenuClick}
            style={{ borderTop: '1px solid var(--border-color)', userSelect: 'none' }}
          />
        </div>
      </Sider>
      <Content style={{ padding: 24, overflow: 'auto', background: 'var(--bg-primary)' }}>
        <Outlet />
      </Content>
      <SyncToast />
    </AntLayout>
  )
}
