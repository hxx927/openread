import { app, session } from 'electron'
import { join } from 'path'
import fse from 'fs-extra'

/**
 * 网络书源(qysg / 轻悦时光 风格):
 * 书源本身就是一段 JS,实现 search/info/chapter/content 等异步函数;
 * 本模块负责「书源存储」与「HTTP 代理」——由主进程发请求,绕开跨域并正确处理中文编码。
 */

export interface BookSource {
  id: string
  name: string
  enabled: boolean
  code: string // js 类型:JS 源码;html 类型:整页 HTML(轻悦时光书源的 html 字段)
  kind: 'js' | 'html'
  addedAt: number
}

/** 解析导入内容:支持纯 JS 书源、以及轻悦时光的 JSON(外壳里 html 字段装整页 HTML) */
export function parseSourceFile(text: string, fallbackName?: string): { name: string; code: string; kind: 'js' | 'html' }[] {
  const raw = text.trim()
  if (!raw) throw new Error('内容为空')

  // JSON 外壳(轻悦时光书源;也可能是一个数组装多个书源)
  if (raw.startsWith('[') || raw.startsWith('{')) {
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      json = null
    }
    if (json) {
      const arr = Array.isArray(json) ? json : [json]
      const out: { name: string; code: string; kind: 'js' | 'html' }[] = []
      for (const it of arr as Record<string, unknown>[]) {
        const name = String(it.bookSourceName || it.name || fallbackName || '未命名书源')
        if (typeof it.html === 'string' && it.html.trim()) {
          out.push({ name, code: it.html, kind: 'html' })
        } else if (typeof it.js === 'string' && it.js.trim()) {
          out.push({ name, code: it.js, kind: 'js' })
        }
      }
      if (out.length) return out
      throw new Error(
        '这是 JSON 规则书源(阅读 / Legado 格式),当前引擎只支持 JS 书源与轻悦时光书源(含 html 字段)'
      )
    }
  }

  // 纯 JS 书源
  if (!/function\s+(search|content|chapter)/.test(raw)) {
    throw new Error('未找到 search / chapter / content 函数,可能不是 JS 书源')
  }
  return [{ name: fallbackName || guessName(raw), code: raw, kind: 'js' }]
}

const file = () => join(app.getPath('userData'), 'sources.json')

async function readAll(): Promise<BookSource[]> {
  try {
    const d = await fse.readJSON(file())
    return Array.isArray(d) ? d : []
  } catch {
    return []
  }
}

async function writeAll(list: BookSource[]): Promise<void> {
  await fse.ensureDir(app.getPath('userData'))
  await fse.writeJSON(file(), list, { spaces: 2 })
}

/** 从书源代码里尽量猜一个名字:优先 // @name,其次 name 变量 */
function guessName(code: string): string {
  const at = code.match(/\/\/\s*@name\s+(.+)/)
  if (at) return at[1].trim()
  const v = code.match(/(?:var|let|const)\s+name\s*=\s*['"](.+?)['"]/)
  if (v) return v[1].trim()
  return '未命名书源'
}

export const sources = {
  list: () => readAll(),

  /** 导入:自动识别 纯JS / 轻悦时光JSON(可含多个书源) */
  async add(text: string, name?: string): Promise<BookSource[]> {
    const parsed = parseSourceFile(text, name)
    const list = await readAll()
    const added: BookSource[] = parsed.map((p, i) => ({
      id: `src-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      name: p.name.slice(0, 60),
      enabled: true,
      code: p.code,
      kind: p.kind,
      addedAt: Date.now(),
    }))
    list.unshift(...added)
    await writeAll(list)
    return added
  },

  /** 从链接导入书源(支持 .js 与轻悦时光 .json) */
  async addFromUrl(url: string): Promise<BookSource[]> {
    const u = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
    const res = await httpRequest({ url: u, headers: { 'User-Agent': 'OpenRead/1.0' } })
    if (res.statusCode >= 400) throw new Error(`下载失败(HTTP ${res.statusCode})`)
    const text = res.data?.trim() ?? ''
    if (!text) throw new Error('链接内容为空')

    // 名字优先用书源自带的(@name / bookSourceName),没有则退回链接文件名
    const hasAtName = /\/\/\s*@name\s+\S/.test(text)
    const fileName = decodeURIComponent(u.split('/').pop() || '').replace(/\.(js|txt|json)$/i, '')
    return this.add(text, hasAtName ? undefined : fileName || undefined)
  },

  async remove(id: string): Promise<boolean> {
    const list = await readAll()
    const next = list.filter((s) => s.id !== id)
    await writeAll(next)
    return next.length !== list.length
  },

  async toggle(id: string, enabled: boolean): Promise<boolean> {
    const list = await readAll()
    const s = list.find((x) => x.id === id)
    if (!s) return false
    s.enabled = enabled
    await writeAll(list)
    return true
  },
}

/* ---------------- HTTP 代理 ---------------- */

const SOURCE_PARTITION = 'persist:openread-source' // 独立分区:书源的 cookie 与浏览分开

export interface HttpReq {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  followRedirects?: boolean
}

export interface HttpRes {
  statusCode: number
  headers: Record<string, string>
  body: string // base64(原始字节,供书源自行解码/解密)
  data: string // 已按charset解码的文本(常用)
  url: string // 最终地址(跟随重定向后)
}

/** 从 content-type / HTML meta 猜编码,默认 utf-8 */
function detectCharset(contentType: string, bytes: Uint8Array): string {
  const m = /charset=["']?([\w-]+)/i.exec(contentType)
  if (m) return m[1].toLowerCase()
  // 仅嗅探前 2KB 的 meta
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048))
  const meta = /charset=["']?([\w-]+)/i.exec(head)
  return meta ? meta[1].toLowerCase() : 'utf-8'
}

function decode(bytes: Uint8Array, charset: string): string {
  const norm = charset === 'gb2312' || charset === 'gbk' ? 'gb18030' : charset
  try {
    return new TextDecoder(norm).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** 主进程代发 HTTP(无跨域限制,带独立 cookie 分区,自动解码中文编码) */
export async function httpRequest(req: HttpReq): Promise<HttpRes> {
  const ses = session.fromPartition(SOURCE_PARTITION)
  const res = await ses.fetch(req.url, {
    method: req.method || 'GET',
    headers: req.headers,
    body: req.body,
    redirect: req.followRedirects === false ? 'manual' : 'follow',
  })
  const buf = new Uint8Array(await res.arrayBuffer())
  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => (headers[k] = v))
  const charset = detectCharset(headers['content-type'] || '', buf)
  return {
    statusCode: res.status,
    headers,
    body: Buffer.from(buf).toString('base64'),
    data: decode(buf, charset),
    url: res.url || req.url,
  }
}

/* ---------------- 书源可用的键值缓存 ---------------- */

const cacheFile = () => join(app.getPath('userData'), 'source-cache.json')

export const sourceCache = {
  async get(key: string): Promise<string | null> {
    try {
      const d = await fse.readJSON(cacheFile())
      return typeof d?.[key] === 'string' ? d[key] : null
    } catch {
      return null
    }
  },
  async set(key: string, value: string): Promise<boolean> {
    let d: Record<string, string> = {}
    try {
      d = await fse.readJSON(cacheFile())
    } catch {
      /* 首次 */
    }
    d[key] = value
    await fse.writeJSON(cacheFile(), d)
    return true
  },
  async remove(key: string): Promise<boolean> {
    try {
      const d = await fse.readJSON(cacheFile())
      delete d[key]
      await fse.writeJSON(cacheFile(), d)
      return true
    } catch {
      return false
    }
  },
}
