import PdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/* eslint-disable @typescript-eslint/no-explicit-any */

const blobToDataURL = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => resolve('')
    r.readAsDataURL(blob)
  })

const firstOf = (x: any): string => {
  if (!x) return ''
  if (typeof x === 'string') return x
  const k = Object.keys(x)
  return k.length ? x[k[0]] : ''
}
const fmtAuthor = (x: any): string => {
  const one = (c: any) => (typeof c === 'string' ? c : firstOf(c?.name))
  return Array.isArray(x) ? x.map(one).filter(Boolean).join(', ') : one(x)
}

export interface ExtractedMeta {
  cover: string // dataURL 或空
  title?: string
  author?: string
}

/** 导入时提取封面 + 元数据(不打开完整阅读器,尽量轻量) */
export async function extractMeta(path: string, format: string): Promise<ExtractedMeta> {
  try {
    const { name, bytes } = await window.conveyor.reader.readFile(path)

    if (format === 'pdf') {
      const pdfjs: any = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = PdfWorkerUrl
      const pdf = await pdfjs.getDocument({ data: bytes }).promise
      const page = await pdf.getPage(1)
      const base = page.getViewport({ scale: 1 })
      const scale = 320 / base.width
      const vp = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = vp.width
      canvas.height = vp.height
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
      const cover = canvas.toDataURL('image/jpeg', 0.75)
      pdf.destroy()
      return { cover }
    }

    if (format === 'txt') return { cover: '' }

    // foliate 支持的格式:用 makeBook 轻量解析出封面与元数据
    const { makeBook } = await import('foliate-js/view.js')
    const file = new File([bytes], name)
    const book: any = await makeBook(file)
    const meta = book?.metadata ?? {}
    let cover = ''
    try {
      const blob = await book?.getCover?.()
      if (blob) cover = await blobToDataURL(blob)
    } catch {
      /* 无封面 */
    }
    return { cover, title: firstOf(meta.title) || undefined, author: fmtAuthor(meta.author) || undefined }
  } catch (e) {
    console.error('[cover] extract failed:', e)
    return { cover: '' }
  }
}
