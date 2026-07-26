import { app, type BrowserWindow } from 'electron'
import { join } from 'path'
import fse from 'fs-extra'

export interface WindowBounds {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
}

const file = () => join(app.getPath('userData'), 'window-state.json')

export function loadBounds(): WindowBounds | null {
  try {
    const b = fse.readJSONSync(file())
    if (b && typeof b.width === 'number' && typeof b.height === 'number') return b
  } catch {
    /* 首次运行,无记录 */
  }
  return null
}

/** 监听窗口尺寸/位置变化并持久化(带简单防抖) */
export function trackBounds(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null
  const save = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const maximized = win.isMaximized()
      const { width, height, x, y } = win.getNormalBounds()
      fse.writeJSON(file(), { width, height, x, y, maximized }, { spaces: 0 }).catch(() => {})
    }, 500)
  }
  win.on('resize', save)
  win.on('move', save)
  win.on('maximize', save)
  win.on('unmaximize', save)
}
