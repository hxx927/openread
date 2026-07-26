import { create } from 'zustand'
import type { Book } from '@/lib/conveyor/api/reader-api'

export type Theme = 'light' | 'sepia' | 'dark'

export interface ReaderSettings {
  fontSize: number // px
  lineHeight: number
  theme: Theme
}

const SETTINGS_KEY = 'openread.reader.settings'
const loadSettings = (): ReaderSettings => {
  try {
    return { fontSize: 20, lineHeight: 1.6, theme: 'light', ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }
  } catch {
    return { fontSize: 20, lineHeight: 1.6, theme: 'light' }
  }
}

export const FONT_FORMATS = ['epub', 'mobi', 'azw3', 'azw', 'fb2', 'fbz', 'cbz']

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
  loadBooks: () => Promise<void>
  importBooks: () => Promise<void>
  openBook: (b: Book) => void
  closeBook: () => Promise<void>
  removeBook: (id: string) => Promise<void>
  updateMeta: (patch: Partial<Book>) => void
  saveProgress: (fraction: number, location: string) => void
  setSettings: (patch: Partial<ReaderSettings>) => void
}

const reader = () => window.conveyor.reader

export const useReaderStore = create<ReaderState>((set, get) => ({
  books: [],
  current: null,
  settings: loadSettings(),

  loadBooks: async () => set({ books: await reader().listBooks() }),

  importBooks: async () => {
    const paths = await reader().openDialog()
    if (!paths.length) return
    const existing = get().books
    let firstNew: Book | null = null
    for (const p of paths) {
      const already = existing.find((b) => b.path === p)
      if (already) {
        firstNew = firstNew ?? already
        continue
      }
      const book = bookFromPath(p)
      await reader().upsertBook(book)
      firstNew = firstNew ?? book
    }
    await get().loadBooks()
    if (firstNew) set({ current: get().books.find((b) => b.id === firstNew!.id) ?? firstNew })
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
}))
