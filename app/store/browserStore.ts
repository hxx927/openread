import { create } from 'zustand'
import type { WebviewElement } from '@/app/types/webview'

export interface Tab {
  id: string
  url: string // '' = 导航主页;非空 = 网页
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

export interface MySite {
  id: string
  name: string
  url: string
}

let seq = 1
const nextId = () => `tab-${seq++}`

/** webview DOM 元素注册表(非响应式) */
const registry = new Map<string, WebviewElement>()
export const webviewRegistry = {
  set: (id: string, el: WebviewElement | null) => {
    if (el) registry.set(id, el)
    else registry.delete(id)
  },
  get: (id: string | undefined) => (id ? registry.get(id) : undefined),
}

const MYSITES_KEY = 'openread.mysites'
const loadMySites = (): MySite[] => {
  try {
    const v = JSON.parse(localStorage.getItem(MYSITES_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
const saveMySites = (s: MySite[]) => localStorage.setItem(MYSITES_KEY, JSON.stringify(s))

interface BrowserState {
  tabs: Tab[]
  activeId: string | null
  mySites: MySite[]
  newTab: (url?: string) => string
  closeTab: (id: string) => void
  setActive: (id: string) => void
  patchTab: (id: string, patch: Partial<Tab>) => void
  navigate: (url: string) => void // 在当前标签打开地址
  goHome: () => void // 当前标签回到导航页
  addSite: (name: string, url: string) => void
  removeSite: (id: string) => void
}

export const useBrowserStore = create<BrowserState>((set, get) => ({
  tabs: [{ id: 'tab-0', url: '', title: '导航', loading: false, canGoBack: false, canGoForward: false }],
  activeId: 'tab-0',
  mySites: loadMySites(),

  newTab: (url = '') => {
    const id = nextId()
    set((s) => ({
      tabs: [
        ...s.tabs,
        { id, url, title: url ? '新标签页' : '导航', loading: !!url, canGoBack: false, canGoForward: false },
      ],
      activeId: id,
    }))
    return id
  },

  closeTab: (id) => {
    webviewRegistry.set(id, null)
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      const tabs = s.tabs.filter((t) => t.id !== id)
      let activeId = s.activeId
      if (s.activeId === id) activeId = tabs.length ? tabs[Math.max(0, idx - 1)].id : null
      return { tabs, activeId }
    })
    if (get().tabs.length === 0) get().newTab()
  },

  setActive: (id) => set({ activeId: id }),

  patchTab: (id, patch) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

  navigate: (url) => {
    const { activeId } = get()
    if (!activeId) return
    const el = webviewRegistry.get(activeId)
    get().patchTab(activeId, { url, loading: true })
    // 已有 webview(网页→网页)直接导航;从导航页首次进入则由 React 挂载 webview 加载
    if (el) el.loadURL(url)
  },

  goHome: () => {
    const { activeId } = get()
    if (!activeId) return
    webviewRegistry.set(activeId, null)
    get().patchTab(activeId, { url: '', title: '导航', loading: false, canGoBack: false, canGoForward: false })
  },

  addSite: (name, url) => {
    const clean = url.trim()
    const withProto = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`
    const site: MySite = { id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: name.trim() || withProto, url: withProto }
    const next = [...get().mySites, site]
    set({ mySites: next })
    saveMySites(next)
  },

  removeSite: (id) => {
    const next = get().mySites.filter((s) => s.id !== id)
    set({ mySites: next })
    saveMySites(next)
  },
}))

/** 把用户输入规范成 URL:是网址就补协议,否则当作 Bing 搜索 */
export function toUrl(input: string): string {
  const s = input.trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  if (/^[^\s]+\.[^\s]{2,}$/.test(s) && !s.includes(' ')) return `https://${s}`
  return `https://www.bing.com/search?q=${encodeURIComponent(s)}`
}
