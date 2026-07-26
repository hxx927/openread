import { useState } from 'react'
import { Search, ArrowRight, Plus, X, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBrowserStore, toUrl } from '@/app/store/browserStore'
import { NAV_CATEGORIES, type NavSite } from './navSites'

/** 浏览器导航主页(仿墨鱼):搜索 + 分类推荐 + 我的站点 */
export default function NavHome({ onOpen }: { onOpen: (url: string) => void }) {
  const { mySites, addSite, removeSite } = useBrowserStore()
  const [cat, setCat] = useState(0)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')

  const search = () => {
    const u = toUrl(q)
    if (u) onOpen(u)
  }
  const confirmAdd = () => {
    if (!url.trim()) return
    addSite(name, url)
    setName('')
    setUrl('')
    setAdding(false)
  }

  return (
    <div className="h-full w-full overflow-auto bg-background">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-6 py-10">
        {/* 搜索 */}
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="输入网址或搜索内容…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            spellCheck={false}
            autoFocus
          />
          <button onClick={search} className="rounded-md p-1 text-muted-foreground hover:bg-muted" title="打开">
            <ArrowRight className="size-4" />
          </button>
        </div>

        {/* 分类推荐 */}
        <div className="flex gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex w-16 shrink-0 flex-col gap-1 border-r border-border pr-2">
            {NAV_CATEGORIES.map((c, i) => (
              <button
                key={c.key}
                onClick={() => setCat(i)}
                className={cn(
                  'rounded-md px-2 py-1.5 text-sm',
                  i === cat ? 'font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
            {NAV_CATEGORIES[cat].sites.map((s) => (
              <SiteTile key={s.url} site={s} onOpen={onOpen} />
            ))}
          </div>
        </div>

        {/* 我的站点 */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">我的站点</span>
            <button
              onClick={() => setAdding((v) => !v)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              <Plus className="size-3.5" /> 添加
            </button>
          </div>

          {adding && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="名称(可选)"
                className="w-28 rounded-md border border-border bg-transparent px-2 py-1 text-xs outline-none"
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmAdd()}
                placeholder="网址,如 qidian.com"
                className="flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-xs outline-none"
              />
              <button onClick={confirmAdd} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">
                保存
              </button>
            </div>
          )}

          {mySites.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">还没有自定义站点,点「添加」把常去的网站放这儿,一点即进。</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {mySites.map((s) => (
                <SiteTile key={s.id} site={s} onOpen={onOpen} onRemove={() => removeSite(s.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SiteTile({ site, onOpen, onRemove }: { site: NavSite; onOpen: (url: string) => void; onRemove?: () => void }) {
  return (
    <button
      onClick={() => onOpen(site.url)}
      className="group relative flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-muted"
    >
      <Globe className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{site.name}</span>
      {onRemove && (
        <span
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute top-1 right-1 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-foreground/10"
        >
          <X className="size-3" />
        </span>
      )}
    </button>
  )
}
