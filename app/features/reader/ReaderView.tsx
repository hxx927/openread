import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  List,
  Settings2,
  Plus,
  Trash2,
  BookOpen,
  Minus,
  Search,
  ArrowDownUp,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useReaderStore,
  FONT_FORMATS,
  FONT_OPTIONS,
  type Theme,
  type SortKey,
  type Flow,
  type ReaderSettings,
} from '@/app/store/readerStore'
import type { Book } from '@/lib/conveyor/api/reader-api'
import FoliateViewer from './FoliateViewer'
import PdfViewer from './PdfViewer'
import TxtViewer from './TxtViewer'
import type { TocItem, ViewerHandle } from './types'

export default function ReaderView() {
  const { current, loadBooks } = useReaderStore()
  useEffect(() => {
    loadBooks()
  }, [loadBooks])
  return current ? <Reading key={current.id} book={current} /> : <Bookshelf />
}

/* ---------------- 书架 ---------------- */

const FORMAT_COLORS: Record<string, string> = {
  epub: '#2f9e6f',
  pdf: '#d64541',
  mobi: '#e08e0b',
  azw3: '#e08e0b',
  txt: '#5b8def',
  fb2: '#8e59d6',
  cbz: '#d6598e',
}

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: '最近阅读' },
  { key: 'title', label: '标题' },
  { key: 'added', label: '导入时间' },
]

function Bookshelf() {
  const { importBooks, openBook, removeBook, addPaths, query, setQuery, sort, setSort, importing, visibleBooks } =
    useReaderStore()
  const books = visibleBooks()
  const total = useReaderStore((s) => s.books.length)
  const [dragOver, setDragOver] = useState(false)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.openread.getPathForFile(f))
      .filter(Boolean)
    if (paths.length) addPaths(paths)
  }

  return (
    <div
      className="relative flex h-full flex-col bg-background text-foreground"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <h1 className="text-sm font-semibold whitespace-nowrap">我的书架</h1>
        {importing && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        <div className="flex flex-1 items-center gap-2 rounded-md bg-muted px-3 py-1.5">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索书名 / 作者"
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
        <button
          onClick={() => setSort(SORTS[(SORTS.findIndex((s) => s.key === sort) + 1) % SORTS.length].key)}
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
          title="切换排序"
        >
          <ArrowDownUp className="size-3.5" />
          {SORTS.find((s) => s.key === sort)?.label}
        </button>
        <button
          onClick={importBooks}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" /> 导入
        </button>
      </div>

      {total === 0 ? (
        <EmptyState onImport={importBooks} />
      ) : books.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">没有匹配「{query}」的书</div>
      ) : (
        <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(140px,1fr))] content-start gap-5 overflow-auto p-5">
          {books.map((b) => (
            <BookCard key={b.id} book={b} onOpen={() => openBook(b)} onRemove={() => removeBook(b.id)} />
          ))}
        </div>
      )}

      {dragOver && (
        <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-primary">
          松开鼠标,导入到书架
        </div>
      )}
    </div>
  )
}

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <BookOpen className="size-12 opacity-30" />
      <p className="text-sm">书架空空如也</p>
      <button onClick={onImport} className="rounded-md border border-border px-4 py-2 text-xs hover:bg-muted">
        导入 EPUB / MOBI / AZW3 / PDF / TXT …
      </button>
      <p className="text-[11px] opacity-60">也可以直接把电子书文件拖到这里</p>
    </div>
  )
}

function BookCard({ book, onOpen, onRemove }: { book: Book; onOpen: () => void; onRemove: () => void }) {
  const color = FORMAT_COLORS[book.format] ?? '#666'
  return (
    <div className="group flex flex-col gap-2">
      <button
        onClick={onOpen}
        className="relative aspect-[3/4] overflow-hidden rounded-md shadow-sm ring-1 ring-border transition-transform hover:-translate-y-1 hover:shadow-lg"
        style={{ background: book.cover ? '#0000' : color }}
      >
        {book.cover ? (
          <img src={book.cover} alt={book.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-white">
            <BookOpen className="size-7 opacity-80" />
            <span className="line-clamp-3 text-center text-xs font-medium">{book.title}</span>
            <span className="absolute right-1.5 bottom-1 text-[9px] uppercase opacity-70">{book.format}</span>
          </div>
        )}
        {book.progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
            <div className="h-full bg-white/80" style={{ width: `${Math.round(book.progress * 100)}%` }} />
          </div>
        )}
        <span
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute top-1 right-1 rounded bg-black/50 p-1 text-white opacity-0 hover:bg-black/70 group-hover:opacity-100"
          title="从书架移除"
        >
          <Trash2 className="size-3" />
        </span>
      </button>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{book.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{book.author || '未知作者'}</p>
      </div>
    </div>
  )
}

/* ---------------- 阅读 ---------------- */

function Reading({ book }: { book: Book }) {
  const { closeBook, saveProgress, updateMeta, settings, setSettings } = useReaderStore()
  const viewerRef = useRef<ViewerHandle>(null)
  const [toc, setToc] = useState<TocItem[]>([])
  const [tocOpen, setTocOpen] = useState(false)
  const [setOpen, setSetOpen] = useState(false)
  const [progress, setProgress] = useState(book.progress)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') viewerRef.current?.prev()
      else if (e.key === 'ArrowRight') viewerRef.current?.next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const viewerProps = {
    path: book.path,
    initialLocation: book.location,
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    theme: settings.theme,
    fontFamily: settings.fontFamily,
    flow: settings.flow,
    onProgress: (f: number, loc: string) => {
      setProgress(f)
      saveProgress(f, loc)
    },
    onToc: setToc,
    onMeta: (m: { title?: string; author?: string; cover?: string }) => updateMeta(m),
  }

  const isFont = FONT_FORMATS.includes(book.format)

  return (
    <div className="relative flex h-full flex-col bg-background text-foreground">
      {/* 顶栏 */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button onClick={closeBook} className="rounded p-1.5 hover:bg-muted" title="返回书架">
          <ArrowLeft className="size-4" />
        </button>
        <span className="flex-1 truncate text-xs font-medium">{book.title}</span>
        {toc.length > 0 && (
          <button onClick={() => setTocOpen((v) => !v)} className="rounded p-1.5 hover:bg-muted" title="目录">
            <List className="size-4" />
          </button>
        )}
        <div className="relative">
          <button onClick={() => setSetOpen((v) => !v)} className="rounded p-1.5 hover:bg-muted" title="设置">
            <Settings2 className="size-4" />
          </button>
          {setOpen && <SettingsPanel settings={settings} set={setSettings} onClose={() => setSetOpen(false)} />}
        </div>
      </div>

      {/* 阅读区 + 左右翻页 */}
      <div className="relative min-h-0 flex-1">
        {isFont ? (
          <FoliateViewer ref={viewerRef} {...viewerProps} />
        ) : book.format === 'pdf' ? (
          <PdfViewer ref={viewerRef} {...viewerProps} />
        ) : (
          <TxtViewer ref={viewerRef} {...viewerProps} />
        )}

        <button
          onClick={() => viewerRef.current?.prev()}
          className="absolute top-0 left-0 flex h-full w-12 items-center justify-start pl-1 text-foreground/30 hover:bg-foreground/5 hover:text-foreground/70"
          title="上一页 (←)"
        >
          <ChevronLeft className="size-6" />
        </button>
        <button
          onClick={() => viewerRef.current?.next()}
          className="absolute top-0 right-0 flex h-full w-12 items-center justify-end pr-1 text-foreground/30 hover:bg-foreground/5 hover:text-foreground/70"
          title="下一页 (→)"
        >
          <ChevronRight className="size-6" />
        </button>

        {/* 目录抽屉 */}
        {tocOpen && (
          <>
            <div className="absolute inset-0 z-10 bg-black/30" onClick={() => setTocOpen(false)} />
            <div className="absolute top-0 left-0 z-20 h-full w-72 overflow-auto border-r border-border bg-background p-2 shadow-xl">
              <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">目录</p>
              <TocList
                items={toc}
                onGo={(href) => {
                  viewerRef.current?.goTo(href)
                  setTocOpen(false)
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* 底部可拖动进度条 */}
      <div className="flex items-center gap-3 border-t border-border px-4 py-2">
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={(e) => {
            const f = Number(e.target.value)
            setProgress(f)
            viewerRef.current?.goToFraction(f)
          }}
          className="h-1 flex-1 cursor-pointer accent-primary"
        />
        <span className="w-10 text-right text-[11px] text-muted-foreground tabular-nums">
          {Math.round(progress * 100)}%
        </span>
      </div>
    </div>
  )
}

function TocList({ items, onGo, depth = 0 }: { items: TocItem[]; onGo: (href: string) => void; depth?: number }) {
  return (
    <>
      {items.map((it, i) => (
        <div key={i}>
          <button
            onClick={() => onGo(it.href)}
            className="w-full truncate rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
            style={{ paddingLeft: depth * 12 + 8 }}
          >
            {it.label?.trim() || '—'}
          </button>
          {it.subitems?.length ? <TocList items={it.subitems} onGo={onGo} depth={depth + 1} /> : null}
        </div>
      ))}
    </>
  )
}

function SettingsPanel({
  settings,
  set,
  onClose,
}: {
  settings: ReaderSettings
  set: (p: Partial<ReaderSettings>) => void
  onClose: () => void
}) {
  const themes: { key: Theme; label: string; bg: string; fg: string }[] = [
    { key: 'light', label: '明亮', bg: '#ffffff', fg: '#1a1a1a' },
    { key: 'sepia', label: '护眼', bg: '#f5ecd9', fg: '#5b4636' },
    { key: 'dark', label: '暗黑', bg: '#191919', fg: '#c9c9c9' },
  ]
  const flows: { key: Flow; label: string }[] = [
    { key: 'paginated', label: '翻页' },
    { key: 'scrolled', label: '滚动' },
  ]
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className="absolute top-9 right-0 z-30 w-64 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl">
        <Row label="字号">
          <Stepper
            value={`${settings.fontSize}`}
            onMinus={() => set({ fontSize: Math.max(12, settings.fontSize - 1) })}
            onPlus={() => set({ fontSize: Math.min(40, settings.fontSize + 1) })}
          />
        </Row>
        <Row label="行距">
          <Stepper
            value={settings.lineHeight.toFixed(1)}
            onMinus={() => set({ lineHeight: Math.max(1, +(settings.lineHeight - 0.1).toFixed(1)) })}
            onPlus={() => set({ lineHeight: Math.min(2.4, +(settings.lineHeight + 0.1).toFixed(1)) })}
          />
        </Row>

        <Segment label="字体">
          {FONT_OPTIONS.map((f) => (
            <SegBtn key={f.key} active={settings.fontFamily === f.css} onClick={() => set({ fontFamily: f.css })}>
              {f.label}
            </SegBtn>
          ))}
        </Segment>

        <Segment label="排版">
          {flows.map((f) => (
            <SegBtn key={f.key} active={settings.flow === f.key} onClick={() => set({ flow: f.key })}>
              {f.label}
            </SegBtn>
          ))}
        </Segment>

        <div className="mt-2">
          <p className="mb-1.5 text-xs text-muted-foreground">主题</p>
          <div className="flex gap-2">
            {themes.map((t) => (
              <button
                key={t.key}
                onClick={() => set({ theme: t.key })}
                className={cn(
                  'flex-1 rounded-md border py-2 text-[11px]',
                  settings.theme === t.key ? 'border-primary ring-1 ring-primary' : 'border-border'
                )}
                style={{ background: t.bg, color: t.fg }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function Segment({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
      <div className="flex gap-1.5">{children}</div>
    </div>
  )
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 rounded-md border py-1.5 text-[11px]',
        active ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'
      )}
    >
      {children}
    </button>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function Stepper({ value, onMinus, onPlus }: { value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onMinus} className="rounded border border-border p-1 hover:bg-muted">
        <Minus className="size-3" />
      </button>
      <span className="w-8 text-center text-xs tabular-nums">{value}</span>
      <button onClick={onPlus} className="rounded border border-border p-1 hover:bg-muted">
        <Plus className="size-3" />
      </button>
    </div>
  )
}
