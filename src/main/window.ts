import { BrowserWindow, shell, nativeImage } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export function createWindow(): BrowserWindow {
  console.log('[Window] createWindow called')
  console.log('[Window] __dirname:', __dirname)
  console.log('[Window] is.dev:', is.dev)
  console.log('[Window] process.resourcesPath:', process.resourcesPath)

  // 设置任务栏图标
  // 开发模式: __dirname 是 out/main, 需要向上两级到项目根目录
  // 生产模式: 资源在应用目录的 resources 文件夹中
  const iconPath = is.dev
    ? join(__dirname, '../../resources/logo.png')
    : join(process.resourcesPath, 'logo.png')
  const icon = nativeImage.createFromPath(iconPath)

  console.log('[Window] Icon path:', iconPath)
  console.log('[Window] Icon isEmpty:', icon.isEmpty())

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: process.platform === 'win32', // Windows 下直接显示，便于调试
    autoHideMenuBar: true, // 自动隐藏菜单栏（用户可按 Alt 键唤起）
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      devTools: true // 确保开发工具可用
    }
  })

  console.log('[Window] BrowserWindow created')

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 添加错误监听，帮助诊断 Windows 下的问题
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Window] Failed to load:', errorCode, errorDescription)
    mainWindow.show() // 即使加载失败也显示窗口，便于看到错误
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Window] Renderer process gone:', details.reason, 'exitCode:', details.exitCode)
  })

  // 添加超时保护：如果 5 秒后还没显示，强制显示窗口
  setTimeout(() => {
    if (!mainWindow.isVisible()) {
      console.warn('[Window] Timeout: forcing window to show')
      mainWindow.show()
      mainWindow.webContents.openDevTools() // 自动打开开发者工具查看错误
    }
  }, 5000)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 记录加载的路径，便于排查
  const loadPath = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? process.env['ELECTRON_RENDERER_URL']
    : join(__dirname, '../renderer/index.html')
  console.log('[Window] Loading:', loadPath)

  return mainWindow
}
