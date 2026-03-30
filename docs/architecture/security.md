# 应用安全与锁屏架构

> 从 CLAUDE.md 拆分。修改 PIN 码、锁屏、自动锁屏、右键菜单组件时请先阅读本文档。

## PIN 码存储

- PIN 存储在 `config.json`（应用级配置），不存数据库（非业务数据）
- 使用 SHA-256 + 随机 salt 哈希，格式 `salt:hash`，再通过 Electron `safeStorage` 加密存储
- `config.service.ts` 导出通用的 `encryptString()` / `decryptString()` 辅助函数，供 PIN 和 API Key 等场景复用
- 安全逻辑（连续错误锁定、计数重置）在 `src/main/services/pin.service.ts` 中实现

## 锁屏流程

- `App.tsx` 通过 Zustand store（`auth.store.ts`）的状态做条件渲染：`!initialized` → 加载中 | `!hasPIN` → 首次设置 | `isLocked` → 锁屏 | 否则 → 正常路由
- `MainApp` 作为独立组件提取，确保 `useAutoLock()` hook 仅在解锁后运行
- 锁屏不创建独立 Electron 窗口，保持单窗口简单架构

## 自动锁屏

- `useAutoLock()` hook 监听 6 种用户活动事件（mousedown、mousemove、keydown、scroll、touchstart、click），使用 `passive: true`
- 超时后调用 `authStore.lock()`，`autoLockMinutes <= 0` 时禁用自动锁屏
- 配置存储在 `config.json` 的 `autoLockMinutes` 字段

## 可复用组件模式

- `PinInput` 组件使用 `forwardRef` + `useImperativeHandle` 暴露 `clear()`、`shake()`、`focus()` 方法，供父组件控制状态
- 该组件被 `LockScreen`、`PinSetup`、`PinManager` 三处复用

## ContextMenu 右键菜单组件

通用右键菜单组件（`src/renderer/src/components/ContextMenu/index.tsx`）：

**使用场景**
- 图表数据块右键操作（查看明细）
- 任何需要自定义右键菜单的交互

**API 设计**
| 属性 | 类型 | 说明 |
|------|------|------|
| `visible` | boolean | 是否显示 |
| `x` | number | 菜单位置 X（clientX） |
| `y` | number | 菜单位置 Y（clientY） |
| `items` | MenuItem[] | 菜单项数组 |
| `onClose` | () => void | 关闭回调 |

**MenuItem 结构**
```typescript
interface MenuItem {
  key: string      // 唯一标识
  label: string    // 显示文本
  onClick: () => void  // 点击回调
}
```

**实现要点**
- 使用 `position: fixed` 定位，避免父容器裁剪
- 自动调整位置防止超出视口边界
- 点击外部或按 ESC 键自动关闭
- 支持悬停高亮效果

**使用示例**
```typescript
const [contextMenu, setContextMenu] = useState({
  visible: false, x: 0, y: 0, /* ... */ })

// 在容器上绑定右键事件
<div onContextMenu={(e) => {
  e.preventDefault()
  setContextMenu({ visible: true, x: e.clientX, y: e.clientY, ... })
}}>
  {/* 内容 */}
</div>

// 渲染菜单
<ContextMenu
  visible={contextMenu.visible}
  x={contextMenu.x}
  y={contextMenu.y}
  items={[{ key: 'view', label: '查看', onClick: handleView }]}
  onClose={() => setContextMenu(prev => ({ ...prev, visible: false }))}
/>
```

---

**相关文档**：
- 产品规格：`docs/prd-archive/security.md`
- 总体架构：`docs/ARCHITECTURE.md`
