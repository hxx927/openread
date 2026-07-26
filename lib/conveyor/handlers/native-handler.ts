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
   *  - 指针移出窗口:隐藏(peek);移回原区域再次显示
   *  - 用户点击了别的窗口(窗口失焦):锁定隐藏(最小化),不再随鼠标浮现;点任务栏图标恢复
   */
  const auto = { enabled: false, dismissed: false, peekHiding: false, lastBounds: null as Rectangle | null }
  let timer: NodeJS.Timeout | null = null

  const tick = () => {
    if (window.isDestroyed() || !auto.enabled || auto.dismissed || window.isMinimized()) return
    if (window.isVisible()) auto.lastBounds = window.getBounds()
    const lb = auto.lastBounds
    if (!lb) return
    const inside = inRect(screen.getCursorScreenPoint(), lb)
    if (inside && !window.isVisible()) {
      window.show()
    } else if (!inside && window.isVisible()) {
      auto.peekHiding = true
      window.hide()
      setTimeout(() => (auto.peekHiding = false), 300)
    }
  }

  window.on('blur', () => {
    // 我们自己 peek 隐藏引起的 blur 忽略;真正切到别的窗口才锁定隐藏
    if (!auto.enabled || auto.peekHiding) return
    auto.dismissed = true
    if (!window.isMinimized() && window.isVisible()) window.minimize()
  })
  const undismiss = () => {
    if (auto.enabled) auto.dismissed = false
  }
  window.on('restore', undismiss)
  window.on('focus', undismiss)

  handle('native-set-auto-hide-on-blur', (enabled: boolean) => {
    auto.enabled = enabled
    auto.dismissed = false
    if (enabled) {
      auto.lastBounds = window.getBounds()
      if (!timer) timer = setInterval(tick, 150)
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
