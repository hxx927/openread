import { create } from 'zustand'
import type { WebviewElement } from '@/app/types/webview'

export interface Tab {
  id: string
  url: string // 当前实际地址
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

/** 常用快捷站点(可自行增删)—— 借鉴墨鱼的"AI 聚合",直接开各家官网,凭据留在各站 */
export const QUICK_SITES = [
  { name: '豆包', url: 'https://www.doubao.com' },
  { name: 'DeepSeek', url: 'https://chat.deepseek.com' },
  { name: 'Kimi', url: 'https://www.kimi.com' },
  { name: '元宝', url: 'https://yuanbao.tencent.com' },
  { name: '起点', url: 'https://www.qidian.com' },
  { name: '知乎', url: 'https://www.zhihu.com' },
  { name: 'B站', url: 'https://www.bilibili.com' },
]

export const HOME_URL = 'https://www.bing.com'

let seq = 1
const nextId = () => `tab-${seq++}`

/**
 * webview DOM 元素注册表(非响应式)。
 * 每个 <webview> 挂载时把自己登记进来,工具栏用它对"当前标签"下命令。
 */
const registry = new Map<string, WebviewElement>()
export const webviewRegistry = {
  set: (id: string, el: WebviewElement | null) => {
    if (el) registry.set(id, el)
    else registry.delete(id)
  },
  get: (id: string | undefined) => (id ? registry.get(id) : undefined),
}

interface BrowserState {
  tabs: Tab[]
  activeId: string | null
  newTab: (url?: string) => string
  closeTab: (id: string) => void
  setActive: (id: string) => void
  patchTab: (id: string, patch: Partial<Tab>) => void
  navigate: (url: string) => void // 在当前标签打开地址(地址栏用)
}

export const useBrowserStore = create<BrowserState>((set, get) => ({
  tabs: [{ id: 'tab-0', url: HOME_URL, title: '新标签页', loading: true, canGoBack: false, canGoForward: false }],
  activeId: 'tab-0',

  newTab: (url = HOME_URL) => {
    const id = nextId()
    set((s) => ({
      tabs: [...s.tabs, { id, url, title: '新标签页', loading: true, canGoBack: false, canGoForward: false }],
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
      if (s.activeId === id) {
        activeId = tabs.length ? tabs[Math.max(0, idx - 1)].id : null
      }
      return { tabs, activeId }
    })
    // 关到最后一个也保留一个空标签,避免空白
    if (get().tabs.length === 0) get().newTab()
  },

  setActive: (id) => set({ activeId: id }),

  patchTab: (id, patch) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

  navigate: (url) => {
    const { activeId } = get()
    const el = webviewRegistry.get(activeId ?? undefined)
    if (el && activeId) {
      el.loadURL(url)
      get().patchTab(activeId, { url, loading: true })
    }
  },
}))

/** 把用户在地址栏输入的内容规范成 URL:是网址就补协议,否则当作 Bing 搜索 */
export function toUrl(input: string): string {
  const s = input.trim()
  if (!s) return HOME_URL
  if (/^https?:\/\//i.test(s)) return s
  // 形如 domain.tld 或 含点无空格 -> 当作网址
  if (/^[^\s]+\.[^\s]{2,}$/.test(s) && !s.includes(' ')) return `https://${s}`
  return `https://www.bing.com/search?q=${encodeURIComponent(s)}`
}
