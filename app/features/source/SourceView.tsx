import { useEffect, useState } from 'react'
import {
  Search,
  Loader2,
  Plus,
  Trash2,
  ArrowLeft,
  Library,
  FileCode2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/app/components/ui/switch'
import { useSourceStore } from '@/app/store/sourceStore'
import { useReaderStore } from '@/app/store/readerStore'
import { THEME_COLORS } from '@/app/features/reader/types'

export default function SourceView() {
  const { sources, loadSources, book, chapterIndex } = useSourceStore()
  const [manage, setManage] = useState(false)

  useEffect(() => {
    loadSources()
  }, [loadSources])

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {chapterIndex >= 0 ? (
        <ChapterReader />
      ) : book ? (
        <ChapterList />
      ) : (
        <SearchPane onManage={() => setManage(true)} sourceCount={sources.filter((s) => s.enabled).length} />
      )}
      {manage && <SourceManager onClose={() => setManage(false)} />}
    </div>
  )
}

/* ---------------- 搜索 ---------------- */

function SearchPane({ onManage, sourceCount }: { onManage: () => void; sourceCount: number }) {
  const { query, setQuery, search, searching, hits, errors, openBook } = useSourceStore()

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <h1 className="text-sm font-semibold whitespace-nowrap">书源搜索</h1>
        <div className="flex flex-1 items-center gap-2 rounded-md bg-muted px-3 py-1.5">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder={sourceCount ? `在 ${sourceCount} 个书源中搜索书名…` : '请先导入书源'}
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
        <button
          onClick={search}
          disabled={searching || !sourceCount}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {searching ? <Loader2 className="size-4 animate-spin" /> : '搜索'}
        </button>
        <button
          onClick={onManage}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
        >
          <Library className="size-3.5" /> 书源
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {!sourceCount ? (
          <Empty
            icon={<FileCode2 className="size-10 opacity-30" />}
            title="还没有可用书源"
            desc="点右上角「书源」导入一个 .js 书源文件后即可搜索"
          />
        ) : hits.length === 0 && !searching ? (
          <Empty icon={<Search className="size-10 opacity-30" />} title="输入书名开始搜索" desc="将在所有已启用的书源中并行搜索" />
        ) : (
          <div className="flex flex-col gap-2">
            {hits.map((h, i) => (
              <button
                key={`${h.sourceId}-${h.bookUrl}-${i}`}
                onClick={() => openBook(h)}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
              >
                {h.coverUrl ? (
                  <img src={h.coverUrl} alt="" className="h-16 w-12 shrink-0 rounded object-cover" />
                ) : (
                  <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                    <Library className="size-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{h.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {h.author || '未知作者'}
                    {h.latestChapterTitle ? ` · ${h.latestChapterTitle}` : ''}
                  </p>
                  {h.intro && <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground opacity-80">{h.intro}</p>}
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {h.sourceName}
                </span>
              </button>
            ))}
          </div>
        )}

        {errors.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-600">
              <AlertTriangle className="size-3.5" /> 部分书源出错
            </p>
            {errors.map((e, i) => (
              <p key={i} className="truncate text-[11px] text-muted-foreground">
                {e}
              </p>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/* ---------------- 目录 ---------------- */

function ChapterList() {
  const { book, chapters, loadingChapters, openChapter, closeBook } = useSourceStore()
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button onClick={closeBook} className="rounded p-1.5 hover:bg-muted" title="返回搜索">
          <ArrowLeft className="size-4" />
        </button>
        <span className="flex-1 truncate text-xs font-medium">{book?.name}</span>
        <span className="text-[11px] text-muted-foreground">{chapters.length} 章</span>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {loadingChapters ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 正在加载目录…
          </div>
        ) : chapters.length === 0 ? (
          <Empty icon={<AlertTriangle className="size-10 opacity-30" />} title="没有解析到章节" desc="可能是书源规则与该站点不匹配" />
        ) : (
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {chapters.map((c, i) => (
              <button
                key={i}
                onClick={() => openChapter(i)}
                className={cn(
                  'truncate rounded px-2 py-1.5 text-left text-xs hover:bg-muted',
                  c.isVolume && 'font-semibold text-foreground'
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/* ---------------- 正文 ---------------- */

function ChapterReader() {
  const { chapters, chapterIndex, content, loadingContent, openChapter, backToList } = useSourceStore()
  const { settings } = useReaderStore()
  const { bg, fg } = THEME_COLORS[settings.theme]
  const ch = chapters[chapterIndex]

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button onClick={backToList} className="rounded p-1.5 hover:bg-muted" title="返回目录">
          <ArrowLeft className="size-4" />
        </button>
        <span className="flex-1 truncate text-xs font-medium">{ch?.name}</span>
        <button
          onClick={() => openChapter(chapterIndex - 1)}
          disabled={chapterIndex <= 0}
          className="rounded p-1.5 hover:bg-muted disabled:opacity-30"
          title="上一章"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          onClick={() => openChapter(chapterIndex + 1)}
          disabled={chapterIndex >= chapters.length - 1}
          className="rounded p-1.5 hover:bg-muted disabled:opacity-30"
          title="下一章"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto" style={{ background: bg }}>
        {loadingContent ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 正在加载正文…
          </div>
        ) : (
          <div
            className="mx-auto max-w-3xl px-8 py-10 whitespace-pre-wrap"
            style={{
              color: fg,
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
              fontFamily: settings.fontFamily || undefined,
            }}
          >
            {content}
          </div>
        )}
      </div>
    </>
  )
}

/* ---------------- 书源管理 ---------------- */

function SourceManager({ onClose }: { onClose: () => void }) {
  const { sources, importFromFile, addFromText, removeSource, toggleSource } = useSourceStore()
  const [text, setText] = useState('')
  const [pasting, setPasting] = useState(false)

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 z-50 flex max-h-[80vh] w-[32rem] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <Library className="size-4" />
          <h2 className="flex-1 text-sm font-semibold">书源管理</h2>
          <button onClick={importFromFile} className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground">
            <Plus className="size-3.5" /> 导入文件
          </button>
          <button onClick={() => setPasting((v) => !v)} className="rounded-md border border-border px-2.5 py-1 text-xs">
            粘贴
          </button>
        </div>

        {pasting && (
          <div className="mb-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="粘贴书源 JS 代码(需实现 search/info/chapter/content)"
              className="h-28 w-full rounded-md border border-border bg-transparent p-2 font-mono text-[11px] outline-none"
            />
            <button
              onClick={async () => {
                await addFromText(text)
                setText('')
                setPasting(false)
              }}
              className="mt-1 w-full rounded-md bg-primary py-1.5 text-xs text-primary-foreground"
            >
              保存书源
            </button>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {sources.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              还没有书源。书源是一段 JS,需实现 search / info / chapter / content 函数。
            </p>
          ) : (
            sources.map((s) => (
              <div key={s.id} className="flex items-center gap-2 border-b border-border py-2 last:border-0">
                <Switch size="sm" checked={s.enabled} onCheckedChange={(v) => toggleSource(s.id, v)} />
                <span className={cn('flex-1 truncate text-xs', !s.enabled && 'text-muted-foreground line-through')}>
                  {s.name}
                </span>
                <button onClick={() => removeSource(s.id)} className="rounded p-1 text-muted-foreground hover:bg-muted">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <p className="mt-3 border-t border-border pt-2 text-[10px] leading-relaxed text-muted-foreground">
          书源为中立工具,内容由你自行导入的书源提供。请使用合法、已授权的来源。
        </p>
      </div>
    </>
  )
}

function Empty({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      {icon}
      <p className="text-sm">{title}</p>
      <p className="text-xs opacity-70">{desc}</p>
    </div>
  )
}
