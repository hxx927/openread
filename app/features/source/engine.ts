// vendor:jQuery(MIT)与 CryptoJS(MIT),仅作为文本注入书源沙箱使用
import jquerySrc from './vendor/jquery.min.js?raw'
import cryptoSrc from './vendor/crypto-js.js?raw'
import type { WebviewElement } from '@/app/types/webview'

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
  const sourceToasts = []

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

  const isLoginInfo = (key) => String(key) === 'LoginInfo'
  window.Cache = {
    get: (k) => isLoginInfo(k) ? H.authGet() : H.cacheGet(String(k)),
    set: (k, v) => isLoginInfo(k) ? H.authSet(String(v)) : H.cacheSet(String(k), String(v)),
    remove: (k) => isLoginInfo(k) ? H.authClear() : H.cacheRemove(String(k)),
  }

  // Cookie:每个书源绑定真实 Electron session cookie jar
  window.Cookie = {
    get: (u) => H.cookieGet(String(u)),
    set: (u, v) => H.cookieSet(String(u), String(v)),
    remove: (u) => H.cookieRemove(String(u)),
    setCookie: (u, key, value) => H.cookieSetOne(String(u), String(key), String(value)),
    getCookie: (u, key) => H.cookieGetOne(String(u), String(key)),
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
            body: body == null ? undefined : String(body),
            followRedirects: followRedirects !== false,
          })
        }
        case 'cache.get': return isLoginInfo(a[0]) ? await H.authGet() : await H.cacheGet(String(a[0]))
        case 'cache.set': return isLoginInfo(a[0]) ? await H.authSet(String(a[1])) : await H.cacheSet(String(a[0]), String(a[1]))
        case 'cache.remove': return isLoginInfo(a[0]) ? await H.authClear() : await H.cacheRemove(String(a[0]))
        case 'cookie.get': return await H.cookieGet(String(a[0]))
        case 'cookie.getCookie': return await H.cookieGetOne(String(a[0]), String(a[1]))
        case 'cookie.set': return await H.cookieSet(String(a[0]), String(a[1]))
        case 'cookie.setcookie': return await H.cookieSetOne(String(a[0]), String(a[1]), String(a[2]))
        case 'cookie.remove': return await H.cookieRemove(String(a[0]))

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
        case 'getLoginUser': return await H.authGet()
        case 'toTraditional': case 'toSimplified': return a[0]
        case 'log': console.log('[书源]', ...a); return true
        case 'showToast': {
          const text = a.map(v => { try { return typeof v === 'string' ? v : JSON.stringify(v) } catch (e) { return String(v) } }).join(' ').trim().slice(0, 500)
          if (text && sourceToasts.length < 10) sourceToasts.push(text)
          return true
        }
        case 'webview': case 'webviewajax': case 'openurl': case 'startBrowser':
        case 'startBrowserWithShouldOverrideUrlLoading': case 'startBrowserDp': {
          const target = a.find(v => typeof v === 'string' && /^https?:\\/\\//i.test(v))
          return target ? H.openLogin(target) : null
        }
        // 以下能力需要更具体的宿主交互,保留兼容降级,但不做付费/验证码绕过
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
    sourceToasts.length = 0
    try {
      const f = window[fn]
      if (typeof f !== 'function') return JSON.stringify({ ok: false, error: '书源未实现 ' + fn + '()', toasts: [] })
      const r = await f.apply(window, args || [])
      return JSON.stringify({ ok: true, data: r === undefined ? null : r, toasts: sourceToasts.splice(0) })
    } catch (e) {
      return JSON.stringify({ ok: false, error: String((e && (e.stack || e.message)) || e), toasts: sourceToasts.splice(0) })
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

export interface SourceFindItem {
  title: string
  url: string
  width?: number
}

export interface SourceLoginField {
  name: string
  type: string
  value?: string
  action?: string
  url?: string
  placeholder?: string
  [key: string]: unknown
}

export type SourceFunctionName =
  'search' | 'info' | 'chapter' | 'content' | 'getfinds' | 'find' | 'getloginurl' | 'login'

export interface SourceToast {
  sourceId: string
  message: string
}

const toastListeners = new Set<(toast: SourceToast) => void>()

export function subscribeSourceToasts(listener: (toast: SourceToast) => void): () => void {
  toastListeners.add(listener)
  return () => toastListeners.delete(listener)
}

function emitSourceToast(toast: SourceToast): void {
  for (const listener of toastListeners) listener(toast)
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
  private generation = 0

  constructor(
    private sourceId: string,
    private code: string,
    private kind: 'js' | 'html' = 'js'
  ) {}

  private boot(): Promise<void> {
    if (this.booting) return this.booting
    let timer = 0
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error('书源运行时启动超时')), 30000)
    })
    this.booting = Promise.race([this.start(this.generation), timeout])
      .finally(() => window.clearTimeout(timer))
      .catch((error) => {
        this.destroy()
        throw error
      })
    return this.booting
  }

  private async start(generation: number): Promise<void> {
    const preload = await window.conveyor.source.runtimePreload()
    if (generation !== this.generation) throw new Error('书源运行时启动已取消')
    const wv = document.createElement('webview') as unknown as WebviewElement
    wv.setAttribute('src', `about:blank#sourceId=${encodeURIComponent(this.sourceId)}`)
    wv.setAttribute('partition', `openread-source-runtime-${this.sourceId}`)
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
  }

  private async execute<T>(code: string, timeoutMessage: string): Promise<T> {
    if (!this.wv) throw new Error('书源运行时不可用')
    const execution = this.wv.executeJavaScript(code)
    let timer = 0
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(timeoutMessage)), 30000)
    })
    try {
      return (await Promise.race([execution, timeout])) as T
    } catch (error) {
      this.destroy()
      throw error
    } finally {
      window.clearTimeout(timer)
    }
  }

  async call<T = any>(fn: string, args: any[] = []): Promise<T> {
    await this.boot()
    const raw = await this.execute<unknown>(
      `__call(${JSON.stringify(fn)}, ${JSON.stringify(args)})`,
      `书源调用超时: ${fn}`
    )
    const res = JSON.parse(String(raw)) as {
      ok: boolean
      data?: any
      error?: string
      toasts?: unknown[]
    }
    for (const toast of res.toasts ?? []) {
      const message = String(toast ?? '')
        .trim()
        .slice(0, 500)
      if (message) emitSourceToast({ sourceId: this.sourceId, message })
    }
    if (!res.ok) throw new Error(res.error || '书源执行失败')
    return coerce<T>(res.data)
  }

  async has(fn: string): Promise<boolean> {
    await this.boot()
    return Boolean(await this.execute(`typeof window[${JSON.stringify(fn)}] === 'function'`, `书源函数检测超时: ${fn}`))
  }

  matches(source: SourceRef): boolean {
    return this.sourceId === source.id && this.code === source.code && this.kind === (source.kind ?? 'js')
  }

  destroy(): void {
    this.generation++
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
  if (rt && !rt.matches(s)) {
    rt.destroy()
    runtimes.delete(s.id)
    rt = undefined
  }
  if (!rt) {
    rt = new SourceRuntime(s.id, s.code, s.kind ?? 'js')
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

/**
 * 注意:轻悦时光书源的实际签名带第二个参数 bookUrl
 *   chapter(tocUrl, bookUrl) / content(chapterId, bookUrl)
 * (README 只写了第一个参数,但真实书源用到了第二个,不传会拿不到数据)
 */
export const sourceEngine = {
  search: (s: SourceRef, key: string, page = 1) => runtimeFor(s).call<SourceBook[]>('search', [key, page]),
  info: (s: SourceRef, bookUrl: string) => runtimeFor(s).call<SourceBook>('info', [bookUrl]),
  chapter: (s: SourceRef, tocUrl: string, bookUrl?: string) =>
    runtimeFor(s).call<SourceChapter[]>('chapter', [tocUrl, bookUrl ?? tocUrl]),
  content: (s: SourceRef, chapterId: string, bookUrl?: string) =>
    runtimeFor(s).call<string>('content', [chapterId, bookUrl ?? '']),

  async getFinds(s: SourceRef): Promise<SourceFindItem[]> {
    const runtime = runtimeFor(s)
    if (!(await runtime.has('getfinds'))) return []
    const items = coerce<SourceFindItem[]>(await runtime.call('getfinds'))
    return (Array.isArray(items) ? items : []).map((item) => ({
      title: String(item.title ?? ''),
      url: String(item.url ?? ''),
      width: Number(item.width ?? 1),
    }))
  },

  find: (s: SourceRef, url: string, page = 1) => runtimeFor(s).call<SourceBook[]>('find', [url, page]),

  async getLoginFields(s: SourceRef): Promise<SourceLoginField[] | string> {
    const runtime = runtimeFor(s)
    if (!(await runtime.has('getloginurl'))) return []
    const value = coerce<SourceLoginField[] | string>(await runtime.call('getloginurl'))
    return value
  },

  async submitLogin(s: SourceRef, info: Record<string, string>): Promise<unknown> {
    const runtime = runtimeFor(s)
    if (!(await runtime.has('login'))) throw new Error('该书源未实现 login()')
    await window.conveyor.source.authSet(s.id, JSON.stringify(info))
    return runtime.call('login')
  },

  async runAction(s: SourceRef, action: string): Promise<unknown> {
    const match = /^\s*([A-Za-z_$][\w$]*)\s*\(\s*\)\s*$/.exec(action)
    if (!match) throw new Error('拒绝执行不安全的登录动作')
    return runtimeFor(s).call(match[1])
  },

  async inspect(s: SourceRef): Promise<Record<SourceFunctionName, boolean>> {
    const names: SourceFunctionName[] = [
      'search',
      'info',
      'chapter',
      'content',
      'getfinds',
      'find',
      'getloginurl',
      'login',
    ]
    const runtime = runtimeFor(s)
    const entries = await Promise.all(names.map(async (name) => [name, await runtime.has(name)] as const))
    return Object.fromEntries(entries) as Record<SourceFunctionName, boolean>
  },
}
