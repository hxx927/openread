import { BrowserWindow, globalShortcut } from 'electron'
import { handle } from '@/lib/main/shared'

/** 隐蔽能力的运行时状态(单窗口应用,进程内单例即可) */
const state = {
  opacity: 1,
  alwaysOnTop: false,
  contentProtection: false,
  bossKey: 'Control+Shift+X',
  bossKeyEnabled: false,
}

/** 显示 / 隐藏窗口(老板键) */
function toggleVisible(window: BrowserWindow): boolean {
  if (window.isVisible() && !window.isMinimized()) {
    window.hide()
    return false
  }
  window.show()
  window.focus()
  return true
}

/** 注册/更新老板键全局快捷键 */
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
  // 失焦最小化:点到别的窗口就最小化,点任务栏图标恢复
  let blurHandler: (() => void) | null = null

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

  handle('native-set-auto-hide-on-blur', (enabled: boolean) => {
    if (blurHandler) {
      window.removeListener('blur', blurHandler)
      blurHandler = null
    }
    if (enabled) {
      blurHandler = () => {
        if (!window.isDestroyed() && !window.isMinimized()) window.minimize()
      }
      window.on('blur', blurHandler)
    }
    return enabled
  })
}

/** 应用退出时清理全局快捷键 */
export const unregisterNativeShortcuts = () => {
  globalShortcut.unregisterAll()
}
