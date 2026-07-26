import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, X, Plus, House, Search, Ghost, Play, Pause, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBrowserStore, webviewRegistry, toUrl, QUICK_SITES, HOME_URL, type Tab } from '@/app/store/browserStore'
import { useStealthStore } from '@/app/store/stealthStore'
import type { WebviewElement } from '@/app/types/webview'

const PARTITION = 'persist:openread-web' // 持久分区:各站登录状态得以保留

/** 透明摸鱼:抠掉页面背景,让正文浮在桌面上(仿墨鱼 browser-transparency.js) */
const TRANSPARENCY_CSS = `
  html, body { background: transparent !important; background-image: none !important; }
  body * { background-color: transparent !important; background-image: none !important; box-shadow: none !important; }
  ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
`

/** 单个标签页:持有一个 <webview>,并把它的状态回写到 store */
function BrowserTab({ tab, transparent }: { tab: Tab; transparent: boolean }) {
  const ref = useRef<WebviewElement | null>(null)
  const initialUrl = useRef(tab.url) // 只作为初始 src,后续导航走 loadURL,避免 React 重载
  const patchTab = useBrowserStore((s) => s.patchTab)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    webviewRegistry.set(tab.id, el)

    const sync = () =>
      patchTab(tab.id, {
        url: el.getURL(),
        canGoBack: el.canGoBack(),
        canGoForward: el.canGoForward(),
      })
    const onStart = () => patchTab(tab.id, { loading: true })
    const onStop = () => {
      patchTab(tab.id, { loading: false })
      sync()
    }
    const onTitle = (e: Event & { title?: string }) =>
      patchTab(tab.id, { title: e.title || el.getTitle() || '新标签页' })

    el.addEventListener('did-start-loading', onStart)
    el.addEventListener('did-stop-loading', onStop)
    el.addEventListener('did-navigate', sync)
    el.addEventListener('did-navigate-in-page', sync)
    el.addEventListener('page-title-updated', onTitle as EventListener)

    return () => {
      el.removeEventListener('did-start-loading', onStart)
      el.removeEventListener('did-stop-loading', onStop)
      el.removeEventListener('did-navigate', sync)
      el.removeEventListener('did-navigate-in-page', sync)
      el.removeEventListener('page-title-updated', onTitle as EventListener)
      webviewRegistry.set(tab.id, null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id])

  // 透明模式:注入/移除透明 CSS,并在每次导航后重新注入
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let key: string | null = null
    let cancelled = false
    const inject = async () => {
      try {
        key = await el.insertCSS(TRANSPARENCY_CSS)
      } catch {
        /* 页面尚未就绪 */
      }
    }
    const onLoad = () => {
      if (!cancelled && transparent) inject()
    }
    if (transparent) {
      inject()
      el.addEventListener('did-finish-load', onLoad)
    }
    return () => {
      cancelled = true
      el.removeEventListener('did-finish-load', onLoad)
      if (key) el.removeInsertedCSS(key).catch(() => {})
    }
  }, [transparent])

  return (
    <webview
      ref={ref as unknown as React.Ref<HTMLElement>}
      src={initialUrl.current}
      partition={PARTITION}
      allowpopups={'true'}
      className="h-full w-full"
      style={{ background: 'transparent' }}
    />
  )
}

export default function BrowserView() {
  const { tabs, activeId, newTab, closeTab, setActive, navigate } = useBrowserStore()
  const { transparent, autoScroll, toggleTransparent, setTransparent, toggleAutoScroll } = useStealthStore()
  const active = tabs.find((t) => t.id === activeId)
  const [address, setAddress] = useState(active?.url ?? '')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setAddress(active?.url ?? '')
  }, [active?.url, activeId, editing])

  useEffect(() => window.conveyor.browser.onOpenTab((url) => newTab(url)), [newTab])

  // 自动滚动(摸鱼看小说)
  useEffect(() => {
    if (!autoScroll) return
    const id = setInterval(() => {
      webviewRegistry.get(activeId ?? undefined)?.executeJavaScript('window.scrollBy(0,1)').catch(() => {})
    }, 60)
    return () => clearInterval(id)
  }, [autoScroll, activeId])

  const el = () => webviewRegistry.get(activeId ?? undefined)
  const go = () => {
    navigate(toUrl(address))
    setEditing(false)
  }

  const chromeBg = transparent ? 'bg-background/70 backdrop-blur-sm' : 'bg-background'

  return (
    <div className={cn('flex h-full flex-col text-foreground', transparent ? 'bg-transparent' : 'bg-background')}>
      {/* 标签条 */}
      <div className={cn('flex items-center gap-1 border-b border-border px-2 pt-1.5', chromeBg)}>
        <div className="flex flex-1 items-end gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={cn(
                'group flex max-w-52 min-w-32 items-center gap-2 rounded-t-md px-3 py-1.5 text-xs',
                t.id === activeId ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'
              )}
            >
              <span className={cn('size-1.5 rounded-full', t.loading ? 'bg-amber-400' : 'bg-emerald-500/70')} />
              <span className="flex-1 truncate text-left">{t.title}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(t.id)
                }}
                className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-foreground/10"
              >
                <X className="size-3" />
              </span>
            </button>
          ))}
        </div>
        <button onClick={() => newTab()} className="mb-1 rounded p-1 text-muted-foreground hover:bg-muted" title="新标签页">
          <Plus className="size-4" />
        </button>
      </div>

      {/* 地址栏 + 导航 */}
      <div className={cn('flex items-center gap-1 border-b border-border px-2 py-1.5', chromeBg)}>
        <NavBtn title="后退" disabled={!active?.canGoBack} onClick={() => el()?.goBack()}>
          <ArrowLeft className="size-4" />
        </NavBtn>
        <NavBtn title="前进" disabled={!active?.canGoForward} onClick={() => el()?.goForward()}>
          <ArrowRight className="size-4" />
        </NavBtn>
        <NavBtn title="刷新" onClick={() => el()?.reload()}>
          <RotateCw className={cn('size-4', active?.loading && 'animate-spin')} />
        </NavBtn>
        <NavBtn title="主页" onClick={() => navigate(HOME_URL)}>
          <House className="size-4" />
        </NavBtn>
        <div className="mx-1 flex flex-1 items-center gap-2 rounded-md bg-muted px-3 py-1.5">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            placeholder="输入网址或搜索…"
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            spellCheck={false}
          />
        </div>
        <button
          onClick={toggleTransparent}
          className={cn(
            'flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs',
            transparent ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          )}
          title="透明摸鱼模式:把网页正文变透明,浮在桌面上"
        >
          <Ghost className="size-4" />
          透明
        </button>
      </div>

      {/* 快捷站点 */}
      <div className={cn('flex items-center gap-1.5 overflow-x-auto border-b border-border px-3 py-1.5', chromeBg)}>
        {QUICK_SITES.map((s) => (
          <button
            key={s.url}
            onClick={() => navigate(s.url)}
            className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* webview 栈:全部渲染,只显示当前标签 */}
      <div className={cn('relative flex-1', transparent ? 'bg-transparent' : 'bg-white')}>
        {tabs.map((t) => (
          <div key={t.id} className={cn('absolute inset-0', t.id === activeId ? 'block' : 'hidden')}>
            <BrowserTab tab={t} transparent={transparent} />
          </div>
        ))}

        {/* 透明模式悬浮工具条 */}
        {transparent && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full bg-background/70 px-2 py-1 shadow-lg backdrop-blur">
            <button
              onClick={toggleAutoScroll}
              className={cn('rounded-full p-1.5', autoScroll ? 'text-primary' : 'text-muted-foreground hover:bg-muted')}
              title={autoScroll ? '停止自动滚动' : '自动滚动'}
            >
              {autoScroll ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <button
              onClick={() => setTransparent(false)}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              title="退出透明模式"
            >
              <EyeOff className="size-4" />
              退出
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function NavBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title: string
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
