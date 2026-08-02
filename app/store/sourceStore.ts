import { create } from 'zustand'
import type { BookSource } from '@/lib/conveyor/api/source-api'
import {
  sourceEngine,
  disposeRuntime,
  disposeAllRuntimes,
  type SourceBook,
  type SourceChapter,
  type SourceFindItem,
  type SourceFunctionName,
} from '@/app/features/source/engine'
import type { SourceMove, SourcePatch } from '@/lib/main/sources'

export interface Hit extends SourceBook {
  sourceId: string
  sourceName: string
}

export type SourceMode = 'search' | 'discover'

interface SourceState {
  sources: BookSource[]
  mode: SourceMode
  selectedSourceId: string

  query: string
  searching: boolean
  hits: Hit[]
  errors: string[]

  findItems: SourceFindItem[]
  selectedFind: SourceFindItem | null
  discoveryHits: Hit[]
  discoveryPage: number
  discovering: boolean
  discoveryError: string

  book: Hit | null
  chapters: SourceChapter[]
  loadingChapters: boolean
  chapterError: string
  chapterIndex: number
  content: string
  loadingContent: boolean

  loadSources: () => Promise<void>
  importFromFile: () => Promise<void>
  addFromText: (code: string, name?: string) => Promise<void>
  addFromUrl: (url: string) => Promise<string | null>
  updateSource: (id: string, patch: SourcePatch) => Promise<BookSource>
  moveSource: (id: string, direction: SourceMove) => Promise<void>
  removeSource: (id: string) => Promise<void>
  toggleSource: (id: string, enabled: boolean) => Promise<void>
  inspectSource: (id: string) => Promise<Record<SourceFunctionName, boolean>>
  clearSourceSession: (id: string) => Promise<void>

  setMode: (mode: SourceMode) => void
  selectSource: (id: string) => void
  setQuery: (q: string) => void
  search: () => Promise<void>
  loadFinds: (sourceId?: string) => Promise<void>
  openFind: (item: SourceFindItem, page?: number) => Promise<void>
  changeDiscoveryPage: (delta: number) => Promise<void>

  openBook: (h: Hit) => Promise<void>
  openChapter: (index: number) => Promise<void>
  backToList: () => void
  closeBook: () => void
  dispose: () => void
}

const api = () => window.conveyor.source
const message = (error: unknown) =>
  ((error as Error)?.message || String(error)).replace(/^.*Error(?: invoking remote method '[^']+')?:\s*/s, '')

function hit(source: BookSource, book: SourceBook): Hit {
  return { ...book, sourceId: source.id, sourceName: source.name }
}

let sourceListGeneration = 0
let searchGeneration = 0
let discoveryGeneration = 0
let bookGeneration = 0
let contentGeneration = 0

type StoreSet = (partial: Partial<SourceState>) => void
type StoreGet = () => SourceState

function invalidateSource(sourceId: string, replacementId: string, set: StoreSet, get: StoreGet): void {
  const current = get()
  const next: Partial<SourceState> = {
    searching: false,
    hits: [],
    errors: [],
  }
  searchGeneration++

  if (current.selectedSourceId === sourceId) {
    discoveryGeneration++
    Object.assign(next, {
      selectedSourceId: replacementId,
      findItems: [],
      selectedFind: null,
      discoveryHits: [],
      discoveryPage: 1,
      discovering: false,
      discoveryError: '',
    })
  }
  if (current.book?.sourceId === sourceId) {
    bookGeneration++
    contentGeneration++
    Object.assign(next, {
      book: null,
      chapters: [],
      loadingChapters: false,
      chapterError: '',
      chapterIndex: -1,
      content: '',
      loadingContent: false,
    })
  }
  set(next)
  disposeRuntime(sourceId)
}

async function loadDiscoveryResults(
  source: BookSource,
  item: SourceFindItem,
  page: number,
  generation: number,
  set: (partial: Partial<SourceState>) => void
): Promise<void> {
  if (!item.url) return
  set({ selectedFind: item, discoveryPage: page, discovering: true, discoveryError: '', discoveryHits: [] })
  try {
    const books = await sourceEngine.find(source, item.url, page)
    if (generation !== discoveryGeneration) return
    set({ discoveryHits: (Array.isArray(books) ? books : []).map((book) => hit(source, book)), discovering: false })
  } catch (error) {
    if (generation !== discoveryGeneration) return
    set({ discovering: false, discoveryError: `发现内容加载失败: ${message(error)}` })
  }
}

export const useSourceStore = create<SourceState>((set, get) => ({
  sources: [],
  mode: 'search',
  selectedSourceId: '',

  query: '',
  searching: false,
  hits: [],
  errors: [],

  findItems: [],
  selectedFind: null,
  discoveryHits: [],
  discoveryPage: 1,
  discovering: false,
  discoveryError: '',

  book: null,
  chapters: [],
  loadingChapters: false,
  chapterError: '',
  chapterIndex: -1,
  content: '',
  loadingContent: false,

  loadSources: async () => {
    const generation = ++sourceListGeneration
    const sources = await api().list()
    if (generation !== sourceListGeneration) return
    const selected = get().selectedSourceId
    const keepSelected = selected && sources.some((source) => source.id === selected && source.enabled)
    set({
      sources,
      selectedSourceId: keepSelected ? selected : '',
      ...(!keepSelected && selected
        ? {
            findItems: [],
            selectedFind: null,
            discoveryHits: [],
            discoveryPage: 1,
            discovering: false,
            discoveryError: '',
          }
        : {}),
    })
  },

  importFromFile: async () => {
    const files = await api().openFile()
    const failures: string[] = []
    for (const file of files) {
      try {
        await api().add(file.code, file.name)
      } catch (error) {
        failures.push(`${file.name}: ${message(error)}`)
      }
    }
    await get().loadSources()
    if (failures.length) throw new Error(failures.join('\n'))
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
    } catch (error) {
      return message(error)
    }
  },

  updateSource: async (id, patch) => {
    try {
      const updated = await api().update(id, patch)
      if (!updated) throw new Error('书源不存在')
      invalidateSource(id, updated.enabled ? updated.id : '', set, get)
      await get().loadSources()
      return updated
    } catch (error) {
      await get()
        .loadSources()
        .catch(() => {})
      if (!get().sources.some((source) => source.id === id)) invalidateSource(id, '', set, get)
      throw error
    }
  },

  moveSource: async (id, direction) => {
    if (!(await api().move(id, direction))) throw new Error('书源不存在')
    await get().loadSources()
  },

  removeSource: async (id) => {
    try {
      if (!(await api().remove(id))) throw new Error('书源不存在')
      invalidateSource(id, '', set, get)
      await get().loadSources()
    } catch (error) {
      await get()
        .loadSources()
        .catch(() => {})
      if (!get().sources.some((source) => source.id === id)) invalidateSource(id, '', set, get)
      throw error
    }
  },

  toggleSource: async (id, enabled) => {
    if (!(await api().toggle(id, enabled))) throw new Error('书源不存在')
    invalidateSource(id, enabled ? id : '', set, get)
    await get().loadSources()
  },

  inspectSource: async (id) => {
    const source = get().sources.find((item) => item.id === id)
    if (!source) throw new Error('书源不存在')
    return sourceEngine.inspect(source)
  },

  clearSourceSession: async (id) => {
    const source = get().sources.find((item) => item.id === id)
    if (!source) throw new Error('书源不存在')
    invalidateSource(id, source.enabled ? id : '', set, get)
    if (!(await api().clearSession(id))) throw new Error('书源不存在')
  },

  setMode: (mode) => {
    if (mode === get().mode) return
    searchGeneration++
    discoveryGeneration++
    set({ mode, errors: [], searching: false, discoveryError: '', discovering: false })
  },

  selectSource: (id) => {
    if (id === get().selectedSourceId) return
    searchGeneration++
    discoveryGeneration++
    bookGeneration++
    contentGeneration++
    set({
      selectedSourceId: id,
      hits: [],
      errors: [],
      searching: false,
      findItems: [],
      selectedFind: null,
      discoveryHits: [],
      discoveryPage: 1,
      discovering: false,
      discoveryError: '',
      book: null,
      chapters: [],
      loadingChapters: false,
      chapterError: '',
      chapterIndex: -1,
      content: '',
      loadingContent: false,
    })
  },

  setQuery: (q) => {
    if (q === get().query) return
    searchGeneration++
    set({ query: q, searching: false, hits: [], errors: [] })
  },

  search: async () => {
    const key = get().query.trim()
    const selected = get().selectedSourceId
    const enabled = get().sources.filter((source) => source.enabled && (!selected || source.id === selected))
    if (!key || !enabled.length) return
    const generation = ++searchGeneration
    bookGeneration++
    contentGeneration++
    set({
      searching: true,
      hits: [],
      errors: [],
      book: null,
      chapters: [],
      loadingChapters: false,
      chapterError: '',
      chapterIndex: -1,
      content: '',
      loadingContent: false,
    })

    const settled = await Promise.allSettled(
      enabled.map(async (source) => {
        const list = await sourceEngine.search(source, key, 1)
        return (Array.isArray(list) ? list : []).map((book) => hit(source, book))
      })
    )
    if (generation !== searchGeneration || get().query.trim() !== key) return

    const hits: Hit[] = []
    const errors: string[] = []
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') hits.push(...result.value)
      else errors.push(`${enabled[index].name}: ${message(result.reason)}`)
    })
    set({ hits, errors, searching: false })
  },

  loadFinds: async (sourceId) => {
    const id = sourceId ?? get().selectedSourceId
    const source = get().sources.find((item) => item.id === id && item.enabled)
    if (!source) {
      discoveryGeneration++
      set({
        findItems: [],
        selectedFind: null,
        discoveryHits: [],
        discovering: false,
        discoveryError: '请先选择一个已启用的书源',
      })
      return
    }
    if (get().selectedSourceId !== source.id) get().selectSource(source.id)
    const generation = ++discoveryGeneration
    set({
      selectedSourceId: source.id,
      discovering: true,
      discoveryError: '',
      findItems: [],
      selectedFind: null,
      discoveryHits: [],
      discoveryPage: 1,
    })
    try {
      const items = await sourceEngine.getFinds(source)
      if (generation !== discoveryGeneration || get().selectedSourceId !== source.id) return
      const first = items.find((item) => item.url) ?? null
      set({
        findItems: items,
        selectedFind: first,
        discovering: !first,
        discoveryError: items.length ? '' : '该书源不支持发现页(getfinds)',
      })
      if (first) await loadDiscoveryResults(source, first, 1, generation, set)
      else set({ discovering: false })
    } catch (error) {
      if (generation !== discoveryGeneration) return
      set({ discovering: false, discoveryError: `发现分类加载失败: ${message(error)}` })
    }
  },

  openFind: async (item, page = 1) => {
    const source = get().sources.find((entry) => entry.id === get().selectedSourceId && entry.enabled)
    if (!source || !item.url) return
    const generation = ++discoveryGeneration
    await loadDiscoveryResults(source, item, page, generation, set)
  },

  changeDiscoveryPage: async (delta) => {
    const item = get().selectedFind
    if (!item) return
    await get().openFind(item, Math.max(1, get().discoveryPage + delta))
  },

  openBook: async (book) => {
    const source = get().sources.find((item) => item.id === book.sourceId)
    if (!source) return
    const generation = ++bookGeneration
    contentGeneration++
    set({ book, chapters: [], loadingChapters: true, chapterError: '', content: '', chapterIndex: -1 })
    try {
      let tocUrl = book.tocUrl
      if (!tocUrl) {
        try {
          const detail = await sourceEngine.info(source, book.bookUrl)
          tocUrl = detail?.tocUrl || book.bookUrl
        } catch {
          tocUrl = book.bookUrl
        }
      }
      const chapters = await sourceEngine.chapter(source, tocUrl!, book.bookUrl)
      const current = get().book
      if (generation !== bookGeneration || current?.sourceId !== book.sourceId || current?.bookUrl !== book.bookUrl)
        return
      set({
        chapters: Array.isArray(chapters) ? chapters : [],
        loadingChapters: false,
        chapterError: Array.isArray(chapters) && chapters.length ? '' : '没有解析到章节',
      })
    } catch (error) {
      if (generation !== bookGeneration) return
      set({ loadingChapters: false, chapterError: `目录加载失败: ${message(error)}` })
    }
  },

  openChapter: async (index) => {
    const { book, chapters } = get()
    const chapter = chapters[index]
    const source = book && get().sources.find((item) => item.id === book.sourceId)
    if (!book || !chapter || !source) return
    const generation = ++contentGeneration
    const chapterKey = String(chapter.chapterId || chapter.url || '')
    set({ chapterIndex: index, loadingContent: true, content: '' })
    try {
      const text = await sourceEngine.content(source, chapterKey, book.bookUrl)
      const current = get()
      const currentChapter = current.chapters[current.chapterIndex]
      const currentKey = String(currentChapter?.chapterId || currentChapter?.url || '')
      if (generation !== contentGeneration || current.book?.bookUrl !== book.bookUrl || currentKey !== chapterKey)
        return
      set({ content: typeof text === 'string' ? text : String(text ?? ''), loadingContent: false })
    } catch (error) {
      if (generation !== contentGeneration) return
      set({ content: `【正文加载失败】${message(error)}`, loadingContent: false })
    }
  },

  backToList: () => {
    contentGeneration++
    set({ chapterIndex: -1, content: '', loadingContent: false })
  },
  closeBook: () => {
    bookGeneration++
    contentGeneration++
    set({
      book: null,
      chapters: [],
      chapterError: '',
      loadingChapters: false,
      chapterIndex: -1,
      content: '',
      loadingContent: false,
    })
  },
  dispose: () => {
    sourceListGeneration++
    searchGeneration++
    discoveryGeneration++
    bookGeneration++
    contentGeneration++
    set({
      searching: false,
      discovering: false,
      loadingChapters: false,
      loadingContent: false,
    })
    disposeAllRuntimes()
  },
}))
