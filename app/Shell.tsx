import { useState } from 'react'
import { BookOpen, Globe, Sparkles, Settings, Cloud } from 'lucide-react'
import { cn } from '@/lib/utils'
import ReaderView from '@/app/features/reader/ReaderView'
import BrowserView from '@/app/features/browser/BrowserView'
import AiView from '@/app/features/ai/AiView'
import SourceView from '@/app/features/source/SourceView'
import StealthBar from '@/app/features/native/StealthBar'
import LockSettings from '@/app/features/lock/LockSettings'
import { useStealthStore } from '@/app/store/stealthStore'

type View = 'reader' | 'source' | 'browser' | 'ai'

const NAV: { key: View; label: string; icon: typeof BookOpen }[] = [
  { key: 'reader', label: '书架', icon: BookOpen },
  { key: 'source', label: '书源', icon: Cloud },
  { key: 'browser', label: '浏览', icon: Globe },
  { key: 'ai', label: 'AI', icon: Sparkles },
]

export default function Shell() {
  const [view, setView] = useState<View>('reader')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const transparent = useStealthStore((s) => s.transparent)

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex min-h-0 flex-1">
        {/* 左侧导航(墨鱼风格竖排);透明摸鱼模式下隐藏,让内容铺满并露出桌面 */}
        <nav
          className={cn(
            'w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-3',
            transparent ? 'hidden' : 'flex'
          )}
        >
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => setView(n.key)}
              title={n.label}
              className={cn(
                'flex w-11 flex-col items-center gap-1 rounded-lg py-2 text-[10px] transition-colors',
                view === n.key
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              <n.icon className="size-5" />
              {n.label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => setSettingsOpen(true)}
            title="设置(密码锁)"
            className="flex w-11 flex-col items-center gap-1 rounded-lg py-2 text-[10px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <Settings className="size-5" />
            设置
          </button>
        </nav>

        {/* 主视图:三个视图都常驻挂载(用 hidden 切换),保持各自状态(浏览标签、AI 登录、阅读进度) */}
        <main className="relative min-w-0 flex-1">
          <Pane show={view === 'reader'}>
            <ReaderView />
          </Pane>
          <Pane show={view === 'source'}>
            <SourceView />
          </Pane>
          <Pane show={view === 'browser'}>
            <BrowserView />
          </Pane>
          <Pane show={view === 'ai'}>
            <AiView />
          </Pane>
        </main>
      </div>

      {/* 底部摸鱼工具条;透明模式下隐藏,控制移到浏览器右上角悬浮条 */}
      {!transparent && <StealthBar />}

      {settingsOpen && <LockSettings onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

/** 常驻挂载、仅切换显隐,避免切页时 webview / 阅读器被销毁重建 */
function Pane({ show, children }: { show: boolean; children: React.ReactNode }) {
  return <div className={cn('absolute inset-0', show ? 'block' : 'hidden')}>{children}</div>
}
