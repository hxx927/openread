import { BrowserWindow, globalShortcut, screen, type Rectangle } from 'electron'
import { handle } from '@/lib/main/shared'

/** 隐蔽能力的运行时状态 */
const state = {
  opacity: 1,
  alwaysOnTop: false,
  contentProtection: false,
  bossKey: 'Control+Shift+X',
  bossKeyEnabled: false,
}

function toggleVisible(window: BrowserWindow): boolean {
  if (window.isVisible() && !window.isMinimized()) {
    window.hide()
    return false
  }
  window.show()
  window.focus()
  return true
}

function registerBossKey(window: BrowserWindow, accelerator: string): boolean {
  globalShortcut.unregister(state.bossKey)
  try {
    const ok = globalShortcut.register(accelerator, () => toggleVisible(window))
    if (ok) state.bossKey = accelerator
    return ok
  } catch {
    return false
  }
}

const inRect = (p: { x: number; y: number }, r: Rectangle) =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height

export const registerNativeHandlers = (window: BrowserWindow) => {
  handle('native-get-state', () => ({
    opacity: state.opacity,
    alwaysOnTop: state.alwaysOnTop,
    contentProtection: state.contentProtection,
    visible: window.isVisible(),
  }))

  handle('native-set-opacity', (value: number) => {
    state.opacity = value
    window.setOpacity(value)
    return value
  })

  handle('native-set-always-on-top', (enabled: boolean) => {
    state.alwaysOnTop = enabled
    window.setAlwaysOnTop(enabled, 'screen-saver')
    return enabled
  })

  handle('native-set-content-protection', (enabled: boolean) => {
    state.contentProtection = enabled
    window.setContentProtection(enabled)
    return enabled
  })

  handle('native-toggle-visible', () => toggleVisible(window))

  handle('native-set-boss-key', (accelerator: string) => registerBossKey(window, accelerator))

  handle('native-set-boss-key-enabled', (enabled: boolean) => {
    state.bossKeyEnabled = enabled
    if (enabled) return registerBossKey(window, state.bossKey)
    globalShortcut.unregister(state.bossKey)
    return false
  })

  /**
   * 自动隐藏(摸鱼)——轮询鼠标位置:
   *  - 指针在窗口内:显示
   *  - 指针连续移出窗口约 600ms:隐藏;移回原区域立即再现
   *  开启时同时 skipTaskbar,避免任务栏按钮反复闪烁;窗口藏了从"托盘图标"点回来。
   */
  const auto = { enabled: false, outside: 0, lastBounds: null as Rectangle | null }
  let timer: NodeJS.Timeout | null = null
  const HIDE_AFTER = 3 // 连续 3 拍(~600ms)在外才隐藏,消除边缘抖动

  const tick = () => {
    if (window.isDestroyed() || !auto.enabled || window.isMinimized()) return
    if (window.isVisible()) auto.lastBounds = window.getBounds()
    const lb = auto.lastBounds
    if (!lb) return
    const inside = inRect(screen.getCursorScreenPoint(), lb)
    if (inside) {
      auto.outside = 0
      if (!window.isVisible()) window.show()
    } else {
      auto.outside++
      if (window.isVisible() && auto.outside >= HIDE_AFTER) window.hide()
    }
  }

  handle('native-set-auto-hide-on-blur', (enabled: boolean) => {
    auto.enabled = enabled
    auto.outside = 0
    window.setSkipTaskbar(enabled)
    if (enabled) {
      auto.lastBounds = window.getBounds()
      if (!timer) timer = setInterval(tick, 200)
    } else {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      if (!window.isVisible()) window.show()
    }
    return enabled
  })

  window.on('closed', () => {
    if (timer) clearInterval(timer)
  })
}

/** 应用退出时清理全局快捷键 */
export const unregisterNativeShortcuts = () => {
  globalShortcut.unregisterAll()
}
