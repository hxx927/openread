import { BrowserWindow, globalShortcut } from 'electron'
import { handle } from '@/lib/main/shared'

/** 隐蔽能力的运行时状态(单窗口应用,进程内单例即可) */
const state = {
  opacity: 1,
  alwaysOnTop: false,
  contentProtection: false,
  bossKey: 'Control+Shift+X',
}

/** 显示 / 隐藏窗口(老板键与手动隐藏共用) */
function toggleVisible(window: BrowserWindow): boolean {
  if (window.isVisible()) {
    window.hide()
    return false
  }
  window.show()
  window.focus()
  return true
}

/** 注册老板键全局快捷键;先清掉旧的,返回是否成功 */
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
  // 启动即注册默认老板键
  registerBossKey(window, state.bossKey)

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
    // screen-saver 级别可浮在全屏应用之上,最适合"摸鱼"
    window.setAlwaysOnTop(enabled, 'screen-saver')
    return enabled
  })

  handle('native-set-content-protection', (enabled: boolean) => {
    state.contentProtection = enabled
    // 开启后:微信/钉钉截图、系统截图、录屏软件都拍不到本窗口
    window.setContentProtection(enabled)
    return enabled
  })

  handle('native-toggle-visible', () => toggleVisible(window))

  handle('native-set-boss-key', (accelerator: string) => registerBossKey(window, accelerator))
}

/** 应用退出时清理全局快捷键 */
export const unregisterNativeShortcuts = () => {
  globalShortcut.unregisterAll()
}
