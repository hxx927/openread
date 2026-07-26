import { create } from 'zustand'
import type { Book } from '@/lib/conveyor/api/reader-api'
import { extractMeta } from '@/app/features/reader/cover'

export type Theme = 'light' | 'sepia' | 'dark'
export type SortKey = 'recent' | 'title' | 'added'
export type Flow = 'paginated' | 'scrolled'

export interface ReaderSettings {
  fontSize: number // px
  lineHeight: number
  theme: Theme
  fontFamily: string // CSS font-family(空=默认)
  flow: Flow // 翻页 / 滚动
}

/** 字体预设(值为 CSS font-family) */
export const FONT_OPTIONS: { key: string; label: string; css: string }[] = [
  { key: 'default', label: '默认', css: '' },
  { key: 'serif', label: '宋体', css: '"Noto Serif SC","Songti SC",SimSun,serif' },
  { key: 'sans', label: '黑体', css: '"Microsoft YaHei","PingFang SC","Source Han Sans SC",sans-serif' },
  { key: 'kai', label: '楷体', css: '"Kaiti SC","KaiTi","STKaiti",serif' },
]

const DEFAULTS: ReaderSettings = { fontSize: 20, lineHeight: 1.6, theme: 'light', fontFamily: '', flow: 'paginated' }

const SETTINGS_KEY = 'openread.reader.settings'
const loadSettings = (): ReaderSettings => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

export const FONT_FORMATS = ['epub', 'mobi', 'azw3', 'azw', 'fb2', 'fbz', 'cbz']
export const SUPPORTED_EXT = [...FONT_FORMATS, 'pdf', 'txt']

export function bookFromPath(path: string): Book {
  const name = path.replace(/\\/g, '/').split('/').pop() || path
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
  const title = dot >= 0 ? name.slice(0, dot) : name
  const now = Date.now()
  return {
    id: `bk-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    author: '',
    path,
    format: ext,
    addedAt: now,
    lastReadAt: now,
    progress: 0,
    location: '',
    cover: '',
  }
}

interface ReaderState {
  books: Book[]
  current: Book | null
  settings: ReaderSettings
  query: string
  sort: SortKey
  importing: boolean
  loadBooks: () => Promise<void>
  addPaths: (paths: string[]) => Promise<void>
  importBooks: () => Promise<void>
  openBook: (b: Book) => void
  closeBook: () => Promise<void>
  removeBook: (id: string) => Promise<void>
  updateMeta: (patch: Partial<Book>) => void
  saveProgress: (fraction: number, location: string) => void
  setSettings: (patch: Partial<ReaderSettings>) => void
  setQuery: (q: string) => void
  setSort: (s: SortKey) => void
  visibleBooks: () => Book[]
}

const reader = () => window.conveyor.reader

export const useReaderStore = create<ReaderState>((set, get) => ({
  books: [],
  current: null,
  settings: loadSettings(),
  query: '',
  sort: 'recent',
  importing: false,

  loadBooks: async () => set({ books: await reader().listBooks() }),

  addPaths: async (paths) => {
    const supported = paths.filter((p) => SUPPORTED_EXT.includes((p.split('.').pop() || '').toLowerCase()))
    if (!supported.length) return
    const existing = get().books
    const newBooks: Book[] = []
    for (const p of supported) {
      if (existing.some((b) => b.path === p)) continue
      const book = bookFromPath(p)
      await reader().upsertBook(book)
      newBooks.push(book)
    }
    await get().loadBooks()
    const first = newBooks[0] ?? get().books.find((b) => supported.includes(b.path))
    if (first) set({ current: get().books.find((b) => b.id === first.id) ?? first })

    // 后台提取封面 + 元数据(不阻塞打开)
    set({ importing: true })
    for (const b of newBooks) {
      const meta = await extractMeta(b.path, b.format)
      if (meta.cover || meta.title || meta.author) {
        const merged = { ...b, cover: meta.cover || b.cover, title: meta.title || b.title, author: meta.author || b.author }
        await reader().upsertBook(merged)
      }
    }
    set({ importing: false })
    await get().loadBooks()
  },

  importBooks: async () => {
    const paths = await reader().openDialog()
    await get().addPaths(paths)
  },

  openBook: (b) => set({ current: b }),

  closeBook: async () => {
    set({ current: null })
    await get().loadBooks()
  },

  removeBook: async (id) => {
    await reader().removeBook(id)
    await get().loadBooks()
  },

  updateMeta: (patch) => {
    const cur = get().current
    if (!cur) return
    const next = { ...cur, ...patch }
    set({ current: next })
    reader().upsertBook(next)
    set({ books: get().books.map((b) => (b.id === next.id ? { ...b, ...patch } : b)) })
  },

  saveProgress: (fraction, location) => {
    const cur = get().current
    if (!cur) return
    set({ current: { ...cur, progress: fraction, location } })
    reader().setProgress(cur.id, fraction, location)
  },

  setSettings: (patch) => {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  },

  setQuery: (q) => set({ query: q }),
  setSort: (s) => set({ sort: s }),

  visibleBooks: () => {
    const { books, query, sort } = get()
    const q = query.trim().toLowerCase()
    const filtered = q
      ? books.filter((b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q))
      : books
    const sorted = [...filtered]
    if (sort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
    else if (sort === 'added') sorted.sort((a, b) => b.addedAt - a.addedAt)
    else sorted.sort((a, b) => b.lastReadAt - a.lastReadAt)
    return sorted
  },
}))
