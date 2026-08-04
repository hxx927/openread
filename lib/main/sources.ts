import { app, session, type Session } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { open, rename } from 'fs/promises'
import { request as httpNodeRequest } from 'http'
import { request as httpsNodeRequest } from 'https'
import { isIP, type LookupFunction } from 'net'
import { dirname, join } from 'path'
import { brotliDecompress, gunzip, inflate } from 'zlib'
import fse from 'fs-extra'
import { sourcePartition } from './source-session'

/**
 * 网络书源(qysg / 轻悦时光 风格):
 * 书源本身是一段 JS,实现 search/info/chapter/content/getfinds/find/login 等函数;
 * 本模块负责书源存储与每源隔离的 HTTP 代理。
 */

export interface BookSource {
  id: string
  name: string
  enabled: boolean
  code: string
  kind: 'js' | 'html'
  addedAt: number
}

export type SourcePatch = Partial<Pick<BookSource, 'name' | 'enabled' | 'code' | 'kind'>>
export type SourceMove = 'top' | 'bottom' | 'up' | 'down'

const MAX_SOURCE_CODE_BYTES = 4 * 1024 * 1024

function assertSourceCodeSize(code: string): void {
  if (Buffer.byteLength(code) > MAX_SOURCE_CODE_BYTES) throw new Error('书源代码不能超过 4 MiB')
}

/** 解析导入内容:纯 JS、或轻悦时光 JSON(html 字段装整页 HTML)。 */
export function parseSourceFile(
  text: string,
  fallbackName?: string
): { name: string; code: string; kind: 'js' | 'html' }[] {
  assertSourceCodeSize(text)
  const raw = text.trim()
  if (!raw) throw new Error('内容为空')

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
          assertSourceCodeSize(it.html)
          out.push({ name, code: it.html, kind: 'html' })
        } else if (typeof it.js === 'string' && it.js.trim()) {
          assertSourceCodeSize(it.js)
          out.push({ name, code: it.js, kind: 'js' })
        }
      }
      if (out.length) return out
      throw new Error('这是 JSON 规则书源(阅读 / Legado 格式),当前只支持 JS 与轻悦时光书源(html 字段)')
    }
  }

  // 兼容 function search() 与 const search = async () => 两种写法。
  if (!/(?:function\s+(?:search|content|chapter)|(?:const|let|var)\s+(?:search|content|chapter)\s*=)/.test(raw)) {
    throw new Error('未找到 search / chapter / content 函数,可能不是 JS 书源')
  }
  assertSourceCodeSize(raw)
  return [{ name: fallbackName || guessName(raw), code: raw, kind: 'js' }]
}

const file = () => join(app.getPath('userData'), 'sources.json')
const SOURCE_ID_PATTERN = /^src-[a-zA-Z0-9_-]{1,120}$/
const identityHash = (kind: BookSource['kind'], code: string) =>
  createHash('sha256').update(`${kind}\0${code.trim()}`).digest('hex')

function validateStoredSources(data: unknown): BookSource[] {
  if (!Array.isArray(data)) throw new Error('书源文件格式无效')
  const ids = new Set<string>()
  for (const value of data) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('书源文件格式无效')
    const source = value as Partial<BookSource>
    if (
      typeof source.id !== 'string' ||
      !SOURCE_ID_PATTERN.test(source.id) ||
      ids.has(source.id) ||
      typeof source.name !== 'string' ||
      typeof source.enabled !== 'boolean' ||
      typeof source.code !== 'string' ||
      Buffer.byteLength(source.code) > MAX_SOURCE_CODE_BYTES ||
      !['js', 'html'].includes(source.kind ?? '') ||
      typeof source.addedAt !== 'number' ||
      !Number.isFinite(source.addedAt)
    ) {
      throw new Error('书源文件格式无效')
    }
    ids.add(source.id)
  }
  return data as BookSource[]
}

let sourceMutation = Promise.resolve()
function mutateSources<T>(operation: () => Promise<T>): Promise<T> {
  const pending = sourceMutation.then(operation, operation)
  sourceMutation = pending.then(
    () => undefined,
    () => undefined
  )
  return pending
}

async function readAll(): Promise<BookSource[]> {
  try {
    return validateStoredSources(await fse.readJSON(file()))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

async function writeJsonAtomic(target: string, value: unknown, options?: { spaces?: number }): Promise<void> {
  const temp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  await fse.ensureDir(dirname(target))
  try {
    await fse.writeJSON(temp, value, options)
    const tempHandle = await open(temp, 'r+')
    try {
      await tempHandle.sync()
    } finally {
      await tempHandle.close()
    }
    await rename(temp, target)
    const directoryHandle = await open(dirname(target), 'r').catch(() => null)
    try {
      await directoryHandle?.sync().catch(() => {})
    } finally {
      await directoryHandle?.close().catch(() => {})
    }
  } finally {
    await fse.remove(temp).catch(() => {})
  }
}

async function writeAll(list: BookSource[]): Promise<void> {
  await writeJsonAtomic(file(), list, { spaces: 2 })
}

function guessName(code: string): string {
  const at = code.match(/\/\/\s*@name\s+(.+)/)
  if (at) return at[1].trim()
  const value = code.match(/(?:var|let|const)\s+name\s*=\s*['"](.+?)['"]/)
  return value?.[1]?.trim() || '未命名书源'
}

export const sources = {
  async list(): Promise<BookSource[]> {
    await sourceMutation
    return readAll()
  },

  /** 仅代码完全相同时视为同一书源；显示名称不作为身份，避免继承其他书源的登录会话。 */
  async add(text: string, name?: string): Promise<BookSource[]> {
    const parsed = parseSourceFile(text, name)
    return mutateSources(async () => {
      const list = await readAll()
      const changed: BookSource[] = []
      for (const item of parsed) {
        const hash = identityHash(item.kind, item.code)
        const existing = list.find((source) => identityHash(source.kind, source.code) === hash)
        if (existing) {
          existing.name = item.name.slice(0, 60)
          changed.push(existing)
        } else {
          const source: BookSource = {
            id: `src-${randomUUID()}`,
            name: item.name.slice(0, 60),
            enabled: true,
            code: item.code,
            kind: item.kind,
            addedAt: Date.now(),
          }
          list.unshift(source)
          changed.push(source)
        }
      }
      await writeAll(list)
      return changed
    })
  },

  async addFromUrl(url: string): Promise<BookSource[]> {
    const target = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
    const response = await httpRequest({ url: target, headers: { 'User-Agent': 'OpenRead/1.0' } })
    if (response.statusCode >= 400) throw new Error(`下载失败(HTTP ${response.statusCode})`)
    const text = response.data?.trim() ?? ''
    if (!text) throw new Error('链接内容为空')
    const hasName = /\/\/\s*@name\s+\S/.test(text)
    const fileName = decodeURIComponent(target.split('/').pop() || '').replace(/\.(js|txt|json)$/i, '')
    return this.add(text, hasName ? undefined : fileName || undefined)
  },

  async update(id: string, patch: SourcePatch): Promise<BookSource | null> {
    return mutateSources(async () => {
      const list = await readAll()
      const source = list.find((item) => item.id === id)
      if (!source) return null

      const previousIdentity = identityHash(source.kind, source.code)
      let nextCode = source.code
      let nextKind = source.kind
      if (patch.code !== undefined) {
        assertSourceCodeSize(patch.code)
        const requestedKind = patch.kind ?? source.kind
        if (requestedKind === 'html') {
          if (!/<script\b/i.test(patch.code)) throw new Error('轻悦书源 HTML 中没有找到 script')
          nextCode = patch.code
          nextKind = 'html'
        } else {
          const parsed = parseSourceFile(patch.code, patch.name || source.name)[0]
          nextCode = parsed.code
          nextKind = patch.kind ?? parsed.kind
        }
      } else if (patch.kind !== undefined) {
        if (patch.kind === 'html') {
          if (!/<script\b/i.test(source.code)) throw new Error('轻悦书源 HTML 中没有找到 script')
        } else {
          parseSourceFile(source.code, patch.name || source.name)
        }
        nextKind = patch.kind
      }

      const nextIdentity = identityHash(nextKind, nextCode)
      if (nextIdentity !== previousIdentity) {
        if (list.some((item) => item.id !== id && identityHash(item.kind, item.code) === nextIdentity)) {
          throw new Error('已有代码及类型完全相同的书源')
        }
        source.id = `src-${randomUUID()}`
        source.addedAt = Date.now()
      }
      source.code = nextCode
      source.kind = nextKind
      if (patch.name !== undefined) source.name = patch.name.trim().slice(0, 60) || source.name
      if (patch.enabled !== undefined) source.enabled = patch.enabled
      await writeAll(list)
      return source
    })
  },

  async move(id: string, direction: SourceMove): Promise<boolean> {
    return mutateSources(async () => {
      const list = await readAll()
      const index = list.findIndex((source) => source.id === id)
      if (index < 0) return false
      let target = index
      if (direction === 'top') target = 0
      else if (direction === 'bottom') target = list.length - 1
      else if (direction === 'up') target = Math.max(0, index - 1)
      else if (direction === 'down') target = Math.min(list.length - 1, index + 1)
      if (target !== index) list.splice(target, 0, list.splice(index, 1)[0])
      await writeAll(list)
      return true
    })
  },

  async remove(id: string): Promise<boolean> {
    return mutateSources(async () => {
      const list = await readAll()
      const next = list.filter((source) => source.id !== id)
      if (next.length === list.length) return false
      await writeAll(next)
      return true
    })
  },

  async toggle(id: string, enabled: boolean): Promise<boolean> {
    return Boolean(await this.update(id, { enabled }))
  },
}

/* ---------------- HTTP 代理 ---------------- */

const MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024
const MAX_RESPONSE_BODY_BYTES = 32 * 1024 * 1024
const MAX_HEADER_BYTES = 64 * 1024
const MAX_DOH_RESPONSE_BYTES = 64 * 1024
const REQUEST_TIMEOUT_MS = 30_000
const DNS_VERIFIER_PARTITION = 'openread-dns-verifier'
const DOH_ENDPOINTS = ['https://dns.google/resolve', 'https://cloudflare-dns.com/dns-query']
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])
const CROSS_ORIGIN_SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization'])

export interface HttpReq {
  sourceId?: string
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  followRedirects?: boolean
  redirectCount?: number
}

export interface HttpRes {
  statusCode: number
  headers: Record<string, string>
  body: string
  data: string
  url: string
}

interface PublicHttpTarget {
  target: URL
  lookup: LookupFunction
}

interface NodeHttpResult {
  statusCode: number
  headers: Record<string, string>
  setCookies: string[]
  bytes: Buffer
}

interface ResolvedAddress {
  address: string
  family: number
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('书源请求已取消')
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortReason(signal))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(abortReason(signal))
    }
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
    void promise.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error) => {
        cleanup()
        reject(error)
      }
    )
  })
}

async function withRequestTimeout<T>(
  parentSignal: AbortSignal | undefined,
  operation: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  parentSignal?.throwIfAborted()
  const controller = new AbortController()
  const relayAbort = () => controller.abort(parentSignal?.reason)
  parentSignal?.addEventListener('abort', relayAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new Error('书源网络请求超时')), REQUEST_TIMEOUT_MS)
  try {
    return await operation(controller.signal)
  } finally {
    clearTimeout(timer)
    parentSignal?.removeEventListener('abort', relayAbort)
  }
}

function detectCharset(contentType: string, bytes: Uint8Array): string {
  const match = /charset=["']?([\w-]+)/i.exec(contentType)
  if (match) return match[1].toLowerCase()
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048))
  return /charset=["']?([\w-]+)/i.exec(head)?.[1]?.toLowerCase() || 'utf-8'
}

function decode(bytes: Uint8Array, charset: string): string {
  const normalized = charset === 'gb2312' || charset === 'gbk' ? 'gb18030' : charset
  try {
    return new TextDecoder(normalized).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

function privateAddress(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0]
  const family = isIP(normalized)
  if (family === 4) {
    const [a, b, c] = normalized.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      (a === 100 && b >= 64 && b <= 127) ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    )
  }
  if (family === 6) {
    if (normalized === '::' || normalized === '::1') return true
    if (normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89abcdef]/.test(normalized)) return true
    if (normalized.startsWith('ff')) return true
    if (normalized.startsWith('2001:db8:')) return true
    if (normalized.startsWith('::ffff:')) {
      const suffix = normalized.slice(7)
      if (isIP(suffix) === 4) return privateAddress(suffix)
      const parts = suffix.split(':')
      if (parts.length === 2 && parts.every((part) => /^[0-9a-f]{1,4}$/.test(part))) {
        const high = Number.parseInt(parts[0], 16)
        const low = Number.parseInt(parts[1], 16)
        return privateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)
      }
    }
    return false
  }
  return false
}

function proxyFakeAddress(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0]
  if (isIP(normalized) !== 4) return false
  const [a, b] = normalized.split('.').map(Number)
  return a === 198 && (b === 18 || b === 19)
}

function hasProxyRoute(value: string): boolean {
  return value
    .split(';')
    .map((rule) => rule.trim())
    .some((rule) => /^(?:proxy|https|socks4?|socks5|quic)\s+\S+/i.test(rule))
}

async function limitedFetchBytes(response: Response, signal: AbortSignal): Promise<Buffer> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DOH_RESPONSE_BYTES) {
    throw new Error('公网 DNS 响应过大')
  }
  const reader = response.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  const chunks: Buffer[] = []
  let size = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await abortable(reader.read(), signal)
      if (done) break
      if (!value) continue
      size += value.byteLength
      if (size > MAX_DOH_RESPONSE_BYTES) throw new Error('公网 DNS 响应过大')
      chunks.push(Buffer.from(value))
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  }
  return Buffer.concat(chunks)
}

function parseDohAddresses(value: unknown): ResolvedAddress[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const response = value as { Status?: unknown; Answer?: unknown }
  if (response.Status !== 0 || !Array.isArray(response.Answer)) return []
  const addresses: ResolvedAddress[] = []
  for (const answer of response.Answer) {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) continue
    const record = answer as { type?: unknown; data?: unknown }
    if (![1, 28].includes(Number(record.type)) || typeof record.data !== 'string') continue
    const family = isIP(record.data)
    if ((Number(record.type) === 1 && family === 4) || (Number(record.type) === 28 && family === 6)) {
      addresses.push({ address: record.data, family })
    }
  }
  return addresses
}

async function queryDoh(
  sourceSession: Session,
  endpoint: string,
  hostname: string,
  type: 'A' | 'AAAA',
  signal: AbortSignal
): Promise<ResolvedAddress[]> {
  const url = new URL(endpoint)
  url.searchParams.set('name', hostname)
  url.searchParams.set('type', type)
  const response = await abortable(
    sourceSession.fetch(url.href, {
      method: 'GET',
      headers: {
        Accept: 'application/dns-json',
        'User-Agent': 'OpenRead/0.7.0 DNS verifier',
      },
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      signal,
      bypassCustomProtocolHandlers: true,
    }),
    signal
  )
  if (!response.ok) throw new Error(`公网 DNS 请求失败(HTTP ${response.status})`)
  let value: unknown
  try {
    value = JSON.parse((await limitedFetchBytes(response, signal)).toString('utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('公网 DNS 返回了无效数据')
    throw error
  }
  return parseDohAddresses(value)
}

async function resolveProxyFakeHost(hostname: string, signal: AbortSignal): Promise<ResolvedAddress[]> {
  // 不复用书源 Session，避免登录窗口的全量 webRequest 守卫递归拦截 DoH 核验请求。
  const verifierSession = session.fromPartition(DNS_VERIFIER_PARTITION)
  let lastError: unknown
  for (const endpoint of DOH_ENDPOINTS) {
    try {
      const [ipv4, ipv6] = await Promise.all([
        queryDoh(verifierSession, endpoint, hostname, 'A', signal),
        queryDoh(verifierSession, endpoint, hostname, 'AAAA', signal),
      ])
      const addresses = [...ipv4, ...ipv6]
      if (!addresses.length) continue
      if (addresses.some(({ address, family }) => family === 0 || privateAddress(address))) {
        throw new Error('书源域名的公网 DNS 结果包含本机或私有地址')
      }
      return addresses
    } catch (error) {
      signal.throwIfAborted()
      if ((error as Error).message.includes('包含本机或私有地址')) throw error
      lastError = error
    }
  }
  const detail = lastError instanceof Error ? `: ${lastError.message}` : ''
  throw new Error(`书源域名解析为代理 fake-IP，无法验证真实公网地址${detail}`)
}

async function publicHttpTarget(value: string, partition: string, signal?: AbortSignal): Promise<PublicHttpTarget> {
  if (value.length > 8_192) throw new Error('书源请求地址过长')
  const target = new URL(value)
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('书源请求只允许 http/https 地址')
  const hostname = target.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('书源请求不允许访问本机或私有网络')
  }

  const sourceSession = session.fromPartition(partition)
  const activeSignal = signal ?? new AbortController().signal
  const literalFamily = isIP(hostname)
  let addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : (await abortable(sourceSession.resolveHost(hostname, { cacheUsage: 'disallowed' }), activeSignal)).endpoints.map(
        ({ address }) => ({ address, family: isIP(address) })
      )

  if (!literalFamily && addresses.length && addresses.every(({ address }) => proxyFakeAddress(address))) {
    const proxy = await abortable(sourceSession.resolveProxy(target.href), activeSignal)
    if (hasProxyRoute(proxy)) addresses = await resolveProxyFakeHost(hostname, activeSignal)
  }
  if (!addresses.length || addresses.some(({ address, family }) => family === 0 || privateAddress(address))) {
    throw new Error('书源请求不允许访问本机或私有网络')
  }

  const lookup: LookupFunction = (_hostname, options, callback) => {
    const matching = options.family ? addresses.filter(({ family }) => family === options.family) : addresses
    if (!matching.length) {
      const error = Object.assign(new Error('书源域名没有可用的公网地址'), { code: 'ENOTFOUND' })
      callback(error, '', 0)
    } else if (options.all) {
      callback(null, matching)
    } else {
      callback(null, matching[0].address, matching[0].family)
    }
  }
  return { target, lookup }
}

export async function assertPublicHttpUrl(value: string, partition: string): Promise<string> {
  return withRequestTimeout(undefined, async (signal) => (await publicHttpTarget(value, partition, signal)).target.href)
}

function requestHeaders(input: Record<string, string> | undefined): Record<string, string> {
  const headers: Record<string, string> = {}
  let bytes = 0
  for (const [name, value] of Object.entries(input ?? {})) {
    const normalized = name.trim().toLowerCase()
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(normalized) || /[\r\n]/.test(value)) {
      throw new Error('书源请求头无效')
    }
    if (HOP_BY_HOP_HEADERS.has(normalized)) continue
    bytes += Buffer.byteLength(normalized) + Buffer.byteLength(value) + 4
    if (bytes > MAX_HEADER_BYTES) throw new Error('书源请求头过大')
    headers[normalized] = value
  }
  headers['accept-encoding'] = 'gzip, deflate, br'
  return headers
}

function withoutHeaders(headers: Record<string, string> | undefined, names: Set<string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers ?? {}).filter(([name]) => !names.has(name.toLowerCase())))
}

function parseSetCookie(url: URL, value: string): Electron.CookiesSetDetails | null {
  const [pair, ...attributes] = value.split(';')
  const separator = pair.indexOf('=')
  if (separator <= 0) return null
  const details: Electron.CookiesSetDetails = {
    url: url.href,
    name: pair.slice(0, separator).trim(),
    value: pair.slice(separator + 1).trim(),
  }
  let expiresAt: number | undefined
  let maxAgeExpiresAt: number | undefined
  for (const rawAttribute of attributes) {
    const attributeSeparator = rawAttribute.indexOf('=')
    const name = (attributeSeparator < 0 ? rawAttribute : rawAttribute.slice(0, attributeSeparator))
      .trim()
      .toLowerCase()
    const attributeValue = attributeSeparator < 0 ? '' : rawAttribute.slice(attributeSeparator + 1).trim()
    if (name === 'domain' && attributeValue) details.domain = attributeValue
    else if (name === 'path' && attributeValue) details.path = attributeValue
    else if (name === 'secure') details.secure = true
    else if (name === 'httponly') details.httpOnly = true
    else if (name === 'expires') {
      const expires = Date.parse(attributeValue)
      if (Number.isFinite(expires)) expiresAt = expires / 1_000
    } else if (name === 'max-age' && /^-?\d+$/.test(attributeValue)) {
      const seconds = Number(attributeValue)
      if (Number.isFinite(seconds)) maxAgeExpiresAt = Date.now() / 1_000 + seconds
    } else if (name === 'samesite') {
      const sameSite = attributeValue.toLowerCase()
      if (sameSite === 'none') details.sameSite = 'no_restriction'
      else if (sameSite === 'lax' || sameSite === 'strict') details.sameSite = sameSite
    }
  }
  details.expirationDate = maxAgeExpiresAt ?? expiresAt
  return details
}

async function decompress(bytes: Buffer, encoding: string): Promise<Buffer> {
  const normalized = encoding.trim().toLowerCase()
  if (!normalized || normalized === 'identity') return bytes
  return new Promise((resolve, reject) => {
    const done = (error: Error | null, result: Buffer) => (error ? reject(error) : resolve(result))
    const options = { maxOutputLength: MAX_RESPONSE_BODY_BYTES }
    if (normalized === 'gzip' || normalized === 'x-gzip') gunzip(bytes, options, done)
    else if (normalized === 'deflate') inflate(bytes, options, done)
    else if (normalized === 'br') brotliDecompress(bytes, options, done)
    else reject(new Error(`书源响应使用了不支持的压缩格式: ${normalized}`))
  })
}

async function nodeHttpRequest(
  target: URL,
  lookup: LookupFunction,
  headers: Record<string, string>,
  method: string,
  body: string | undefined,
  signal?: AbortSignal
): Promise<NodeHttpResult> {
  const bodyBytes = body === undefined ? undefined : Buffer.from(body)
  if (bodyBytes && bodyBytes.byteLength > MAX_REQUEST_BODY_BYTES) throw new Error('书源请求体过大')

  return new Promise((resolve, reject) => {
    const transport = target.protocol === 'https:' ? httpsNodeRequest : httpNodeRequest
    const request = transport(target, { method, headers, lookup, signal }, (response) => {
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.byteLength
        if (size > MAX_RESPONSE_BODY_BYTES) {
          request.destroy(new Error('书源响应体过大'))
          return
        }
        chunks.push(chunk)
      })
      response.on('error', reject)
      response.on('end', async () => {
        try {
          const responseHeaders: Record<string, string> = {}
          for (const [name, value] of Object.entries(response.headers)) {
            if (value !== undefined) responseHeaders[name] = Array.isArray(value) ? value.join(', ') : String(value)
          }
          const bytes = await decompress(Buffer.concat(chunks), responseHeaders['content-encoding'] || '')
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: responseHeaders,
            setCookies: response.headers['set-cookie'] ?? [],
            bytes,
          })
        } catch (error) {
          reject(error)
        }
      })
    })
    request.on('error', reject)
    request.end(bodyBytes)
  })
}

/** 固定已验证的公网地址建立连接，并显式同步该书源 partition 的 Cookie。 */
async function performHttpRequest(req: HttpReq, signal: AbortSignal): Promise<HttpRes> {
  signal.throwIfAborted()
  const partition = req.sourceId ? sourcePartition(req.sourceId) : 'openread-source-download'
  const sourceSession = session.fromPartition(partition)
  const { target, lookup } = await publicHttpTarget(req.url, partition, signal)
  signal.throwIfAborted()

  const method = (req.method || 'GET').toUpperCase()
  if (!/^[A-Z]+$/.test(method) || method === 'CONNECT' || method === 'TRACE') {
    throw new Error('书源请求方法无效')
  }
  const headers = requestHeaders(req.headers)
  if (!headers.cookie) {
    const cookies = await abortable(sourceSession.cookies.get({ url: target.href }), signal)
    if (cookies.length) headers.cookie = cookies.map(({ name, value }) => `${name}=${value}`).join('; ')
  }

  const response = await nodeHttpRequest(target, lookup, headers, method, req.body, signal)
  signal.throwIfAborted()
  await Promise.all(
    response.setCookies.map(async (value) => {
      const details = parseSetCookie(target, value)
      if (details) await sourceSession.cookies.set(details).catch(() => {})
    })
  )
  signal.throwIfAborted()

  if (REDIRECT_STATUSES.has(response.statusCode) && req.followRedirects !== false) {
    const location = response.headers.location
    if (!location) throw new Error(`书源重定向缺少 Location(HTTP ${response.statusCode})`)
    const redirectCount = req.redirectCount ?? 0
    if (redirectCount >= 10) throw new Error('书源重定向次数过多')
    const redirected = new URL(location, target).href
    const redirectedOrigin = new URL(redirected).origin
    let nextHeaders = req.headers
    if (redirectedOrigin !== target.origin) {
      nextHeaders = withoutHeaders(nextHeaders, CROSS_ORIGIN_SENSITIVE_HEADERS)
    }
    const switchToGet =
      (response.statusCode === 303 && method !== 'GET' && method !== 'HEAD') ||
      ((response.statusCode === 301 || response.statusCode === 302) && method === 'POST')
    if (switchToGet) {
      nextHeaders = withoutHeaders(
        nextHeaders,
        new Set(['content-encoding', 'content-language', 'content-location', 'content-type'])
      )
    }
    return performHttpRequest(
      {
        ...req,
        url: redirected,
        headers: nextHeaders,
        method: switchToGet ? 'GET' : method,
        body: switchToGet ? undefined : req.body,
        redirectCount: redirectCount + 1,
      },
      signal
    )
  }

  return {
    statusCode: response.statusCode,
    headers: response.headers,
    body: response.bytes.toString('base64'),
    data: decode(response.bytes, detectCharset(response.headers['content-type'] || '', response.bytes)),
    url: target.href,
  }
}

export function httpRequest(req: HttpReq, signal?: AbortSignal): Promise<HttpRes> {
  return withRequestTimeout(signal, (timedSignal) => performHttpRequest(req, timedSignal))
}

/* ---------------- 书源可用的键值缓存 ---------------- */

const cacheFile = () => join(app.getPath('userData'), 'source-cache.json')
const MAX_CACHE_KEY_BYTES = 8_192
const MAX_CACHE_VALUE_BYTES = 8 * 1024 * 1024
const MAX_CACHE_ENTRIES = 10_000
const MAX_CACHE_BYTES = 64 * 1024 * 1024
const MAX_SOURCE_CACHE_BYTES = 16 * 1024 * 1024
let cacheMutation = Promise.resolve()

function assertCacheEntrySize(key: string, value: string): void {
  if (Buffer.byteLength(key) > MAX_CACHE_KEY_BYTES) throw new Error('书源缓存键过长')
  if (Buffer.byteLength(value) > MAX_CACHE_VALUE_BYTES) throw new Error('书源缓存值过大')
}

function mutateCache<T>(operation: () => Promise<T>): Promise<T> {
  const pending = cacheMutation.then(operation, operation)
  cacheMutation = pending.then(
    () => undefined,
    () => undefined
  )
  return pending
}

async function readCache(): Promise<Record<string, string>> {
  try {
    const data = await fse.readJSON(cacheFile())
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('书源缓存文件格式无效')
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (
        typeof value !== 'string' ||
        Buffer.byteLength(key) > MAX_CACHE_KEY_BYTES ||
        Buffer.byteLength(value) > MAX_CACHE_VALUE_BYTES
      ) {
        throw new Error('书源缓存文件格式无效')
      }
    }
    return data as Record<string, string>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

function cacheBytes(data: Record<string, string>, prefix?: string): number {
  return Object.entries(data).reduce(
    (size, [key, value]) =>
      prefix && !key.startsWith(prefix) ? size : size + Buffer.byteLength(key) + Buffer.byteLength(value),
    0
  )
}

function assertCacheQuota(data: Record<string, string>, key: string): void {
  if (Object.keys(data).length > MAX_CACHE_ENTRIES || cacheBytes(data) > MAX_CACHE_BYTES) {
    throw new Error('书源缓存空间已满')
  }
  const separator = key.indexOf(':')
  if (separator > 0 && cacheBytes(data, `${key.slice(0, separator)}:`) > MAX_SOURCE_CACHE_BYTES) {
    throw new Error('该书源缓存空间已满')
  }
}

export const sourceCache = {
  async get(key: string): Promise<string | null> {
    await cacheMutation
    const data = await readCache()
    return typeof data[key] === 'string' ? data[key] : null
  },
  async set(key: string, value: string): Promise<boolean> {
    assertCacheEntrySize(key, value)
    return mutateCache(async () => {
      const data = await readCache()
      data[key] = value
      assertCacheQuota(data, key)
      await writeJsonAtomic(cacheFile(), data)
      return true
    })
  },
  async remove(key: string): Promise<boolean> {
    return mutateCache(async () => {
      const data = await readCache()
      if (!(key in data)) return false
      delete data[key]
      await writeJsonAtomic(cacheFile(), data)
      return true
    })
  },
  async removePrefix(prefix: string): Promise<boolean> {
    return mutateCache(async () => {
      const data = await readCache()
      let changed = false
      for (const key of Object.keys(data)) {
        if (!key.startsWith(prefix)) continue
        delete data[key]
        changed = true
      }
      if (changed) await writeJsonAtomic(cacheFile(), data)
      return changed
    })
  },

  async sourceIds(): Promise<string[]> {
    await cacheMutation
    const data = await readCache()
    return [
      ...new Set(
        Object.keys(data)
          .map((key) => /^((?:src-)[a-zA-Z0-9_-]{1,120}):/.exec(key)?.[1])
          .filter((sourceId): sourceId is string => Boolean(sourceId))
      ),
    ]
  },

  async removeLegacySensitive(): Promise<boolean> {
    return mutateCache(async () => {
      const data = await readCache()
      let changed = false
      for (const key of Object.keys(data)) {
        if (
          key === 'LoginInfo' ||
          key.startsWith('cookie:') ||
          key.endsWith(':LoginInfo') ||
          /^src-[^:]+:cookie:/.test(key)
        ) {
          delete data[key]
          changed = true
        }
      }
      if (changed) await writeJsonAtomic(cacheFile(), data)
      return changed
    })
  },
}
