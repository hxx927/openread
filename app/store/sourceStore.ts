import { create } from 'zustand'
import type { BookSource } from '@/lib/conveyor/api/source-api'
import { sourceEngine, disposeRuntime, type SourceBook, type SourceChapter } from '@/app/features/source/engine'

export interface Hit extends SourceBook {
  sourceId: string
  sourceName: string
}

interface SourceState {
  sources: BookSource[]
  query: string
  searching: boolean
  hits: Hit[]
  errors: string[]

  book: Hit | null
  chapters: SourceChapter[]
  loadingChapters: boolean
  chapterIndex: number
  content: string
  loadingContent: boolean

  loadSources: () => Promise<void>
  importFromFile: () => Promise<void>
  addFromText: (code: string, name?: string) => Promise<void>
  addFromUrl: (url: string) => Promise<string | null> // 返回错误信息,成功为 null
  removeSource: (id: string) => Promise<void>
  toggleSource: (id: string, enabled: boolean) => Promise<void>

  setQuery: (q: string) => void
  search: () => Promise<void>
  openBook: (h: Hit) => Promise<void>
  openChapter: (index: number) => Promise<void>
  backToList: () => void
  closeBook: () => void
}

const api = () => window.conveyor.source

export const useSourceStore = create<SourceState>((set, get) => ({
  sources: [],
  query: '',
  searching: false,
  hits: [],
  errors: [],

  book: null,
  chapters: [],
  loadingChapters: false,
  chapterIndex: -1,
  content: '',
  loadingContent: false,

  loadSources: async () => set({ sources: await api().list() }),

  importFromFile: async () => {
    const files = await api().openFile()
    for (const f of files) await api().add(f.code, f.name)
    await get().loadSources()
  },

  addFromText: async (code, name) => {
    if (!code.trim()) return
    await api().add(code, name)
    await get().loadSources()
  },

  addFromUrl: async (url) => {
    if (!url.trim()) return '请输入链接'
    try {
      await api().addUrl(url.trim())
      await get().loadSources()
      return null
    } catch (e) {
      // 主进程抛出的错误经 IPC 包装,取最后一段可读信息
      const msg = (e as Error).message || String(e)
      return msg.replace(/^.*Error(?: invoking remote method '[^']+')?:\s*/s, '')
    }
  },

  removeSource: async (id) => {
    disposeRuntime(id)
    await api().remove(id)
    await get().loadSources()
  },

  toggleSource: async (id, enabled) => {
    disposeRuntime(id)
    await api().toggle(id, enabled)
    await get().loadSources()
  },

  setQuery: (q) => set({ query: q }),

  search: async () => {
    const key = get().query.trim()
    const enabled = get().sources.filter((s) => s.enabled)
    if (!key || !enabled.length) return
    set({ searching: true, hits: [], errors: [], book: null, chapters: [], content: '' })

    const settled = await Promise.allSettled(
      enabled.map(async (s) => {
        const list = await sourceEngine.search(s, key, 1)
        return (Array.isArray(list) ? list : []).map((b) => ({ ...b, sourceId: s.id, sourceName: s.name }))
      })
    )

    const hits: Hit[] = []
    const errors: string[] = []
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') hits.push(...r.value)
      else errors.push(`${enabled[i].name}: ${r.reason?.message ?? r.reason}`)
    })
    set({ hits, errors, searching: false })
  },

  openBook: async (h) => {
    const src = get().sources.find((s) => s.id === h.sourceId)
    if (!src) return
    set({ book: h, chapters: [], loadingChapters: true, content: '', chapterIndex: -1 })
    try {
      let tocUrl = h.tocUrl
      if (!tocUrl) {
        try {
          const detail = await sourceEngine.info(src, h.bookUrl)
          tocUrl = detail?.tocUrl || h.bookUrl
        } catch {
          tocUrl = h.bookUrl
        }
      }
      const chapters = await sourceEngine.chapter(src, tocUrl!)
      set({ chapters: Array.isArray(chapters) ? chapters : [], loadingChapters: false })
    } catch (e) {
      set({ loadingChapters: false, errors: [`目录加载失败: ${(e as Error).message}`] })
    }
  },

  openChapter: async (index) => {
    const { book, chapters } = get()
    const ch = chapters[index]
    const src = book && get().sources.find((s) => s.id === book.sourceId)
    if (!book || !ch || !src) return
    set({ chapterIndex: index, loadingContent: true, content: '' })
    try {
      const url = ch.chapterId || ch.url || ''
      const text = await sourceEngine.content(src, String(url))
      set({ content: typeof text === 'string' ? text : String(text ?? ''), loadingContent: false })
    } catch (e) {
      set({ content: `【正文加载失败】${(e as Error).message}`, loadingContent: false })
    }
  },

  backToList: () => set({ chapterIndex: -1, content: '' }),
  closeBook: () => set({ book: null, chapters: [], chapterIndex: -1, content: '' }),
}))
