import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, X, Plus, House, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBrowserStore, webviewRegistry, toUrl, QUICK_SITES, HOME_URL, type Tab } from '@/app/store/browserStore'
import type { WebviewElement } from '@/app/types/webview'

const PARTITION = 'persist:openread-web' // 持久分区:各站登录状态得以保留

/** 单个标签页:持有一个 <webview>,并把它的状态回写到 store */
function BrowserTab({ tab, active }: { tab: Tab; active: boolean }) {
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

  return (
    <webview
      ref={ref as unknown as React.Ref<HTMLElement>}
      src={initialUrl.current}
      partition={PARTITION}
      allowpopups={'true'}
      className={cn('h-full w-full', active ? 'flex' : 'hidden')}
    />
  )
}

export default function BrowserView() {
  const { tabs, activeId, newTab, closeTab, setActive, navigate } = useBrowserStore()
  const active = tabs.find((t) => t.id === activeId)
  const [address, setAddress] = useState(active?.url ?? '')
  const [editing, setEditing] = useState(false)

  // 地址栏跟随当前标签(用户未在编辑时)
  useEffect(() => {
    if (!editing) setAddress(active?.url ?? '')
  }, [active?.url, activeId, editing])

  // 主进程转发的"新标签"请求(webview 内 window.open / target=_blank)
  useEffect(() => window.conveyor.browser.onOpenTab((url) => newTab(url)), [newTab])

  const el = () => webviewRegistry.get(activeId ?? undefined)
  const go = () => {
    navigate(toUrl(address))
    setEditing(false)
  }

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* 标签条 */}
      <div className="flex items-center gap-1 border-b border-border px-2 pt-1.5">
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
                className="rounded p-0.5 opacity-0 hover:bg-foreground/10 group-hover:opacity-100"
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
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
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
      </div>

      {/* 快捷站点 */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border px-3 py-1.5">
        {QUICK_SITES.map((s) => (
          <button
            key={s.url}
            onClick={() => navigate(s.url)}
            className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground whitespace-nowrap hover:bg-accent hover:text-accent-foreground"
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* webview 栈:全部渲染,只显示当前标签 */}
      <div className="relative flex-1 bg-white">
        {tabs.map((t) => (
          <div key={t.id} className={cn('absolute inset-0', t.id === activeId ? 'block' : 'hidden')}>
            <BrowserTab tab={t} active={t.id === activeId} />
          </div>
        ))}
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
