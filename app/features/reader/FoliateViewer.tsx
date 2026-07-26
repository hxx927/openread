import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { THEME_COLORS, type TocItem, type ViewerHandle, type ViewerProps } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */

function readerCSS({
  fontSize,
  lineHeight,
  theme,
  fontFamily,
}: Pick<ViewerProps, 'fontSize' | 'lineHeight' | 'theme' | 'fontFamily'>) {
  const { bg, fg } = THEME_COLORS[theme]
  const family = fontFamily ? `html, body, p, li, blockquote, dd, div, span { font-family: ${fontFamily} !important; }` : ''
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    html { color-scheme: ${theme === 'dark' ? 'dark' : 'light'}; background: ${bg}; color: ${fg}; font-size: ${fontSize}px; }
    body { background: ${bg}; color: ${fg}; }
    a:link, a:visited { color: ${theme === 'dark' ? '#6db3f2' : '#2563eb'}; }
    p, li, blockquote, dd, div { line-height: ${lineHeight}; text-align: justify; }
    pre { white-space: pre-wrap !important; }
    ${family}
  `
}

function firstOf(x: any): string {
  if (!x) return ''
  if (typeof x === 'string') return x
  const k = Object.keys(x)
  return k.length ? x[k[0]] : ''
}
function fmtAuthor(x: any): string {
  const one = (c: any) => (typeof c === 'string' ? c : firstOf(c?.name))
  return Array.isArray(x) ? x.map(one).join(', ') : one(x)
}

/** EPUB / MOBI / AZW3 / FB2 / CBZ 阅读器,基于 foliate-js */
const FoliateViewer = forwardRef<ViewerHandle, ViewerProps>(function FoliateViewer(props, ref) {
  const { path, initialLocation, onProgress, onToc, onMeta } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<any>(null)

  useImperativeHandle(ref, () => ({
    prev: () => viewRef.current?.goLeft(),
    next: () => viewRef.current?.goRight(),
    goTo: (t) => viewRef.current?.goTo(t),
    goToFraction: (f) => viewRef.current?.goToFraction?.(f),
  }))

  // 打开书籍(仅在文件变化时)
  useEffect(() => {
    let cancelled = false
    let view: any
    ;(async () => {
      await import('foliate-js/view.js') // 注册 <foliate-view> 自定义元素
      const { name, bytes } = await window.conveyor.reader.readFile(path)
      if (cancelled || !containerRef.current) return
      const file = new File([bytes], name)

      view = document.createElement('foliate-view') as any
      viewRef.current = view
      containerRef.current.innerHTML = ''
      containerRef.current.appendChild(view)

      view.addEventListener('relocate', (e: any) => {
        const d = e.detail || {}
        onProgress(d.fraction ?? 0, d.cfi ?? '')
      })

      await view.open(file)
      view.renderer?.setStyles?.(readerCSS(props))
      view.renderer?.setAttribute?.('flow', props.flow) // 翻页 / 滚动

      // 恢复上次位置,失败则从头
      let restored = false
      if (initialLocation) {
        try {
          await view.goTo(initialLocation)
          restored = true
        } catch {
          restored = false
        }
      }
      if (!restored) view.renderer?.next?.()

      const book = view.book
      onMeta?.({ title: firstOf(book?.metadata?.title) || undefined, author: fmtAuthor(book?.metadata?.author) })
      onToc?.((book?.toc as TocItem[]) ?? [])
    })().catch((err) => console.error('[reader] open failed:', err))

    return () => {
      cancelled = true
      try {
        view?.close?.()
      } catch {
        /* noop */
      }
      if (containerRef.current) containerRef.current.innerHTML = ''
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  // 设置变化时重新套用样式 / 排版模式
  useEffect(() => {
    viewRef.current?.renderer?.setStyles?.(readerCSS(props))
    viewRef.current?.renderer?.setAttribute?.('flow', props.flow)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fontSize, props.lineHeight, props.theme, props.fontFamily, props.flow])

  return <div ref={containerRef} className="h-full w-full" />
})

export default FoliateViewer
