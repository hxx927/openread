import { screen, type BrowserWindow, type Rectangle } from 'electron'

/**
 * 摸鱼「自动隐藏」:
 *  - 指针在窗口内 → 显示
 *  - 指针移出窗口 ~200ms → 把窗口移到屏幕外(窗口仍聚焦,不算真正切走)
 *  - 指针移回原区域 → 窗口移回(瞄一眼即回)
 *  - 用户真的去点了别的窗口(窗口 blur)→ 锁定隐藏,指针移回也不再出现,需从托盘/老板键唤回
 * 开启时 skipTaskbar,避免任务栏按钮闪烁;唯一可靠的"切走"信号 = blur(离屏移动不会 blur)。
 */
const OFFSCREEN_X = -32000
const POLL_MS = 100
const HIDE_AFTER = 2 // 连续 2 拍(~200ms)在外才隐藏

const s = {
  enabled: false,
  dismissed: false,
  peeked: false,
  suppressBlur: false,
  outside: 0,
  saved: null as Rectangle | null,
}
let win: BrowserWindow | null = null
let timer: NodeJS.Timeout | null = null

const inRect = (p: { x: number; y: number }, r: Rectangle) =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height

function guard(fn: () => void) {
  s.suppressBlur = true
  fn()
  setTimeout(() => (s.suppressBlur = false), 60)
}

function peekHide() {
  if (s.peeked || !win) return
  s.saved = win.getBounds()
  s.peeked = true
  guard(() => win!.setPosition(OFFSCREEN_X, s.saved!.y)) // 移到屏外,保持聚焦
}

function peekShow() {
  if (!s.peeked || !win) return
  s.peeked = false
  if (s.saved) guard(() => win!.setBounds(s.saved!))
}

function tick() {
  if (!win || win.isDestroyed() || !s.enabled || win.isMinimized()) return
  if (!s.peeked && win.isVisible()) s.saved = win.getBounds()
  const b = s.saved
  if (!b) return
  const inside = inRect(screen.getCursorScreenPoint(), b)
  if (inside) {
    s.outside = 0
    if (!s.dismissed && s.peeked) peekShow()
  } else {
    s.outside++
    if (!s.peeked && s.outside >= HIDE_AFTER) peekHide()
  }
}

/** 注册一次(需要窗口引用) */
export function initAutoHide(window: BrowserWindow) {
  win = window
  window.on('blur', () => {
    if (!s.enabled || s.suppressBlur) return
    // 离屏移动不会 blur;能到这里说明用户真的切到了别的窗口 → 锁定隐藏
    s.dismissed = true
    if (!s.peeked) peekHide()
  })
}

/** 开关自动隐藏 */
export function setAutoHide(enabled: boolean): boolean {
  if (!win) return enabled
  s.enabled = enabled
  s.dismissed = false
  s.outside = 0
  win.setSkipTaskbar(enabled)
  if (enabled) {
    s.saved = win.getBounds()
    if (!timer) timer = setInterval(tick, POLL_MS)
  } else {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    peekShow()
    if (!win.isVisible()) win.show()
  }
  return enabled
}

/** 从托盘 / 老板键唤回:回到原位显示并解除锁定 */
export function revealWindow() {
  if (!win) return
  s.dismissed = false
  s.outside = 0
  peekShow()
  win.show()
  win.focus()
}

export function stopAutoHide() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
