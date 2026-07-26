import { BrowserWindow, globalShortcut } from 'electron'
import { handle } from '@/lib/main/shared'
import { initAutoHide, setAutoHide, stopAutoHide, revealWindow } from '@/lib/main/autohide'

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
  revealWindow() // 显示并解除自动隐藏的锁定
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

export const registerNativeHandlers = (window: BrowserWindow) => {
  initAutoHide(window)

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

  // 自动隐藏(离屏 peek + blur 锁定,详见 autohide.ts)
  handle('native-set-auto-hide-on-blur', (enabled: boolean) => setAutoHide(enabled))

  window.on('closed', () => stopAutoHide())
}

/** 应用退出时清理全局快捷键 */
export const unregisterNativeShortcuts = () => {
  globalShortcut.unregisterAll()
}
