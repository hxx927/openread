import { Tray, Menu, nativeImage, app, type BrowserWindow } from 'electron'
import appIcon from '@/resources/build/icon.png?asset'
import { revealWindow } from './autohide'

let tray: Tray | null = null

/** 常驻系统托盘图标(仿墨鱼):窗口隐藏后可从这里点回来 */
export function createTray(window: BrowserWindow): Tray {
  const image = nativeImage.createFromPath(appIcon).resize({ width: 16, height: 16 })
  tray = new Tray(image.isEmpty() ? nativeImage.createFromPath(appIcon) : image)
  tray.setToolTip('OpenRead · 摸鱼阅读')

  tray.on('click', () => revealWindow()) // 唤回窗口并解除自动隐藏锁定

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示 OpenRead', click: () => revealWindow() },
      { label: '隐藏', click: () => window.hide() },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ])
  )

  return tray
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
