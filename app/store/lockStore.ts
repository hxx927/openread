import { create } from 'zustand'

interface LockState {
  ready: boolean
  enabled: boolean
  available: boolean
  locked: boolean
  init: () => Promise<void>
  lockNow: () => void
  unlock: (pin: string) => Promise<boolean>
  enable: (pin: string) => Promise<boolean>
  disable: (pin: string) => Promise<boolean>
}

const lock = () => window.conveyor.lock

export const useLockStore = create<LockState>((set, get) => ({
  ready: false,
  enabled: false,
  available: true,
  locked: false,

  init: async () => {
    const s = await lock().status()
    set({ ready: true, enabled: s.enabled, available: s.available, locked: s.enabled })
    // 系统挂起/锁屏时自动锁定
    lock().onLock(() => {
      if (get().enabled) set({ locked: true })
    })
  },

  lockNow: () => {
    if (get().enabled) set({ locked: true })
  },

  unlock: async (pin) => {
    const ok = await lock().verify(pin)
    if (ok) set({ locked: false })
    return ok
  },

  enable: async (pin) => {
    const ok = await lock().setPin(pin)
    if (ok) set({ enabled: true })
    return ok
  },

  disable: async (pin) => {
    const ok = await lock().disable(pin)
    if (ok) set({ enabled: false, locked: false })
    return ok
  },
}))
