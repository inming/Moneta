# Moneta Dark Mode 功能设计文档

> 创建日期：2026-03-31  
> 作者：AI Assistant  
> 状态：待实现

---

## 1. 功能概述

为 Moneta 记账软件增加暗黑模式（Dark Mode）支持，提升夜间使用体验，并满足用户个性化需求。

### 1.1 核心特性
- **三档主题模式**：跟随系统（默认）、浅色模式、深色模式
- **即时切换**：切换后无需重启应用，即时生效
- **系统监听**：选择"跟随系统"时，自动响应操作系统主题变化
- **持久化存储**：主题设置保存在本地配置文件中
- **整体适配**：包含 UI 组件、图表、侧边栏在内的全局暗黑主题

---

## 2. 设计决策

### 2.1 技术选型

| 技术点 | 方案 | 理由 |
|--------|------|------|
| UI 框架主题 | Ant Design 5 `ConfigProvider` | 原生支持，无需额外依赖 |
| 状态管理 | Zustand Store | 与现有语言设置模式一致 |
| 配置存储 | `config.json` + IPC | 与现有配置体系兼容 |
| 图表主题 | ECharts 内置 `dark` 主题 | 简单可靠，维护成本低 |

### 2.2 设计选择确认

基于需求沟通，确认以下设计选择：

1. ✅ **ECharts 图表**：使用内置 `dark` 主题（方案 A）
2. ✅ **侧边栏样式**：整体切换为深色（选项 B）
3. ✅ **设置位置**：新增独立「外观」Tab（选项 A）
4. ✅ **快捷切换**：不在侧边栏添加主题切换按钮（选项：不需要）

---

## 3. 主题规范

### 3.1 颜色映射

**核心原则**：主要依赖 Ant Design 5 的 Design Token 系统，CSS 变量仅用于 Ant Design 覆盖不到的自定义场景。

#### Ant Design Token（推荐）

通过 `ConfigProvider` 的 `theme` 属性自动切换，无需手动设置：
- 所有 Ant Design 组件（Button、Table、Modal、Card 等）自动适配
- 颜色、边框、阴影等遵循 Ant Design 的暗黑模式算法

#### CSS 变量（补充）

用于以下 Ant Design 无法覆盖的场景：
- Layout 侧边栏和内容区背景色
- 自定义渐变背景（如锁屏页面）
- ECharts 图表外部容器背景
- 第三方组件或原生 HTML 元素样式

| 元素 | CSS 变量 | 浅色值 | 深色值 | 使用场景 |
|------|----------|--------|--------|----------|
| 内容区背景 | `--bg-primary` | `#f5f5f5` | `#141414` | Layout Content |
| 侧边栏背景 | `--sidebar-bg` | `#ffffff` | `#001529` | Layout Sider |
| 锁屏渐变起始 | `--lock-gradient-start` | `#667eea` | `#2d3748` | LockScreen 背景 |
| 锁屏渐变结束 | `--lock-gradient-end` | `#764ba2` | `#1a202c` | LockScreen 背景 |
| 锁屏卡片背景 | `--lock-card-bg` | `rgba(255,255,255,0.95)` | `rgba(30,30,30,0.95)` | LockScreen 卡片 |

### 3.2 ECharts 图表配色（深色模式）

使用 ECharts 内置 `dark` 主题，包含以下默认配色：

```javascript
// ECharts dark 主题默认配色
['#4992ff', '#7cffb2', '#fddd60', '#ff6e76', '#58d9f9', '#05c091', '#ff8a45', '#8d48e3', '#dd79ff']
```

该配色在深色背景上具有良好对比度，无需额外调整。

---

## 4. 数据模型

### 4.1 配置存储（config.json）

```typescript
// 新增字段到 AppConfig 接口
interface AppConfig {
  // ... 现有字段
  theme?: 'system' | 'light' | 'dark'  // 新增
}
```

**默认值**：`'system'`（跟随系统）

**向前兼容**：现有用户无该字段时，自动设为 `'system'`

### 4.2 TypeScript 类型定义

```typescript
// src/shared/types/theme.ts
export type ThemeMode = 'system' | 'light' | 'dark'

export interface ThemeState {
  mode: ThemeMode
  isDark: boolean  // 计算属性：当前是否处于深色模式
}
```

### 4.3 Zustand Store 状态

```typescript
// src/renderer/src/stores/theme.store.ts
interface ThemeStore {
  mode: ThemeMode
  isDark: boolean
  initialized: boolean
  initialize: () => Promise<void>
  setMode: (mode: ThemeMode) => Promise<void>
}
```

---

## 5. 架构设计

### 5.1 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      用户交互层                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Settings 页面 → ThemeManager 组件                     │  │
│  │  - Radio.Group 选择主题模式                             │  │
│  │  - 保存按钮触发 setMode()                              │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      状态管理层                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Zustand: theme.store.ts                               │  │
│  │  - mode: 用户选择的模式 ('system'|'light'|'dark')       │  │
│  │  - isDark: 实际是否使用深色（计算值）                    │  │
│  │  - 监听系统主题变化（matchMedia）                       │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                       IPC 通信层                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  IPC Channels:                                         │  │
  │  │  - THEME_GET: 从主进程读取主题配置                       │  │
  │  │  - THEME_SET: 保存主题配置到主进程                       │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      主进程层                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  theme.ipc.ts: IPC 处理器                              │  │
│  │  config.service.ts: 读写 config.json                   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    UI 渲染层                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  App.tsx: ConfigProvider 主题配置                       │  │
│  │  Layout/index.tsx: 侧边栏和内容区背景色                  │  │
│  │  Statistics/*.tsx: ECharts 主题切换                     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 数据流

```
用户选择主题模式
       │
       ▼
ThemeManager 调用 themeStore.setMode(mode)
       │
       ▼
Zustand Store 更新 mode
       │
       ├── 如果 mode === 'system': 启动/停止系统主题监听
       │
       ▼
调用 IPC: theme:set(mode)
       │
       ▼
主进程保存到 config.json
       │
       ▼
Store 计算 isDark（基于 mode 和系统主题）
       │
       ▼
触发 App.tsx 和组件重新渲染
```

### 5.3 系统主题监听生命周期管理

#### 监听注册

```typescript
// theme.store.ts
private mediaQuery: MediaQueryList | null = null

initialize() {
  // 1. 从主进程读取主题配置
  const mode = await window.api.theme.getMode()
  
  // 2. 如果 mode 为 'system'，启动系统主题监听
  if (mode === 'system') {
    this.startSystemThemeListener()
  }
  
  // 3. 计算初始 isDark
  this.updateIsDark()
}

private startSystemThemeListener() {
  this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  this.mediaQuery.addEventListener('change', this.handleSystemThemeChange)
}

private handleSystemThemeChange = (e: MediaQueryListEvent) => {
  this.updateIsDark()
}
```

#### 监听清理

```typescript
setMode(mode: ThemeMode) {
  // 保存新配置
  await window.api.theme.setMode(mode)
  
  // 根据新模式管理监听器
  if (mode === 'system') {
    if (!this.mediaQuery) {
      this.startSystemThemeListener()
    }
  } else {
    if (this.mediaQuery) {
      this.mediaQuery.removeEventListener('change', this.handleSystemThemeChange)
      this.mediaQuery = null
    }
  }
  
  this.updateIsDark()
}
```

#### 主进程备选方案

如渲染进程的 `matchMedia` 不可靠，可考虑在主进程使用 Electron 的 `nativeTheme` API：

```typescript
// 主进程 main/index.ts
import { nativeTheme } from 'electron'

nativeTheme.on('updated', () => {
  // 广播给所有渲染进程
  mainWindow?.webContents.send('system-theme-changed', nativeTheme.shouldUseDarkColors)
})
```

**当前决策**：优先使用渲染进程的 `matchMedia`，更简单且与 React 生命周期集成更好。如遇到跨平台差异再迁移到主进程方案。

---

## 6. 接口设计

### 6.1 IPC 通道

根据项目 IPC 命名规范（`<namespace>:<entity>:<action>`）：

```typescript
// src/shared/ipc-channels.ts
export const IPC_CHANNELS = {
  // ... 现有通道
  // 主题（与 i18n 命名空间保持同级，均为功能模块）
  THEME_GET: 'theme:get',
  THEME_SET: 'theme:set'
}
```

**说明**：
- 使用 `theme` 命名空间，与 `i18n` 保持一致（都是功能模块级别，非数据实体级别）
- 通道名简化为 `theme:get` / `theme:set`，与 `i18n:get-language` / `i18n:set-language` 模式一致
- 项目目前无通用配置读写通道，各配置项（语言、PIN、AI 模型、主题等）均为独立 IPC 通道

### 6.2 Preload API

```typescript
// src/preload/index.d.ts
interface MonetaAPI {
  // ... 现有 API
  theme: {
    getMode(): Promise<ThemeMode>
    setMode(mode: ThemeMode): Promise<void>
  }
}
```

### 6.3 Store API

```typescript
// 使用方式
const { mode, isDark, setMode } = useThemeStore()

// 初始化（在 App.tsx 中调用）
useEffect(() => {
  initializeTheme()
}, [])
```

---

## 7. 组件设计

### 7.1 App.tsx 修改

#### ConfigProvider 主题配置

```tsx
// 新增主题配置到 ConfigProvider
<ConfigProvider 
  locale={antdLocale}
  theme={{
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm
  }}
>
  {/* ... */}
</ConfigProvider>
```

#### CSS 变量动态注入

**方式一：使用 data-theme 属性（推荐）**

在 App.tsx 根元素设置 data-theme 属性，CSS 中使用属性选择器：

```tsx
// App.tsx
<div data-theme={isDark ? 'dark' : 'light'}>
  <ConfigProvider ...>
    {/* ... */}
  </ConfigProvider>
</div>
```

```css
/* variables.css */
:root {
  --bg-primary: #f5f5f5;
  --sidebar-bg: #ffffff;
  --lock-gradient-start: #667eea;
  --lock-gradient-end: #764ba2;
  --lock-card-bg: rgba(255, 255, 255, 0.95);
}

[data-theme='dark'] {
  --bg-primary: #141414;
  --sidebar-bg: #001529;
  --lock-gradient-start: #2d3748;
  --lock-gradient-end: #1a202c;
  --lock-card-bg: rgba(30, 30, 30, 0.95);
}
```

**方式二：动态设置 CSS 变量（备选）**

使用 useEffect 根据 isDark 动态设置 CSS 变量：

```tsx
// App.tsx
useEffect(() => {
  const root = document.documentElement
  if (isDark) {
    root.style.setProperty('--bg-primary', '#141414')
    root.style.setProperty('--sidebar-bg', '#001529')
    // ... 其他变量
  } else {
    root.style.setProperty('--bg-primary', '#f5f5f5')
    root.style.setProperty('--sidebar-bg', '#ffffff')
    // ... 其他变量
  }
}, [isDark])
```

**决策**：采用方式一（data-theme 属性），因为：
- 更简洁，无需 JS 动态设置
- CSS 中集中管理，易于维护
- 避免 React 渲染周期中的重复 DOM 操作

### 7.2 Layout 组件适配

```tsx
// 方式一：使用 CSS 变量（推荐，便于统一维护）
<Sider 
  theme={isDark ? 'dark' : 'light'}
  style={{ background: 'var(--sidebar-bg)' }}
>
  {/* ... */}
</Sider>
<Content style={{ background: 'var(--bg-primary)' }}>
  {/* ... */}
</Content>

// 方式二：条件渲染（简单场景）
<Sider 
  theme={isDark ? 'dark' : 'light'}
  style={{ background: isDark ? '#001529' : '#ffffff' }}
>
  {/* ... */}
</Sider>
```

### 7.3 ECharts 图表适配

```tsx
// 初始化时设置主题
<ReactECharts 
  option={chartOption}
  theme={isDark ? 'dark' : undefined}
/>
```

### 7.4 LockScreen 组件适配

锁屏页面使用自定义渐变背景和卡片样式，需使用 CSS 变量：

```tsx
// src/renderer/src/pages/LockScreen/index.tsx
<div
  style={{
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, var(--lock-gradient-start) 0%, var(--lock-gradient-end) 100%)',
    userSelect: 'none'
  }}
>
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: 48,
      borderRadius: 16,
      background: 'var(--lock-card-bg)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)'
    }}
  >
    {/* ... */}
  </div>
</div>
```

### 7.5 ThemeManager 组件

**交互模式**：与 LanguageManager 保持一致，采用"选择 + 保存"两步模式
- 用户选择主题模式（Radio.Group）
- 点击保存按钮后生效
- 如未修改直接保存，显示"无变化"提示

```tsx
// src/renderer/src/pages/Settings/ThemeManager.tsx
export default function ThemeManager(): JSX.Element {
  const { t } = useTranslation(['settings', 'common'])
  const { mode, setMode } = useThemeStore()
  const [selectedMode, setSelectedMode] = useState(mode)
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    // 与语言设置保持一致：检查是否有变化
    if (selectedMode === mode) {
      message.info(t('settings:appearance.noChange'))
      return
    }

    setLoading(true)
    try {
      await setMode(selectedMode)
      message.success(t('settings:appearance.saveSuccess'))
    } catch (error) {
      message.error(t('settings:appearance.saveFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title={t('settings:appearance.title')} bordered={false}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>
            {t('settings:appearance.theme')}
          </div>
          <Radio.Group value={selectedMode} onChange={handleChange}>
            <Space direction="vertical">
              <Radio value="system">{t('settings:appearance.system')}</Radio>
              <Radio value="light">{t('settings:appearance.light')}</Radio>
              <Radio value="dark">{t('settings:appearance.dark')}</Radio>
            </Space>
          </Radio.Group>
        </div>
        <Button type="primary" onClick={handleSave} loading={loading}>
          {t('common:buttons.save')}
        </Button>
      </Space>
    </Card>
  )
}
```

---

## 8. 多语言支持

### 8.1 中文翻译

```json
// src/renderer/src/locales/zh-CN/settings.json
{
  "tabs": {
    "appearance": "外观"
  },
  "appearance": {
    "title": "界面外观",
    "theme": "主题模式",
    "system": "跟随系统",
    "light": "浅色模式",
    "dark": "深色模式",
    "noChange": "设置未变更",
    "saveSuccess": "外观设置已保存",
    "saveFailed": "保存失败"
  }
}
```

### 8.2 英文翻译

```json
// src/renderer/src/locales/en-US/settings.json
{
  "tabs": {
    "appearance": "Appearance"
  },
  "appearance": {
    "title": "Interface Appearance",
    "theme": "Theme Mode",
    "system": "Follow System",
    "light": "Light Mode",
    "dark": "Dark Mode",
    "noChange": "No changes made",
    "saveSuccess": "Appearance settings saved",
    "saveFailed": "Failed to save"
  }
}
```

---

## 9. 文件变更清单

### 9.1 新增文件

| 文件路径 | 说明 |
|----------|------|
| `src/shared/types/theme.ts` | ThemeMode 类型定义 |
| `src/main/ipc/theme.ipc.ts` | 主题 IPC 处理器 |
| `src/renderer/src/stores/theme.store.ts` | Zustand 主题状态管理 |
| `src/renderer/src/pages/Settings/ThemeManager.tsx` | 主题设置组件 |

### 9.2 修改文件

| 文件路径 | 变更说明 |
|----------|----------|
| `src/shared/ipc-channels.ts` | 新增 `THEME_GET`, `THEME_SET` |
| `src/shared/types/index.ts` | 导出 theme 类型 |
| `src/main/services/config.service.ts` | AppConfig 添加 theme 字段，向前兼容 |
| `src/main/index.ts` | 注册 theme IPC handler |
| `src/preload/index.ts` | 暴露 theme API |
| `src/preload/index.d.ts` | 主题 API 类型声明 |
| `src/renderer/src/App.tsx` | ConfigProvider 添加 theme 配置 |
| `src/renderer/src/pages/Settings/index.tsx` | 新增「外观」Tab |
| `src/renderer/src/components/Layout/index.tsx` | 适配暗黑模式背景色 |
| `src/renderer/src/styles/variables.css` | 添加 CSS 变量，统一管理自定义颜色 |
| `src/renderer/src/pages/Statistics/BarChart.tsx` | ECharts 主题切换 |
| `src/renderer/src/pages/Statistics/PieChart.tsx` | ECharts 主题切换 |
| `src/renderer/src/pages/Statistics/YearlyBarChart.tsx` | ECharts 主题切换 |
| `src/renderer/src/locales/zh-CN/settings.json` | 中文翻译 |
| `src/renderer/src/locales/en-US/settings.json` | 英文翻译 |
| `src/renderer/src/pages/LockScreen/index.tsx` | 锁屏页面背景适配（渐变和卡片背景） |
| `src/renderer/src/pages/LockScreen/PinSetup.tsx` | PIN 设置页面适配（如使用自定义样式） |

---

## 10. 验收标准

### 10.1 功能验收

- [ ] 设置页面显示「外观」Tab，位于「语言」Tab 之后
- [ ] 外观设置包含三个单选选项：跟随系统、浅色模式、深色模式
- [ ] 切换主题后界面即时生效，无需重启应用
- [ ] 选择「跟随系统」时，随操作系统主题自动切换
- [ ] 主题设置持久化，重启应用后保持上次的设置
- [ ] 统计页面的 ECharts 图表在深色模式下显示正常
- [ ] 侧边栏和内容区整体切换为深色风格（无边框颜色不连续问题）
- [ ] 所有页面的文字在深色模式下清晰可读
- [ ] 锁屏页面（PIN 输入）在深色模式下视觉协调
- [ ] 所有弹窗/Modal（删除确认、导入预览、AI 识别确认等）在深色模式下显示正常
- [ ] 右键菜单（统计页交叉表）在深色模式下显示正常

### 10.2 页面兼容性验证（Ant Design 组件自动适配）

以下页面主要使用 Ant Design 组件，理论上 ConfigProvider 会自动处理暗黑模式。实现后需验证：

- [ ] AI 识别确认页面（AIRecognition/index.tsx）- 验证 Ant Design 组件自动适配
- [ ] MCP 导入确认组件（ImportConfirm/index.tsx）- 验证 Ant Design 组件自动适配
- [ ] 数据浏览页（Transactions/index.tsx）- 验证自定义表格样式在深色模式下正常
- [ ] MCP 导入页（MCPImport/index.tsx）- 验证自定义样式在深色模式下正常

**验证方法**：切换主题后检查以上页面，如发现显示异常，再针对性调整。

### 10.3 兼容性验收

- [ ] 现有用户升级后，默认使用「跟随系统」模式
- [ ] 无 theme 字段的旧配置不会导致应用崩溃
- [ ] Windows 和 macOS 系统主题切换均能正确响应

### 10.4 性能验收

- [ ] 主题切换无卡顿（< 100ms）
- [ ] 不增加应用启动时间
- [ ] 内存占用无显著增加

---

## 11. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 系统主题监听导致性能问题 | 卡顿 | 使用 throttle/debounce 限制更新频率；避免频繁重渲染 |
| 自定义样式与 Ant Design 暗黑模式冲突 | UI 异常 | 全面测试，移除硬编码颜色，使用 CSS 变量 |
| Windows/macOS 主题检测差异 | 行为不一致 | 分别测试两个平台 |
| 锁屏页面渐变背景与深色模式不协调 | 视觉突兀 | 为锁屏页面单独设计深色模式配色方案 |

---

## 12. 参考文档

- [Ant Design 5 主题配置](https://ant.design/docs/react/customize-theme)
- [ECharts 主题配置](https://echarts.apache.org/handbook/zh/concepts/style/)
- [Moneta CLAUDE.md](CLAUDE.md) - 编码规范参考
- [Moneta i18n 架构](docs/architecture/i18n.md) - 多语言实现参考

---

## 附录：实现计划（概要）

### Phase 1: 基础架构
1. 创建类型定义和 IPC 通道
2. 实现主进程配置读写
3. 实现 Preload API 桥接

### Phase 2: 状态管理
1. 创建 theme.store.ts
2. 实现系统主题监听逻辑
3. 集成到 App.tsx

### Phase 3: UI 适配
1. 创建 ThemeManager 组件
2. 修改 Layout 组件背景色
3. 修改统计图表主题

### Phase 4: 完善
1. 添加多语言翻译
2. 全面测试
3. 处理边界情况

---

*文档版本：v1.0*  
*最后更新：2026-03-31*
