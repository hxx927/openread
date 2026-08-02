import { useEffect, useId, useMemo, useRef, useState } from 'react'
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
  Link as LinkIcon,
  Compass,
  MoreVertical,
  LogIn,
  Pencil,
  ArrowUpToLine,
  ArrowDownToLine,
  Bug,
  X,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/app/components/ui/switch'
import { useSourceStore, type Hit } from '@/app/store/sourceStore'
import { useReaderStore } from '@/app/store/readerStore'
import { THEME_COLORS } from '@/app/features/reader/types'
import { sourceEngine, subscribeSourceToasts, type SourceLoginField, type SourceFunctionName } from './engine'
import type { BookSource } from '@/lib/conveyor/api/source-api'

export default function SourceView() {
  const { sources, loadSources, book, chapterIndex, mode, setMode, dispose } = useSourceStore()
  const [manage, setManage] = useState(false)
  const [loginSource, setLoginSource] = useState<BookSource | null>(null)
  const [loadError, setLoadError] = useState('')
  const [runtimeToast, setRuntimeToast] = useState('')
  const toastTimer = useRef(0)

  useEffect(() => {
    void loadSources().catch((error) => setLoadError(`书源列表加载失败: ${(error as Error).message}`))
    return dispose
  }, [loadSources, dispose])

  useEffect(() => {
    const unsubscribe = subscribeSourceToasts(({ sourceId, message }) => {
      const sourceName = useSourceStore.getState().sources.find((source) => source.id === sourceId)?.name
      setRuntimeToast(sourceName ? `${sourceName}: ${message}` : message)
      window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => setRuntimeToast(''), 5_000)
    })
    return () => {
      unsubscribe()
      window.clearTimeout(toastTimer.current)
    }
  }, [])

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {loadError && (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          <AlertTriangle className="size-3.5" />
          <span className="flex-1">{loadError}</span>
          <button onClick={() => setLoadError('')} title="关闭错误提示">
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {runtimeToast && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 border-b border-primary/20 bg-primary/5 px-4 py-2 text-xs"
        >
          <span className="flex-1">{runtimeToast}</span>
          <button onClick={() => setRuntimeToast('')} title="关闭书源提示">
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {chapterIndex >= 0 ? (
        <ChapterReader />
      ) : book ? (
        <ChapterList />
      ) : (
        <>
          <div className="flex items-center gap-1 border-b border-border px-5 py-2">
            <ModeButton
              active={mode === 'search'}
              onClick={() => setMode('search')}
              icon={<Search className="size-3.5" />}
            >
              搜索
            </ModeButton>
            <ModeButton
              active={mode === 'discover'}
              onClick={() => setMode('discover')}
              icon={<Compass className="size-3.5" />}
            >
              发现
            </ModeButton>
            <div className="flex-1" />
            <span className="mr-2 text-[11px] text-muted-foreground">
              {sources.filter((source) => source.enabled).length} 个已启用
            </span>
            <button
              onClick={() => setManage(true)}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              <Library className="size-3.5" /> 书源管理
            </button>
          </div>
          {mode === 'search' ? <SearchPane /> : <DiscoverPane />}
        </>
      )}

      {manage && (
        <SourceManager
          onClose={() => setManage(false)}
          onLogin={(source) => {
            setManage(false)
            setLoginSource(source)
          }}
          onSearch={(source) => {
            useSourceStore.getState().selectSource(source.id)
            setMode('search')
            setManage(false)
          }}
          onDiscover={(source) => {
            useSourceStore.getState().selectSource(source.id)
            setMode('discover')
            setManage(false)
            useSourceStore.getState().loadFinds(source.id)
          }}
        />
      )}
      {loginSource && <LoginDialog source={loginSource} onClose={() => setLoginSource(null)} />}
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
      )}
    >
      {icon} {children}
    </button>
  )
}

/* ---------------- 搜索 ---------------- */

function SourceSelector({ allowAll = true }: { allowAll?: boolean }) {
  const { sources, selectedSourceId, selectSource } = useSourceStore()
  return (
    <select
      value={selectedSourceId}
      onChange={(event) => selectSource(event.target.value)}
      className="max-w-48 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none"
    >
      {allowAll && <option value="">全部已启用书源</option>}
      {!allowAll && <option value="">选择书源</option>}
      {sources
        .filter((source) => source.enabled)
        .map((source) => (
          <option key={source.id} value={source.id}>
            {source.name}
          </option>
        ))}
    </select>
  )
}

function SearchPane() {
  const { sources, selectedSourceId, query, setQuery, search, searching, hits, errors, openBook } = useSourceStore()
  const count = sources.filter(
    (source) => source.enabled && (!selectedSourceId || source.id === selectedSourceId)
  ).length
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <SourceSelector />
        <div className="flex flex-1 items-center gap-2 rounded-md bg-muted px-3 py-1.5">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && search()}
            placeholder={count ? `在 ${count} 个书源中搜索书名…` : '请先启用书源'}
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
        <button
          onClick={search}
          disabled={searching || !count || !query.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {searching ? <Loader2 className="size-4 animate-spin" /> : '搜索'}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {!count ? (
          <Empty
            icon={<FileCode2 className="size-10 opacity-30" />}
            title="还没有可用书源"
            desc="请到书源管理导入并启用书源"
          />
        ) : hits.length === 0 && !searching ? (
          <Empty
            icon={<Search className="size-10 opacity-30" />}
            title="输入书名开始搜索"
            desc="可搜索全部书源，也可指定单个书源"
          />
        ) : (
          <BookResults books={hits} onOpen={openBook} />
        )}
        <ErrorBox title="部分书源出错" errors={errors} />
      </div>
    </>
  )
}

/* ---------------- 发现 ---------------- */

function DiscoverPane() {
  const {
    selectedSourceId,
    selectSource,
    loadFinds,
    findItems,
    selectedFind,
    openFind,
    discoveryHits,
    discoveryPage,
    discovering,
    discoveryError,
    changeDiscoveryPage,
    openBook,
  } = useSourceStore()
  const groups = useMemo(() => {
    const result: { title: string; items: typeof findItems }[] = []
    let group = { title: '发现', items: [] as typeof findItems }
    for (const item of findItems) {
      if (!item.url || (item.width ?? 1) >= 2) {
        if (group.items.length) result.push(group)
        group = { title: item.title, items: [] }
      } else group.items.push(item)
    }
    if (group.items.length) result.push(group)
    return result
  }, [findItems])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <SourceSelector allowAll={false} />
        <button
          onClick={() => selectedSourceId && loadFinds(selectedSourceId)}
          disabled={!selectedSourceId || discovering}
          className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40"
        >
          {discovering && !findItems.length ? <Loader2 className="size-4 animate-spin" /> : '加载发现'}
        </button>
        {selectedSourceId && (
          <button
            onClick={() => selectSource('')}
            className="rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground"
          >
            清除选择
          </button>
        )}
        <div className="flex-1" />
        {selectedFind && (
          <span className="text-xs text-muted-foreground">
            {selectedFind.title} · 第 {discoveryPage} 页
          </span>
        )}
      </div>

      {groups.length > 0 && (
        <div className="max-h-52 overflow-auto border-b border-border px-5 py-3">
          {groups.map((group) => (
            <div key={group.title} className="mb-3 last:mb-0">
              <p className="mb-1.5 text-xs font-semibold">{group.title}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map((item) => (
                  <button
                    key={`${group.title}-${item.title}-${item.url}`}
                    onClick={() => openFind(item, 1)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px]',
                      selectedFind?.url === item.url
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-muted'
                    )}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {discovering ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 正在加载发现内容…
          </div>
        ) : discoveryError ? (
          <Empty icon={<AlertTriangle className="size-10 opacity-30" />} title="发现页加载失败" desc={discoveryError} />
        ) : discoveryHits.length ? (
          <BookResults books={discoveryHits} onOpen={openBook} grid />
        ) : (
          <Empty
            icon={<Compass className="size-10 opacity-30" />}
            title="选择书源并加载发现"
            desc="支持 getfinds() / find(url,page) 的轻悦时光书源"
          />
        )}
      </div>

      {selectedFind && (
        <div className="flex items-center justify-center gap-3 border-t border-border py-2">
          <button
            onClick={() => changeDiscoveryPage(-1)}
            disabled={discoveryPage <= 1 || discovering}
            className="rounded-md border border-border px-3 py-1 text-xs disabled:opacity-30"
          >
            上一页
          </button>
          <span className="text-xs text-muted-foreground">第 {discoveryPage} 页</span>
          <button
            onClick={() => changeDiscoveryPage(1)}
            disabled={discovering}
            className="rounded-md border border-border px-3 py-1 text-xs"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  )
}

function BookResults({ books, onOpen, grid = false }: { books: Hit[]; onOpen: (book: Hit) => void; grid?: boolean }) {
  return (
    <div className={grid ? 'grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3' : 'flex flex-col gap-2'}>
      {books.map((book, index) => (
        <button
          key={`${book.sourceId}-${book.bookUrl}-${index}`}
          onClick={() => onOpen(book)}
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
        >
          <SourceCover sourceId={book.sourceId} url={book.coverUrl} title={book.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{book.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {book.author || '未知作者'}
              {book.latestChapterTitle ? ` · ${book.latestChapterTitle}` : ''}
            </p>
            {book.intro && (
              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground opacity-80">{book.intro}</p>
            )}
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            {book.sourceName}
          </span>
        </button>
      ))}
    </div>
  )
}

function SourceCover({ sourceId, url, title }: { sourceId: string; url?: string; title: string }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let active = true
    setSrc('')
    if (!url)
      return () => {
        active = false
      }
    if (/^data:image\/(?:avif|gif|jpeg|png|webp);base64,/i.test(url)) {
      setSrc(url)
      return () => {
        active = false
      }
    }
    if (!/^https?:\/\//i.test(url))
      return () => {
        active = false
      }
    void window.conveyor.source.cover(sourceId, url).then(
      (value) => active && setSrc(value),
      () => active && setSrc('')
    )
    return () => {
      active = false
    }
  }, [sourceId, url])

  return src ? (
    <img src={src} alt={`${title} 封面`} className="h-20 w-14 shrink-0 rounded object-cover" />
  ) : (
    <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
      <Library className="size-4" />
    </div>
  )
}

/* ---------------- 目录 / 正文 ---------------- */

function ChapterList() {
  const { book, chapters, loadingChapters, chapterError, openChapter, closeBook } = useSourceStore()
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button onClick={closeBook} className="rounded p-1.5 hover:bg-muted" title="返回">
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
        ) : chapterError ? (
          <Empty icon={<AlertTriangle className="size-10 opacity-30" />} title="目录加载失败" desc={chapterError} />
        ) : (
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {chapters.map((chapter, index) => (
              <button
                key={index}
                onClick={() => openChapter(index)}
                className={cn(
                  'truncate rounded px-2 py-1.5 text-left text-xs hover:bg-muted',
                  chapter.isVolume && 'font-semibold'
                )}
              >
                {chapter.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function ChapterReader() {
  const { chapters, chapterIndex, content, loadingContent, openChapter, backToList } = useSourceStore()
  const { settings } = useReaderStore()
  const { bg, fg } = THEME_COLORS[settings.theme]
  const chapter = chapters[chapterIndex]
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button onClick={backToList} className="rounded p-1.5 hover:bg-muted" title="返回目录">
          <ArrowLeft className="size-4" />
        </button>
        <span className="flex-1 truncate text-xs font-medium">{chapter?.name}</span>
        <button
          onClick={() => openChapter(chapterIndex - 1)}
          disabled={chapterIndex <= 0}
          className="rounded p-1.5 hover:bg-muted disabled:opacity-30"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          onClick={() => openChapter(chapterIndex + 1)}
          disabled={chapterIndex >= chapters.length - 1}
          className="rounded p-1.5 hover:bg-muted disabled:opacity-30"
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

/* ---------------- 登录 ---------------- */

const loginDefinitionCache = new Map<string, { code: string; promise: Promise<SourceLoginField[] | string> }>()

function loginDefinitionFor(source: BookSource): Promise<SourceLoginField[] | string> {
  const cached = loginDefinitionCache.get(source.id)
  if (cached?.code === source.code) return cached.promise
  const promise = sourceEngine.getLoginFields(source).catch((error) => {
    loginDefinitionCache.delete(source.id)
    throw error
  })
  loginDefinitionCache.set(source.id, { code: source.code, promise })
  return promise
}

function LoginDialog({ source, onClose }: { source: BookSource; onClose: () => void }) {
  const clearSourceSession = useSourceStore((state) => state.clearSourceSession)
  const [fields, setFields] = useState<SourceLoginField[]>([])
  const [webUrl, setWebUrl] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(true)
  const [status, setStatus] = useState('')
  const [persistent, setPersistent] = useState(true)
  const operation = useRef(false)

  const beginOperation = () => {
    if (operation.current) return false
    operation.current = true
    setBusy(true)
    setStatus('')
    return true
  }
  const finishOperation = () => {
    operation.current = false
    setBusy(false)
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [definition, authStatus, saved] = await Promise.all([
          loginDefinitionFor(source),
          window.conveyor.source.authStatus(source.id),
          window.conveyor.source.authGet(source.id),
        ])
        if (!active) return
        setPersistent(authStatus.persistentAvailable)
        if (typeof definition === 'string' && /^https?:\/\//i.test(definition)) {
          setWebUrl(definition)
          setFields([])
          setValues({})
        } else {
          const nextFields = Array.isArray(definition) ? definition : []
          setWebUrl('')
          setFields(nextFields)
          let stored: Record<string, string> = {}
          try {
            stored = saved ? JSON.parse(saved) : {}
          } catch {
            stored = {}
          }
          const defaults = Object.fromEntries(
            nextFields
              .filter((field) => field.type !== 'button')
              .map((field) => [field.name, String(field.value ?? '')])
          )
          setValues({ ...defaults, ...stored })
        }
      } catch (error) {
        if (active) setStatus(`登录配置加载失败: ${(error as Error).message}`)
      } finally {
        if (active) setBusy(false)
      }
    })()
    return () => {
      active = false
    }
  }, [source])

  const submit = async () => {
    if (!beginOperation()) return
    try {
      const result = await sourceEngine.submitLogin(source, values)
      setStatus(result == null ? '登录信息已保存并提交给书源' : `登录完成: ${String(result)}`)
    } catch (error) {
      setStatus(`登录失败: ${(error as Error).message}`)
    } finally {
      finishOperation()
    }
  }

  const runAction = async (action: string) => {
    if (!beginOperation()) return
    try {
      await sourceEngine.runAction(source, action)
      setStatus('书源登录动作已执行')
    } catch (error) {
      setStatus(`登录动作失败: ${(error as Error).message}`)
    } finally {
      finishOperation()
    }
  }

  const openWebLogin = async () => {
    if (!beginOperation()) return
    try {
      await window.conveyor.source.openLogin(source.id, webUrl)
      setStatus('网页登录窗口已打开')
    } catch (error) {
      setStatus(`网页登录打开失败: ${(error as Error).message}`)
    } finally {
      finishOperation()
    }
  }

  const clear = async () => {
    if (!beginOperation()) return
    try {
      await clearSourceSession(source.id)
      setValues({})
      setStatus('该书源的凭据、Cookie 和站点数据已清除')
    } catch (error) {
      setStatus(`清除登录失败: ${(error as Error).message}`)
    } finally {
      finishOperation()
    }
  }

  return (
    <Modal title={`登录 · ${source.name}`} onClose={onClose} width="max-w-md">
      {busy && !fields.length && !webUrl ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 正在读取登录配置…
        </div>
      ) : (
        <div className="space-y-3">
          {!persistent && (
            <p className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-700">
              系统安全存储不可用，凭据只在本次运行中保存。
            </p>
          )}
          {webUrl && (
            <button
              onClick={() => void openWebLogin()}
              disabled={busy}
              className="w-full rounded-md bg-primary py-2 text-xs text-primary-foreground disabled:opacity-40"
            >
              打开网页登录
            </button>
          )}
          {fields.map((field, index) =>
            field.type === 'button' ? (
              <button
                key={`${field.name}-${index}`}
                onClick={() => void runAction(String(field.action || ''))}
                disabled={busy}
                className="w-full rounded-md border border-border py-2 text-xs hover:bg-muted disabled:opacity-40"
              >
                {field.name || '执行登录动作'}
              </button>
            ) : (
              <label key={`${field.name}-${index}`} className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{field.name}</span>
                <input
                  type={field.type === 'password' ? 'password' : 'text'}
                  value={values[field.name] ?? field.value ?? ''}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                  placeholder={field.placeholder || field.name}
                  disabled={busy}
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-xs outline-none disabled:opacity-50"
                />
              </label>
            )
          )}
          {!webUrl && !fields.length && (
            <p className="py-4 text-center text-xs text-muted-foreground">该书源未提供登录配置。</p>
          )}
          {status && <p className="rounded-md bg-muted p-2 text-[11px]">{status}</p>}
          <div className="flex gap-2">
            {fields.some((field) => field.type !== 'button') && (
              <button
                onClick={submit}
                disabled={busy}
                className="flex-1 rounded-md bg-primary py-2 text-xs text-primary-foreground disabled:opacity-40"
              >
                保存并登录
              </button>
            )}
            <button
              onClick={clear}
              disabled={busy}
              className="flex items-center justify-center gap-1 rounded-md border border-border px-3 py-2 text-xs text-destructive disabled:opacity-40"
            >
              <LogOut className="size-3.5" /> 清除登录
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ---------------- 书源管理 ---------------- */

function SourceManager({
  onClose,
  onLogin,
  onSearch,
  onDiscover,
}: {
  onClose: () => void
  onLogin: (source: BookSource) => void
  onSearch: (source: BookSource) => void
  onDiscover: (source: BookSource) => void
}) {
  const {
    sources,
    importFromFile,
    addFromText,
    addFromUrl,
    updateSource,
    moveSource,
    removeSource,
    toggleSource,
    inspectSource,
  } = useSourceStore()
  const [text, setText] = useState('')
  const [pasting, setPasting] = useState(false)
  const [url, setUrl] = useState('')
  const [urlBusy, setUrlBusy] = useState(false)
  const [urlErr, setUrlErr] = useState<string | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [pasteBusy, setPasteBusy] = useState(false)
  const [managerError, setManagerError] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [editing, setEditing] = useState<BookSource | null>(null)
  const [deleting, setDeleting] = useState<BookSource | null>(null)
  const [deleteConfirmed, setDeleteConfirmed] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [busySources, setBusySources] = useState(() => new Set<string>())
  const [debug, setDebug] = useState<{ source: BookSource; functions: Record<SourceFunctionName, boolean> } | null>(
    null
  )
  const [debugBusy, setDebugBusy] = useState('')
  const sourceLocks = useRef(new Set<string>())
  const importLock = useRef(false)
  const pasteLock = useRef(false)
  const urlLock = useRef(false)
  const deleteLock = useRef(false)
  const debugLock = useRef(false)
  const nestedDialogOpen = Boolean(editing || deleting || debug)
  const dialogRef = useDialogFocusTrap(onClose, !nestedDialogOpen)

  const runSourceAction = async (sourceId: string, action: () => Promise<void>, label = '操作') => {
    if (sourceLocks.current.has(sourceId)) return
    sourceLocks.current.add(sourceId)
    setManagerError('')
    setBusySources((current) => new Set(current).add(sourceId))
    try {
      await action()
    } catch (error) {
      setManagerError(`${label}失败: ${(error as Error).message || String(error)}`)
    } finally {
      sourceLocks.current.delete(sourceId)
      setBusySources((current) => {
        const next = new Set(current)
        next.delete(sourceId)
        return next
      })
    }
  }

  const importFiles = async () => {
    if (importLock.current) return
    importLock.current = true
    setImportBusy(true)
    setManagerError('')
    try {
      await importFromFile()
    } catch (error) {
      setManagerError(`文件导入失败: ${(error as Error).message || String(error)}`)
    } finally {
      importLock.current = false
      setImportBusy(false)
    }
  }

  const importText = async () => {
    if (pasteLock.current || !text.trim()) return
    pasteLock.current = true
    setPasteBusy(true)
    setManagerError('')
    try {
      await addFromText(text)
      setText('')
      setPasting(false)
    } catch (error) {
      setManagerError(`粘贴导入失败: ${(error as Error).message || String(error)}`)
    } finally {
      pasteLock.current = false
      setPasteBusy(false)
    }
  }

  const importUrl = async () => {
    if (urlLock.current || !url.trim()) return
    urlLock.current = true
    setUrlBusy(true)
    setUrlErr(null)
    try {
      const error = await addFromUrl(url)
      if (error) setUrlErr(error)
      else setUrl('')
    } finally {
      urlLock.current = false
      setUrlBusy(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" aria-hidden="true" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-manager-title"
        className="fixed top-1/2 left-1/2 z-50 flex max-h-[88vh] w-[90vw] max-w-[42rem] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-popover p-4 shadow-2xl"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Library className="size-4" />
          <h2 id="source-manager-title" className="flex-1 text-sm font-semibold">
            书源管理
          </h2>
          <button
            onClick={() => void importFiles()}
            disabled={importBusy}
            className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-40"
          >
            {importBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} 导入文件
          </button>
          <button
            onClick={() => setPasting((value) => !value)}
            className="rounded-md border border-border px-2.5 py-1 text-xs"
          >
            粘贴
          </button>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted" aria-label="关闭书源管理">
            <X className="size-4" />
          </button>
        </div>

        <div className="mb-3">
          <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
            <LinkIcon className="size-3.5 text-muted-foreground" />
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && !urlBusy && importUrl()}
              placeholder="粘贴书源链接(.js / 轻悦 .json)"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none"
            />
            <button
              onClick={importUrl}
              disabled={urlBusy || !url.trim()}
              className="rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground disabled:opacity-40"
            >
              {urlBusy ? <Loader2 className="size-3 animate-spin" /> : '导入'}
            </button>
          </div>
          {urlErr && <p className="mt-1 text-[11px] text-destructive">{urlErr}</p>}
          {managerError && <p className="mt-1 whitespace-pre-wrap text-[11px] text-destructive">{managerError}</p>}
        </div>

        {pasting && (
          <div className="mb-3">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="粘贴书源 JS / 轻悦 JSON"
              className="h-28 w-full rounded-md border border-border bg-transparent p-2 font-mono text-[11px] outline-none"
            />
            <button
              onClick={() => void importText()}
              disabled={pasteBusy || !text.trim()}
              className="mt-1 flex w-full items-center justify-center gap-1 rounded-md bg-primary py-1.5 text-xs text-primary-foreground disabled:opacity-40"
            >
              {pasteBusy && <Loader2 className="size-3.5 animate-spin" />} 保存书源
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {sources.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">还没有书源。</p>
          ) : (
            sources.map((source) => (
              <div
                key={source.id}
                className="relative mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
              >
                <Switch
                  size="sm"
                  checked={source.enabled}
                  disabled={busySources.has(source.id)}
                  onCheckedChange={(value) => {
                    void runSourceAction(source.id, () => toggleSource(source.id, value), '切换书源')
                  }}
                />
                <div className="min-w-0 flex-1 basis-36">
                  <p
                    className={cn(
                      'truncate text-xs font-medium',
                      !source.enabled && 'text-muted-foreground line-through'
                    )}
                  >
                    {source.name}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {source.kind === 'html' ? '轻悦时光' : 'JS'} · {new Date(source.addedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => onLogin(source)}
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
                >
                  <LogIn className="size-3" /> 登录
                </button>
                <button
                  onClick={() => onSearch(source)}
                  disabled={!source.enabled}
                  className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35"
                >
                  搜索
                </button>
                <button
                  onClick={() => onDiscover(source)}
                  disabled={!source.enabled}
                  className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35"
                >
                  发现
                </button>
                <button
                  onClick={() => setMenu(menu === source.id ? null : source.id)}
                  disabled={busySources.has(source.id)}
                  className="rounded p-1 hover:bg-muted disabled:opacity-40"
                >
                  {busySources.has(source.id) ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <MoreVertical className="size-4" />
                  )}
                </button>

                {menu === source.id && (
                  <div className="absolute top-10 right-2 z-10 w-36 rounded-md border border-border bg-popover p-1 text-xs shadow-xl">
                    <MenuAction
                      icon={<Pencil className="size-3.5" />}
                      onClick={() => {
                        setEditing(source)
                        setMenu(null)
                      }}
                    >
                      编辑
                    </MenuAction>
                    <MenuAction
                      icon={<ArrowUpToLine className="size-3.5" />}
                      onClick={() => {
                        setMenu(null)
                        void runSourceAction(source.id, () => moveSource(source.id, 'top'), '置顶')
                      }}
                    >
                      置顶
                    </MenuAction>
                    <MenuAction
                      icon={<ArrowDownToLine className="size-3.5" />}
                      onClick={() => {
                        setMenu(null)
                        void runSourceAction(source.id, () => moveSource(source.id, 'bottom'), '置底')
                      }}
                    >
                      置底
                    </MenuAction>
                    <MenuAction
                      icon={
                        debugBusy === source.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Bug className="size-3.5" />
                        )
                      }
                      onClick={async () => {
                        if (debugLock.current) return
                        debugLock.current = true
                        setDebugBusy(source.id)
                        setManagerError('')
                        try {
                          setDebug({ source, functions: await inspectSource(source.id) })
                        } catch (error) {
                          setManagerError(`调试失败: ${(error as Error).message || String(error)}`)
                        } finally {
                          debugLock.current = false
                          setDebugBusy('')
                          setMenu(null)
                        }
                      }}
                    >
                      调试
                    </MenuAction>
                    <MenuAction
                      icon={<Trash2 className="size-3.5" />}
                      danger
                      onClick={() => {
                        setDeleteConfirmed(false)
                        setDeleteError('')
                        setDeleting(source)
                        setMenu(null)
                      }}
                    >
                      删除
                    </MenuAction>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        <p className="mt-3 border-t border-border pt-2 text-[10px] text-muted-foreground">
          支持 JS 与轻悦时光(html)书源；代码及类型完全相同的重复书源会合并。支持时登录凭据由系统 safeStorage
          加密。请只使用合法、已授权的来源。
        </p>
      </div>

      {editing && <EditSourceDialog source={editing} onClose={() => setEditing(null)} onSave={updateSource} />}
      {deleting && (
        <Modal title={`删除 · ${deleting.name}`} onClose={() => !deleteBusy && setDeleting(null)} width="max-w-sm">
          <p className="mb-3 text-xs leading-5 text-muted-foreground">
            删除后将同时清除该书源的加密凭据、Cookie 会话和缓存数据，且无法撤销。确定继续吗？
          </p>
          <label className="mb-4 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={deleteConfirmed}
              onChange={(event) => setDeleteConfirmed(event.target.checked)}
              disabled={deleteBusy}
              className="mt-0.5"
            />
            <span>我确认删除“{deleting.name}”及其所有登录数据。</span>
          </label>
          {deleteError && <p className="mb-3 text-[11px] text-destructive">删除失败：{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleting(null)}
              disabled={deleteBusy}
              className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-40"
            >
              取消
            </button>
            <button
              onClick={async () => {
                if (deleteLock.current) return
                deleteLock.current = true
                setDeleteBusy(true)
                setDeleteError('')
                try {
                  await removeSource(deleting.id)
                  loginDefinitionCache.delete(deleting.id)
                  setDeleting(null)
                } catch (error) {
                  setDeleteError((error as Error).message || String(error))
                } finally {
                  deleteLock.current = false
                  setDeleteBusy(false)
                }
              }}
              disabled={deleteBusy || !deleteConfirmed}
              className="flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground disabled:opacity-40"
            >
              {deleteBusy && <Loader2 className="size-3.5 animate-spin" />} 确认删除
            </button>
          </div>
        </Modal>
      )}
      {debug && <DebugDialog data={debug} onClose={() => setDebug(null)} />}
    </>
  )
}

function EditSourceDialog({
  source,
  onClose,
  onSave,
}: {
  source: BookSource
  onClose: () => void
  onSave: (id: string, patch: { name?: string; code?: string }) => Promise<BookSource>
}) {
  const [name, setName] = useState(source.name)
  const [code, setCode] = useState(source.code)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const saveLock = useRef(false)

  const save = async () => {
    if (saveLock.current) return
    saveLock.current = true
    setBusy(true)
    setError('')
    try {
      const updated = await onSave(source.id, { name, code })
      if (updated.id !== source.id) loginDefinitionCache.delete(source.id)
      onClose()
    } catch (saveError) {
      setError((saveError as Error).message || String(saveError))
    } finally {
      saveLock.current = false
      setBusy(false)
    }
  }

  return (
    <Modal title={`编辑 · ${source.name}`} onClose={() => !busy && onClose()} width="max-w-3xl">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        disabled={busy}
        className="mb-2 w-full rounded-md border border-border bg-transparent px-3 py-2 text-xs outline-none disabled:opacity-50"
      />
      <textarea
        value={code}
        onChange={(event) => setCode(event.target.value)}
        disabled={busy}
        className="h-[50vh] w-full rounded-md border border-border bg-transparent p-3 font-mono text-[11px] outline-none disabled:opacity-50"
      />
      {error && <p className="mt-2 text-[11px] text-destructive">保存失败: {error}</p>}
      <button
        onClick={() => void save()}
        disabled={busy || !code.trim()}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-md bg-primary py-2 text-xs text-primary-foreground disabled:opacity-40"
      >
        {busy && <Loader2 className="size-3.5 animate-spin" />} 保存修改
      </button>
    </Modal>
  )
}

function DebugDialog({
  data,
  onClose,
}: {
  data: { source: BookSource; functions: Record<SourceFunctionName, boolean> }
  onClose: () => void
}) {
  return (
    <Modal title={`调试 · ${data.source.name}`} onClose={onClose} width="max-w-sm">
      <p className="mb-3 text-[11px] text-muted-foreground">仅检测函数是否存在，不会调用正文、付费或解密接口。</p>
      <div className="grid grid-cols-2 gap-2">
        {(Object.entries(data.functions) as [SourceFunctionName, boolean][]).map(([name, supported]) => (
          <div
            key={name}
            className={cn(
              'rounded-md border p-2 text-xs',
              supported ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border text-muted-foreground'
            )}
          >
            {supported ? '✓' : '—'} {name}()
          </div>
        ))}
      </div>
    </Modal>
  )
}

function MenuAction({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted',
        danger && 'text-destructive'
      )}
    >
      {icon} {children}
    </button>
  )
}

function useDialogFocusTrap(onClose: () => void, active = true) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const activeRef = useRef(active)
  closeRef.current = onClose
  activeRef.current = active

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])]
    if (activeRef.current) focusable()[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeRef.current) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [])

  return dialogRef
}

function Modal({
  title,
  onClose,
  width,
  children,
}: {
  title: string
  onClose: () => void
  width: string
  children: React.ReactNode
}) {
  const titleId = useId()
  const dialogRef = useDialogFocusTrap(onClose)

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" aria-hidden="true" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'fixed top-1/2 left-1/2 z-[70] w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-popover p-4 shadow-2xl',
          width
        )}
      >
        <div className="mb-3 flex items-center">
          <h3 id={titleId} className="flex-1 text-sm font-semibold">
            {title}
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted" aria-label="关闭对话框">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </>
  )
}

function ErrorBox({ title, errors }: { title: string; errors: string[] }) {
  if (!errors.length) return null
  return (
    <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-600">
        <AlertTriangle className="size-3.5" /> {title}
      </p>
      {errors.map((error, index) => (
        <p key={index} className="text-[11px] text-muted-foreground">
          {error}
        </p>
      ))}
    </div>
  )
}

function Empty({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      {icon}
      <p className="text-sm">{title}</p>
      <p className="max-w-xl text-center text-xs opacity-70">{desc}</p>
    </div>
  )
}
