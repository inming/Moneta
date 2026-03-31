# 深色模式架构文档

> 创建日期：2026-03-31  
> 最后更新：2026-03-31  
> 状态：已实现

---

## 1. 概述

Moneta 支持深色模式，用户可选择**跟随系统**（默认）、**浅色模式**或**深色模式**。

## 2. 技术实现

### 2.1 核心决策

| 技术点 | 方案 | 理由 |
|--------|------|------|
| UI 框架主题 | Ant Design 5 `ConfigProvider` | 原生支持 `darkAlgorithm`/`defaultAlgorithm` |
| 自定义样式 | CSS 变量 | 便于统一管理和主题切换 |
| 状态管理 | Zustand Store | 与语言设置模式一致，支持系统主题监听 |
| 图表主题 | ECharts 内置 `dark` 主题 | 简单可靠，配色适配深色背景 |

### 2.2 关键约束

1. **CSS 变量必须使用 `!important` 覆盖 Ant Design 默认样式**
   ```css
   [data-theme='dark'] .ant-table-cell {
     background: transparent !important;
   }
   ```

2. **图表主题切换需设置 `notMerge={true}`**
   ```tsx
   <ReactECharts theme={isDark ? 'dark' : undefined} notMerge={true} />
   ```

3. **系统主题监听必须使用持久化引用**
   ```typescript
   // 错误：每次创建新引用，无法移除监听
   const handler = (e) => { ... }
   mediaQuery.addEventListener('change', handler)
   
   // 正确：使用模块级变量存储 handler
   let systemThemeHandler: ((e: MediaQueryListEvent) => void) | null = null
   ```

4. **初始化必须加防重复保护**
   ```typescript
   initialize: async () => {
     if (get().initialized) return
     // ...
   }
   ```

## 3. 数据流

```
用户选择主题 → ThemeManager → themeStore.setMode()
    ↓
更新 Zustand State (mode, isDark)
    ↓
保存到 config.json (via IPC)
    ↓
触发 App.tsx ConfigProvider theme 更新
    ↓
CSS 变量切换 → 全局样式更新
```

## 4. 文件结构

```
src/
├── main/
│   ├── ipc/theme.ipc.ts          # IPC handlers
│   └── services/config.service.ts # 配置读写
├── preload/
│   ├── index.ts                   # API 暴露
│   └── index.d.ts                 # 类型声明
├── renderer/
│   ├── src/
│   │   ├── stores/theme.store.ts  # Zustand 状态
│   │   ├── styles/variables.css   # CSS 变量
│   │   └── pages/Settings/ThemeManager.tsx
│   └── main.tsx                   # 导入 CSS
└── shared/
    ├── types/theme.ts             # ThemeMode 类型
    └── ipc-channels.ts            # IPC 通道常量
```

## 5. CSS 变量规范

| 变量名 | 浅色值 | 深色值 | 用途 |
|--------|--------|--------|------|
| `--bg-primary` | `#f5f5f5` | `#141414` | 内容区背景 |
| `--sidebar-bg` | `#ffffff` | `#001529` | 侧边栏背景 |
| `--border-color` | `#f0f0f0` | `#303030` | 边框颜色 |
| `--table-summary-bg` | `#fafafa` | `#141414` | 表格合计行 |
| `--lock-gradient-start` | `#667eea` | `#2d3748` | 锁屏渐变 |
| `--lock-gradient-end` | `#764ba2` | `#1a202c` | 锁屏渐变 |
| `--lock-card-bg` | `rgba(255,255,255,0.95)` | `rgba(30,30,30,0.95)` | 锁屏卡片 |

## 6. 新增组件规范

### 6.1 使用硬编码背景色

❌ **禁止** - 会导致深色模式下显示异常
```tsx
<div style={{ background: '#ffffff' }}>
```

✅ **正确** - 使用 CSS 变量
```tsx
<div style={{ background: 'var(--bg-primary)' }}>
```

### 6.2 图表中心文字

ECharts 的 `graphic` 元素不会自动跟随主题，需手动指定颜色：
```typescript
graphic: {
  style: {
    fill: isDark ? '#ffffff' : '#000000'
  }
}
```

## 7. 测试清单

- [ ] 设置页「外观」Tab 可正常切换三档主题
- [ ] 跟随系统模式自动响应 OS 主题变化
- [ ] 统计报表图表切换主题无残留样式
- [ ] 数据浏览页表格深色背景正常
- [ ] 锁屏页面渐变和卡片颜色协调
- [ ] 重启应用后主题设置保持不变
- [ ] 所有弹窗/Modal 在深色模式下显示正常
