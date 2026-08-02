import { app, safeStorage, session, webContents, type Session } from 'electron'
import { open, readdir, rename } from 'fs/promises'
import { dirname, join } from 'path'
import fse from 'fs-extra'

const SOURCE_ID_PATTERN = /^src-[a-zA-Z0-9_-]{1,120}$/

function validSourceId(sourceId: string): string {
  if (!SOURCE_ID_PATTERN.test(sourceId)) throw new Error('无效的书源 ID')
  return sourceId
}

/** 每个书源独立持久会话，避免不同书源之间串 Cookie。 */
export const sourcePartition = (sourceId: string): string => `persist:openread-source-${validSourceId(sourceId)}`

/** 不可信代码使用独立非持久分区；其原生网络会在主进程中全部禁用。 */
export const sourceRuntimePartition = (sourceId: string): string => `openread-source-runtime-${validSourceId(sourceId)}`

function validHttpUrl(value: string): URL {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只允许 http/https 地址')
  return url
}

const cookieHeader = (cookies: Electron.Cookie[]) => cookies.map((c) => `${c.name}=${c.value}`).join('; ')

async function clearSessions(sessions: Session[]): Promise<void> {
  const targets = new Set(sessions)
  for (const contents of webContents.getAllWebContents()) {
    if (!contents.isDestroyed() && targets.has(contents.session)) {
      contents.close({ waitForBeforeUnload: false })
    }
  }
  await Promise.all(sessions.map((sourceSession) => sourceSession.closeAllConnections()))
  await Promise.all(sessions.flatMap((sourceSession) => [sourceSession.clearData(), sourceSession.clearAuthCache()]))
}

export async function clearSourcePartition(sourceId: string): Promise<void> {
  await clearSessions([
    session.fromPartition(sourcePartition(sourceId)),
    session.fromPartition(sourceRuntimePartition(sourceId)),
  ])
}

export async function clearLegacySourcePartitions(): Promise<void> {
  await clearSessions([
    session.fromPartition('persist:openread-source'),
    session.fromPartition('persist:openread-source-shared'),
  ])
}

export async function storedSourcePartitionIds(): Promise<string[]> {
  try {
    const entries = await readdir(join(app.getPath('userData'), 'Partitions'), { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('openread-source-src-'))
      .map((entry) => entry.name.slice('openread-source-'.length))
      .filter((sourceId) => SOURCE_ID_PATTERN.test(sourceId))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export const sourceCookies = {
  async get(sourceId: string, url: string): Promise<string> {
    const target = validHttpUrl(url)
    return cookieHeader(await session.fromPartition(sourcePartition(sourceId)).cookies.get({ url: target.href }))
  },

  async getOne(sourceId: string, url: string, name: string): Promise<string> {
    const target = validHttpUrl(url)
    const cookies = await session.fromPartition(sourcePartition(sourceId)).cookies.get({ url: target.href, name })
    return cookies[0]?.value ?? ''
  },

  async setHeader(sourceId: string, url: string, value: string): Promise<boolean> {
    const target = validHttpUrl(url)
    const jar = session.fromPartition(sourcePartition(sourceId)).cookies
    for (const token of value
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)) {
      const eq = token.indexOf('=')
      if (eq <= 0) continue
      await jar.set({
        url: target.href,
        name: token.slice(0, eq).trim(),
        value: token.slice(eq + 1).trim(),
        path: '/',
      })
    }
    return true
  },

  async setOne(sourceId: string, url: string, name: string, value: string): Promise<boolean> {
    const target = validHttpUrl(url)
    await session.fromPartition(sourcePartition(sourceId)).cookies.set({
      url: target.href,
      name,
      value,
      path: '/',
    })
    return true
  },

  async clearUrl(sourceId: string, url: string): Promise<boolean> {
    const target = validHttpUrl(url)
    const jar = session.fromPartition(sourcePartition(sourceId)).cookies
    const cookies = await jar.get({ url: target.href })
    await Promise.all(cookies.map((cookie) => jar.remove(target.href, cookie.name)))
    return true
  },

  async clearAll(sourceId: string): Promise<boolean> {
    await clearSourcePartition(sourceId)
    return true
  },
}

interface StoredAuth {
  encrypted: string
}

const authFile = () => join(app.getPath('userData'), 'source-auth.json')
const memoryAuth = new Map<string, string>()
let authMutation = Promise.resolve()

function persistentAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  return process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'
}

function mutateAuth<T>(operation: () => Promise<T>): Promise<T> {
  const pending = authMutation.then(operation, operation)
  authMutation = pending.then(
    () => undefined,
    () => undefined
  )
  return pending
}

async function readAll(): Promise<Record<string, StoredAuth>> {
  try {
    const data = await fse.readJSON(authFile())
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('书源凭据文件格式无效')
    for (const value of Object.values(data as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || typeof (value as StoredAuth).encrypted !== 'string') {
        throw new Error('书源凭据文件格式无效')
      }
    }
    return data as Record<string, StoredAuth>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

async function writeAll(data: Record<string, StoredAuth>): Promise<void> {
  const target = authFile()
  const temp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  await fse.ensureDir(app.getPath('userData'))
  try {
    await fse.writeJSON(temp, data, { spaces: 2 })
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

/** safeStorage 不可用或 Linux 仅 basic_text 时只保留在本次进程内，不把密码明文写盘。 */
export const sourceAuth = {
  available: persistentAvailable,

  async ids(): Promise<string[]> {
    await authMutation
    return [...new Set([...Object.keys(await readAll()), ...memoryAuth.keys()])].filter((sourceId) =>
      SOURCE_ID_PATTERN.test(sourceId)
    )
  },

  async get(sourceId: string): Promise<string> {
    validSourceId(sourceId)
    await authMutation
    if (memoryAuth.has(sourceId)) return memoryAuth.get(sourceId) ?? ''
    if (!persistentAvailable()) return ''
    const encoded = (await readAll())[sourceId]?.encrypted
    return encoded ? safeStorage.decryptString(Buffer.from(encoded, 'base64')) : ''
  },

  async set(sourceId: string, value: string): Promise<boolean> {
    validSourceId(sourceId)
    return mutateAuth(async () => {
      const all = await readAll()
      if (!persistentAvailable()) {
        if (sourceId in all) {
          delete all[sourceId]
          await writeAll(all)
        }
        memoryAuth.set(sourceId, value)
        return false
      }
      all[sourceId] = { encrypted: safeStorage.encryptString(value).toString('base64') }
      await writeAll(all)
      memoryAuth.set(sourceId, value)
      return true
    })
  },

  async clear(sourceId: string): Promise<boolean> {
    validSourceId(sourceId)
    return mutateAuth(async () => {
      const all = await readAll()
      if (sourceId in all) {
        delete all[sourceId]
        await writeAll(all)
      }
      memoryAuth.delete(sourceId)
      return true
    })
  },
}
