import { BrowserWindow, shell, app } from 'electron'
import { join } from 'path'
import appIcon from '@/resources/build/icon.png?asset'
import { registerResourcesProtocol } from './protocols'
import { registerWindowHandlers } from '@/lib/conveyor/handlers/window-handler'
import { registerAppHandlers } from '@/lib/conveyor/handlers/app-handler'
import { registerNativeHandlers, unregisterNativeShortcuts } from '@/lib/conveyor/handlers/native-handler'
import { registerReaderHandlers } from '@/lib/conveyor/handlers/reader-handler'
import { registerLockHandlers } from '@/lib/conveyor/handlers/lock-handler'
import { registerSourceHandlers } from '@/lib/conveyor/handlers/source-handler'
import { loadBounds, trackBounds } from './window-state'
import { createTray, destroyTray } from './tray'

export function createAppWindow(): void {
  // Register custom protocol for resources
  registerResourcesProtocol()

  // 恢复上次窗口尺寸/位置
  const saved = loadBounds()

  // Create the main window.
  const mainWindow = new BrowserWindow({
    width: saved?.width ?? 1160,
    height: saved?.height ?? 780,
    x: saved?.x,
    y: saved?.y,
    minWidth: 360,
    minHeight: 400,
    show: false,
    // 透明窗口:透明摸鱼模式下抠掉页面背景,正文清爽地浮在桌面上。
    // 关键:全程不调用 setOpacity(透明窗口 + setOpacity 在部分显卡上会崩)。
    transparent: true,
    backgroundColor: '#00000000',
    icon: appIcon,
    frame: false,
    titleBarStyle: 'hiddenInset',
    title: 'OpenRead 摸鱼阅读',
    maximizable: true,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
      // 内嵌浏览器需要 <webview> 标签
      webviewTag: true,
    },
  })

  // Register IPC events for the main window.
  registerWindowHandlers(mainWindow)
  registerAppHandlers(app)
  registerNativeHandlers(mainWindow)
  registerReaderHandlers(mainWindow)
  registerLockHandlers(mainWindow)
  registerSourceHandlers(mainWindow)

  try {
    if (saved?.maximized) mainWindow.maximize()
  } catch {
    /* 忽略:个别环境下透明窗口最大化可能异常 */
  }
  trackBounds(mainWindow)

  // 常驻系统托盘图标:窗口隐藏后从这里点回来
  createTray(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 宿主页面本身的外部链接走系统浏览器
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // <webview> 内的 window.open / target=_blank:不新开系统窗口,改为通知渲染层新建标签
  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) mainWindow.webContents.send('browser-open-tab', url)
        return { action: 'deny' }
      })
    }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 退出前清理老板键等全局快捷键 + 托盘
app.on('will-quit', () => {
  unregisterNativeShortcuts()
  destroyTray()
})
