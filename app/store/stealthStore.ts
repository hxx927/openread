import { create } from 'zustand'

const KEY = 'openread.stealth'
type Persisted = { bossKeyEnabled: boolean; autoHideOnBlur: boolean }

const load = (): Persisted => {
  try {
    return { bossKeyEnabled: false, autoHideOnBlur: false, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { bossKeyEnabled: false, autoHideOnBlur: false }
  }
}
const save = (p: Persisted) => localStorage.setItem(KEY, JSON.stringify(p))

interface StealthState {
  transparent: boolean // 透明摸鱼:窗口 + 页面背景透明,正文浮在桌面上
  autoScroll: boolean
  bossKeyEnabled: boolean // 老板键总开关(默认关)
  autoHideOnBlur: boolean // 失焦自动隐藏(默认关)
  setTransparent: (v: boolean) => void
  toggleTransparent: () => void
  toggleAutoScroll: () => void
  init: () => void
  setBossKeyEnabled: (v: boolean) => void
  setAutoHideOnBlur: (v: boolean) => void
}

const native = () => window.conveyor.native

export const useStealthStore = create<StealthState>((set, get) => {
  const persisted = load()
  return {
    transparent: false,
    autoScroll: false,
    bossKeyEnabled: persisted.bossKeyEnabled,
    autoHideOnBlur: persisted.autoHideOnBlur,

    setTransparent: (v) => set({ transparent: v, autoScroll: v ? get().autoScroll : false }),
    toggleTransparent: () => set({ transparent: !get().transparent, autoScroll: false }),
    toggleAutoScroll: () => set({ autoScroll: !get().autoScroll }),

    // 启动时把持久化的隐蔽偏好同步到主进程
    init: () => {
      native().setBossKeyEnabled(get().bossKeyEnabled)
      native().setAutoHideOnBlur(get().autoHideOnBlur)
    },

    setBossKeyEnabled: (v) => {
      native().setBossKeyEnabled(v)
      set({ bossKeyEnabled: v })
      save({ bossKeyEnabled: v, autoHideOnBlur: get().autoHideOnBlur })
    },
    setAutoHideOnBlur: (v) => {
      native().setAutoHideOnBlur(v)
      set({ autoHideOnBlur: v })
      save({ bossKeyEnabled: get().bossKeyEnabled, autoHideOnBlur: v })
    },
  }
})
