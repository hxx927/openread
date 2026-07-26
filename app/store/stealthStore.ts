import { create } from 'zustand'

interface StealthState {
  transparent: boolean // 透明摸鱼模式:窗口 + 页面背景透明,正文浮在桌面上
  autoScroll: boolean
  setTransparent: (v: boolean) => void
  toggleTransparent: () => void
  toggleAutoScroll: () => void
}

export const useStealthStore = create<StealthState>((set, get) => ({
  transparent: false,
  autoScroll: false,
  setTransparent: (v) => set({ transparent: v, autoScroll: v ? get().autoScroll : false }),
  toggleTransparent: () => set({ transparent: !get().transparent, autoScroll: false }),
  toggleAutoScroll: () => set({ autoScroll: !get().autoScroll }),
}))
