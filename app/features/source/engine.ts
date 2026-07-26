// vendor:jQuery(MIT)与 CryptoJS(MIT),仅作为文本注入书源沙箱使用
import jquerySrc from './vendor/jquery.min.js?raw'
import cryptoSrc from './vendor/crypto-js.js?raw'
import type { WebviewElement } from '@/app/types/webview'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 书源运行时(qysg / 轻悦时光 风格)。
 * 书源就是一段 JS,实现 search/info/chapter/content 等异步函数;
 * 这里在一个「隔离的隐藏 webview」里跑它,只注入 Http / Cache / Cookie / 解析工具,
 * 拿不到 conveyor、Node、文件系统 —— 不可信代码被关在沙箱里。
 */

/** 注入给书源用的运行环境 */
const BOOTSTRAP = `
(() => {
  const H = window.__sourceHost
  const enc = (o) => (o && typeof o === 'object' ? o : undefined)

  class Http {
    async Get(url, headers, followRedirects) {
      return H.http({ url, method: 'GET', headers: enc(headers), followRedirects })
    }
    async Post(url, headers, body, contenttype, followRedirects) {
      const h = Object.assign({}, enc(headers))
      if (contenttype && !h['Content-Type'] && !h['content-type']) h['Content-Type'] = contenttype
      return H.http({ url, method: 'POST', headers: h, body: body == null ? undefined : String(body), followRedirects })
    }
    async Head(url, headers, followRedirects) {
      return H.http({ url, method: 'HEAD', headers: enc(headers), followRedirects })
    }
  }
  window.Http = Http

  window.Cache = {
    get: (k) => H.cacheGet(String(k)),
    set: (k, v) => H.cacheSet(String(k), String(v)),
    remove: (k) => H.cacheRemove(String(k)),
  }

  // Cookie:实际请求的 cookie 由主进程 session 自动管理,这里提供书源可读写的存储位
  const ck = (u) => 'cookie:' + String(u)
  window.Cookie = {
    get: (u) => H.cacheGet(ck(u)),
    set: (u, v) => H.cacheSet(ck(u), String(v)),
    remove: (u) => H.cacheRemove(ck(u)),
    async setCookie(u, key, value) {
      const cur = (await H.cacheGet(ck(u))) || ''
      const parts = cur.split(';').map(s => s.trim()).filter(s => s && s.split('=')[0] !== key)
      parts.push(key + '=' + value)
      return H.cacheSet(ck(u), parts.join('; '))
    },
    async getCookie(u, key) {
      const cur = (await H.cacheGet(ck(u))) || ''
      const hit = cur.split(';').map(s => s.trim()).find(s => s.split('=')[0] === key)
      return hit ? hit.slice(hit.indexOf('=') + 1) : ''
    },
  }

  // 解析工具
  window.parseHTMLSafely = (html) => new DOMParser().parseFromString(String(html), 'text/html')
  window.removeHTMLTags = (s) => String(s == null ? '' : s).replace(/<[^>]*>/g, '')
  window.removeHTMLSafely = (el) => { try { el && el.remove && el.remove() } catch (e) {} }
  window.base64Decode = (s) => { try { return decodeURIComponent(escape(atob(s))) } catch (e) { return atob(s) } }
  window.base64Encode = (s) => btoa(unescape(encodeURIComponent(String(s))))

  // 统一调用入口:返回 JSON 字符串(executeJavaScript 只能回传可序列化值)
  window.__call = async (fn, args) => {
    try {
      const f = window[fn]
      if (typeof f !== 'function') return JSON.stringify({ ok: false, error: '书源未实现 ' + fn + '()' })
      const r = await f.apply(window, args || [])
      return JSON.stringify({ ok: true, data: r === undefined ? null : r })
    } catch (e) {
      return JSON.stringify({ ok: false, error: String((e && (e.stack || e.message)) || e) })
    }
  }
  window.__ready = true
})()
`

/** 书源返回值可能是 JSON 字符串,也可能已是对象 */
function coerce<T>(v: any): T {
  if (typeof v === 'string') {
    const s = v.trim()
    if (s.startsWith('[') || s.startsWith('{')) {
      try {
        return JSON.parse(s)
      } catch {
        /* 不是 JSON,原样返回 */
      }
    }
  }
  return v as T
}

export interface SourceBook {
  bookUrl: string
  name: string
  author?: string
  kind?: string
  coverUrl?: string
  intro?: string
  tocUrl?: string
  wordCount?: string
  latestChapterTitle?: string
  type?: number
}

export interface SourceChapter {
  name: string
  url?: string
  chapterId?: string
  index?: number
  isVolume?: boolean
}

class SourceRuntime {
  private wv: WebviewElement | null = null
  private booting: Promise<void> | null = null

  constructor(private code: string) {}

  private boot(): Promise<void> {
    if (this.booting) return this.booting
    this.booting = (async () => {
      const preload = await window.conveyor.source.runtimePreload()
      const wv = document.createElement('webview') as unknown as WebviewElement
      wv.setAttribute('src', 'about:blank')
      wv.setAttribute('partition', 'persist:openread-source')
      wv.setAttribute('preload', preload)
      // 离屏但仍然渲染(display:none 会导致 webview 不初始化)
      const style = wv.style as CSSStyleDeclaration
      style.position = 'fixed'
      style.width = '400px'
      style.height = '300px'
      style.left = '-10000px'
      style.top = '0'
      style.opacity = '0'
      style.pointerEvents = 'none'
      document.body.appendChild(wv)
      this.wv = wv

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('书源运行时启动超时')), 15000)
        wv.addEventListener('dom-ready', () => {
          clearTimeout(t)
          resolve()
        })
      })

      await wv.executeJavaScript(jquerySrc)
      await wv.executeJavaScript(cryptoSrc)
      await wv.executeJavaScript(BOOTSTRAP)
      await wv.executeJavaScript(this.code) // 书源本体
    })()
    return this.booting
  }

  async call<T = any>(fn: string, args: any[] = []): Promise<T> {
    await this.boot()
    if (!this.wv) throw new Error('书源运行时不可用')
    const raw = await this.wv.executeJavaScript(`__call(${JSON.stringify(fn)}, ${JSON.stringify(args)})`)
    const res = JSON.parse(String(raw)) as { ok: boolean; data?: any; error?: string }
    if (!res.ok) throw new Error(res.error || '书源执行失败')
    return coerce<T>(res.data)
  }

  destroy(): void {
    try {
      this.wv?.remove()
    } catch {
      /* noop */
    }
    this.wv = null
    this.booting = null
  }
}

/** 每个书源一个运行时实例(按 id 缓存,避免全局变量互相污染) */
const runtimes = new Map<string, SourceRuntime>()

function runtimeFor(id: string, code: string): SourceRuntime {
  let rt = runtimes.get(id)
  if (!rt) {
    rt = new SourceRuntime(code)
    runtimes.set(id, rt)
  }
  return rt
}

export function disposeRuntime(id: string): void {
  runtimes.get(id)?.destroy()
  runtimes.delete(id)
}

export function disposeAllRuntimes(): void {
  runtimes.forEach((rt) => rt.destroy())
  runtimes.clear()
}

/* ---------------- 对外 API ---------------- */

export const sourceEngine = {
  search: (id: string, code: string, key: string, page = 1) =>
    runtimeFor(id, code).call<SourceBook[]>('search', [key, page]),

  info: (id: string, code: string, bookUrl: string) => runtimeFor(id, code).call<SourceBook>('info', [bookUrl]),

  chapter: (id: string, code: string, tocUrl: string) =>
    runtimeFor(id, code).call<SourceChapter[]>('chapter', [tocUrl]),

  content: (id: string, code: string, url: string) => runtimeFor(id, code).call<string>('content', [url]),
}
