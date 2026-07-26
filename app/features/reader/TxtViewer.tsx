import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { THEME_COLORS, type ViewerHandle, type ViewerProps } from './types'

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

const TxtViewer = forwardRef<ViewerHandle, ViewerProps>(function TxtViewer(props, ref) {
  const { path, initialLocation, fontSize, lineHeight, theme, onProgress, onToc, onMeta } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const [text, setText] = useState('')
  const { bg, fg } = THEME_COLORS[theme]

  useImperativeHandle(ref, () => ({
    prev: () => scrollRef.current?.scrollBy({ top: -scrollRef.current.clientHeight * 0.9, behavior: 'smooth' }),
    next: () => scrollRef.current?.scrollBy({ top: scrollRef.current.clientHeight * 0.9, behavior: 'smooth' }),
    goTo: (t) => {
      const el = scrollRef.current
      if (!el) return
      const frac = typeof t === 'number' ? t : parseFloat(String(t)) || 0
      el.scrollTop = frac * (el.scrollHeight - el.clientHeight)
    },
  }))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { name, bytes } = await window.conveyor.reader.readFile(path)
      if (cancelled) return
      setText(decodeText(bytes))
      onMeta?.({ title: name.replace(/\.txt$/i, '') })
      onToc?.([])
    })().catch((e) => console.error('[txt] open failed:', e))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

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
        className="mx-auto max-w-3xl px-8 py-10 whitespace-pre-wrap"
        style={{ color: fg, fontSize: `${fontSize}px`, lineHeight }}
      >
        {text}
      </div>
    </div>
  )
})

export default TxtViewer
