import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { WebviewElement } from '@/app/types/webview'

/**
 * AI 面板 —— 借鉴墨鱼的做法:不是自建 LLM 客户端,而是内嵌各家官方网站。
 * 你在站内登录即等于"自带 Key",本应用不代理、不经手任何 API Key。
 */
const AI_SITES = [
  { name: '豆包', url: 'https://www.doubao.com' },
  { name: 'DeepSeek', url: 'https://chat.deepseek.com' },
  { name: 'Kimi', url: 'https://www.kimi.com' },
  { name: '元宝', url: 'https://yuanbao.tencent.com' },
  { name: '智谱', url: 'https://chat.z.ai' },
]

export default function AiView() {
  const ref = useRef<WebviewElement | null>(null)
  const [active, setActive] = useState(0)

  const go = (i: number) => {
    setActive(i)
    ref.current?.loadURL(AI_SITES[i].url)
  }

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <span className="mr-1 text-xs font-semibold text-muted-foreground">AI</span>
        {AI_SITES.map((s, i) => (
          <button
            key={s.url}
            onClick={() => go(i)}
            className={cn(
              'rounded-full px-3 py-1 text-xs',
              i === active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
            )}
          >
            {s.name}
          </button>
        ))}
      </div>
      <webview
        ref={ref as unknown as React.Ref<HTMLElement>}
        src={AI_SITES[0].url}
        partition="persist:openread-web"
        allowpopups={'true'}
        className="h-full w-full flex-1 bg-white"
      />
    </div>
  )
}
