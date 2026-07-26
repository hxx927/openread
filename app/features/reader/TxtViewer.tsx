import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { THEME_COLORS, type TocItem, type ViewerHandle, type ViewerProps } from './types'

/** 把字节解码成文本:优先 UTF-8,乱码多则回退 GB18030(中文 TXT 常见) */
function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  const bad = (utf8.match(/�/g) || []).length
  if (bad > utf8.length * 0.002) {
    try {
      return new TextDecoder('gb18030').decode(bytes)
    } catch {
      return utf8
    }
  }
  return utf8
}

interface Chapter {
  title: string
  body: string
}

/** 识别章节标题行(第X章/卷/节/回、序章、楔子、番外…),把 TXT 切成章节 */
const CHAP_RE =
  /^[ \t　]*(第\s*[0-9零〇一二三四五六七八九十百千两]+\s*[章回节卷部篇集]|序章|序言|序|楔子|引子|前言|尾声|后记|番外[篇章]?|终章)[^\n]{0,30}$/

function parseChapters(text: string): Chapter[] {
  const lines = text.split(/\r?\n/)
  const chapters: Chapter[] = []
  let cur: Chapter | null = null
  const pre: string[] = []
  for (const line of lines) {
    if (CHAP_RE.test(line.trim()) && line.trim().length <= 40) {
      if (cur) chapters.push(cur)
      cur = { title: line.trim(), body: '' }
    } else if (cur) {
      cur.body += line + '\n'
    } else {
      pre.push(line)
    }
  }
  if (cur) chapters.push(cur)
  // 章节太少就当作整本一章(避免误伤)
  if (chapters.length < 2) return [{ title: '正文', body: text }]
  const preText = pre.join('\n').trim()
  if (preText) chapters.unshift({ title: '开头', body: preText })
  return chapters
}

const TxtViewer = forwardRef<ViewerHandle, ViewerProps>(function TxtViewer(props, ref) {
  const { path, initialLocation, fontSize, lineHeight, theme, fontFamily, onProgress, onToc, onMeta } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const chapRefs = useRef<(HTMLDivElement | null)[]>([])
  const [text, setText] = useState('')
  const { bg, fg } = THEME_COLORS[theme]

  const chapters = useMemo(() => (text ? parseChapters(text) : []), [text])

  useImperativeHandle(ref, () => ({
    prev: () => scrollRef.current?.scrollBy({ top: -scrollRef.current.clientHeight * 0.9, behavior: 'smooth' }),
    next: () => scrollRef.current?.scrollBy({ top: scrollRef.current.clientHeight * 0.9, behavior: 'smooth' }),
    goTo: (t) => {
      const s = String(t)
      if (s.startsWith('ch-')) {
        chapRefs.current[Number(s.slice(3))]?.scrollIntoView()
        return
      }
      const el = scrollRef.current
      if (!el) return
      const frac = typeof t === 'number' ? t : parseFloat(s) || 0
      el.scrollTop = frac * (el.scrollHeight - el.clientHeight)
    },
    goToFraction: (f) => {
      const el = scrollRef.current
      if (el) el.scrollTop = f * (el.scrollHeight - el.clientHeight)
    },
  }))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { name, bytes } = await window.conveyor.reader.readFile(path)
      if (cancelled) return
      setText(decodeText(bytes))
      onMeta?.({ title: name.replace(/\.txt$/i, '') })
    })().catch((e) => console.error('[txt] open failed:', e))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  // 章节解析完成后上报目录
  useEffect(() => {
    if (!chapters.length) return
    const toc: TocItem[] = chapters.length > 1 ? chapters.map((c, i) => ({ label: c.title, href: `ch-${i}` })) : []
    onToc?.(toc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters])

  // 文本就绪后恢复上次进度
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !text) return
    const frac = parseFloat(initialLocation) || 0
    requestAnimationFrame(() => {
      el.scrollTop = frac * (el.scrollHeight - el.clientHeight)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const denom = el.scrollHeight - el.clientHeight
    const frac = denom > 0 ? el.scrollTop / denom : 0
    onProgress(frac, String(frac))
  }

  return (
    <div ref={scrollRef} onScroll={onScroll} className="h-full w-full overflow-auto" style={{ background: bg }}>
      <div
        className="mx-auto max-w-3xl px-8 py-10"
        style={{ color: fg, fontSize: `${fontSize}px`, lineHeight, fontFamily: fontFamily || undefined }}
      >
        {chapters.map((c, i) => (
          <div key={i} ref={(el) => (chapRefs.current[i] = el)} className="scroll-mt-4">
            {chapters.length > 1 && <h3 className="mb-4 text-center text-lg font-semibold">{c.title}</h3>}
            <div className="whitespace-pre-wrap">{c.body}</div>
          </div>
        ))}
      </div>
    </div>
  )
})

export default TxtViewer
