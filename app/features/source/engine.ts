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

  /**
   * 兼容层:轻悦时光(qysg)书源自带 Http/Cache 类,底层调 flutter_inappwebview.callHandler。
   * 这里把它桥接到我们的主进程能力,使这类书源可以直接运行。
   */
  window.flutter_inappwebview = {
    callHandler: async (name, ...a) => {
      switch (name) {
        case 'http': {
          // (method, url, body, headersJson, followRedirects, contenttype)
          const [method, url, body, headersJson, followRedirects, contenttype] = a
          let headers = {}
          try { headers = headersJson ? JSON.parse(headersJson) : {} } catch (e) { headers = {} }
          if (contenttype && !headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = contenttype
          return await H.http({
            url: String(url),
            method: String(method || 'get').toUpperCase(),
            headers,
            body: body ? String(body) : undefined,
            followRedirects: followRedirects !== false,
          })
        }
        case 'cache.get': return await H.cacheGet(String(a[0]))
        case 'cache.set': return await H.cacheSet(String(a[0]), String(a[1]))
        case 'cache.remove': return await H.cacheRemove(String(a[0]))

        case 'base64encode': return window.base64Encode(a[0])
        case 'base64decode': return window.base64Decode(a[0])
        case 'htmlToText': return window.removeHTMLTags(a[0])
        case 'getWebViewUA': return navigator.userAgent
        case 'version': return '1.0.0'
        case 'buildNumber': return '1'
        case 'device': return 'OpenRead'
        case 'id': return 'openread'
        case 'CookieJar': return true
        case 'getdurChapterIndex': return 0
        case 'getLoginUser': return ''
        case 'toTraditional': case 'toSimplified': return a[0]
        case 'log': console.log('[书源]', ...a); return true
        case 'showToast': console.log('[书源提示]', ...a); return true
        // 以下能力当前未实现(需要宿主 UI 配合),返回空值让书源走降级分支
        case 'webview': case 'webviewajax': case 'openurl': case 'startBrowser':
        case 'startBrowserWithShouldOverrideUrlLoading': case 'startBrowserDp':
        case 'back': case 'getVerificationCode': case 'addbook': case 'voice': case 'text':
        case 'utf8ToGbkUrlEncoded':
          console.log('[书源] 未实现的宿主能力:', name)
          return null
        default:
          console.log('[书源] 未知 callHandler:', name)
          return null
      }
    },
  }

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

/** 从整页 HTML 里抽出内联 <script> 代码(跳过带 src 的外链脚本) */
function extractScripts(html: string): string[] {
  const out: string[] = []
  const re = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const body = m[1].trim()
    if (body) out.push(body)
  }
  return out
}

class SourceRuntime {
  private wv: WebviewElement | null = null
  private booting: Promise<void> | null = null

  constructor(
    private code: string,
    private kind: 'js' | 'html' = 'js'
  ) {}

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

      // 书源本体:纯 JS 直接注入;轻悦时光书源(整页 HTML)则抽出内联 script 依次注入
      if (this.kind === 'html') {
        const scripts = extractScripts(this.code)
        if (!scripts.length) throw new Error('书源 HTML 中没有找到可执行脚本')
        for (const s of scripts) await wv.executeJavaScript(s)
      } else {
        await wv.executeJavaScript(this.code)
      }
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

export interface SourceRef {
  id: string
  code: string
  kind?: 'js' | 'html'
}

function runtimeFor(s: SourceRef): SourceRuntime {
  let rt = runtimes.get(s.id)
  if (!rt) {
    rt = new SourceRuntime(s.code, s.kind ?? 'js')
    runtimes.set(s.id, rt)
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
  search: (s: SourceRef, key: string, page = 1) => runtimeFor(s).call<SourceBook[]>('search', [key, page]),
  info: (s: SourceRef, bookUrl: string) => runtimeFor(s).call<SourceBook>('info', [bookUrl]),
  chapter: (s: SourceRef, tocUrl: string) => runtimeFor(s).call<SourceChapter[]>('chapter', [tocUrl]),
  content: (s: SourceRef, url: string) => runtimeFor(s).call<string>('content', [url]),
}
