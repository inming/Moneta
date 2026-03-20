import { useEffect, useRef } from 'react'

interface MenuItem {
  key: string
  label: string
  onClick: () => void
}

interface ContextMenuProps {
  visible: boolean
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export default function ContextMenu({ visible, x, y, items, onClose }: ContextMenuProps): React.JSX.Element | null {
  console.log('ContextMenu render:', { visible, x, y, itemCount: items.length })
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!visible) return

    const handleClickOutside = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEsc = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [visible, onClose])

  if (!visible) return null

  // Adjust position to prevent menu from going off-screen
  const adjustedX = Math.min(x, window.innerWidth - 150)
  const adjustedY = Math.min(y, window.innerHeight - items.length * 32 - 10)

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        zIndex: 1000,
        backgroundColor: '#fff',
        borderRadius: 4,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        border: '1px solid #f0f0f0',
        minWidth: 120
      }}
    >
      {items.map((item) => (
        <div
          key={item.key}
          onClick={() => {
            item.onClick()
            onClose()
          }}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: 14,
            color: '#262626',
            transition: 'background-color 0.2s',
            userSelect: 'none'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f5f5f5'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  )
}
