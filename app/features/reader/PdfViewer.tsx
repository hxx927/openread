import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import PdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { ViewerHandle, ViewerProps } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** PDF 阅读器,基于 pdf.js;单页画布 + 翻页 + 适配宽度缩放 */
const PdfViewer = forwardRef<ViewerHandle, ViewerProps>(function PdfViewer(props, ref) {
  const { path, initialLocation, theme, onProgress, onMeta, onToc } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pdfRef = useRef<any>(null)
  const pageRef = useRef(1)
  const numRef = useRef(1)
  const zoomRef = useRef(1)

  const render = async () => {
    const pdf = pdfRef.current
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!pdf || !canvas || !wrap) return
    const page = await pdf.getPage(pageRef.current)
    const base = page.getViewport({ scale: 1 })
    const fit = (wrap.clientWidth - 48) / base.width
    const scale = Math.max(0.3, fit * zoomRef.current)
    const viewport = page.getViewport({ scale })
    const dpr = window.devicePixelRatio || 1
    const ctx = canvas.getContext('2d')!
    canvas.width = viewport.width * dpr
    canvas.height = viewport.height * dpr
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    await page.render({ canvasContext: ctx, viewport }).promise
    onProgress(numRef.current ? pageRef.current / numRef.current : 0, String(pageRef.current))
  }

  useImperativeHandle(ref, () => ({
    prev: () => {
      if (pageRef.current > 1) {
        pageRef.current--
        render()
      }
    },
    next: () => {
      if (pageRef.current < numRef.current) {
        pageRef.current++
        render()
      }
    },
    goTo: (t) => {
      const n = typeof t === 'number' ? t : parseInt(String(t)) || 1
      pageRef.current = Math.min(Math.max(1, n), numRef.current)
      render()
    },
  }))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const pdfjs: any = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = PdfWorkerUrl
      const { name, bytes } = await window.conveyor.reader.readFile(path)
      if (cancelled) return
      const pdf = await pdfjs.getDocument({ data: bytes }).promise
      if (cancelled) return
      pdfRef.current = pdf
      numRef.current = pdf.numPages
      pageRef.current = Math.min(Math.max(1, parseInt(initialLocation) || 1), pdf.numPages)
      onMeta?.({ title: name.replace(/\.pdf$/i, '') })
      onToc?.([])
      await render()
    })().catch((e) => console.error('[pdf] open failed:', e))

    const onResize = () => render()
    window.addEventListener('resize', onResize)
    return () => {
      cancelled = true
      window.removeEventListener('resize', onResize)
      try {
        pdfRef.current?.destroy?.()
      } catch {
        /* noop */
      }
      pdfRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  return (
    <div
      ref={wrapRef}
      className="flex h-full w-full justify-center overflow-auto"
      style={{ background: theme === 'dark' ? '#2a2a2a' : '#525659' }}
    >
      <canvas ref={canvasRef} className="my-6 h-fit shadow-lg" />
    </div>
  )
})

export default PdfViewer
