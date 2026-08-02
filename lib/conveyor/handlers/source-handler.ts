import { BrowserWindow, dialog, session, type WebContents } from 'electron'
import { readFile } from 'fs/promises'
import { basename, join } from 'path'
import { pathToFileURL } from 'url'
import { handle } from '@/lib/main/shared'
import {
  assertPublicHttpUrl,
  sources,
  httpRequest,
  sourceCache,
  type HttpReq,
  type HttpRes,
  type SourceMove,
  type SourcePatch,
} from '@/lib/main/sources'
import {
  clearLegacySourcePartitions,
  sourceAuth,
  sourceCookies,
  sourcePartition,
  storedSourcePartitionIds,
} from '@/lib/main/source-session'

const loginWindows = new Map<string, BrowserWindow>()
const revokedSourceIds = new Set<string>()
const pendingSourceCleanup = new Set<string>()
const pendingSessionReset = new Set<string>()
const hardenedLoginPartitions = new Set<string>()

interface ActiveSourceRequest {
  controller: AbortController
  done: Promise<void>
}

interface ActiveSourceOperation {
  done: Promise<void>
  finish: () => void
}

const MAX_SOURCE_REQUESTS = 8
const MAX_GLOBAL_REQUESTS = 64
const MAX_SOURCE_OPERATIONS = 64
const activeSourceRequests = new Map<string, Set<ActiveSourceRequest>>()
const activeSourceOperations = new Map<string, Set<ActiveSourceOperation>>()
let sourceStartupCleanup: Promise<void> | null = null

async function assertActiveSource(sourceId: string): Promise<void> {
  await sourceStartupCleanup
  if (revokedSourceIds.has(sourceId)) throw new Error('书源不存在或会话已撤销')
  const exists = (await sources.list()).some((source) => source.id === sourceId)
  if (revokedSourceIds.has(sourceId) || !exists) throw new Error('书源不存在或会话已撤销')
}

function trackSourceOperation(sourceId: string): ActiveSourceOperation {
  let finish!: () => void
  const tracked: ActiveSourceOperation = {
    done: new Promise<void>((resolve) => {
      finish = resolve
    }),
    finish: () => finish(),
  }
  const operations = activeSourceOperations.get(sourceId) ?? new Set<ActiveSourceOperation>()
  operations.add(tracked)
  activeSourceOperations.set(sourceId, operations)
  return tracked
}

function finishSourceOperation(sourceId: string, tracked: ActiveSourceOperation): void {
  const operations = activeSourceOperations.get(sourceId)
  operations?.delete(tracked)
  if (!operations?.size) activeSourceOperations.delete(sourceId)
  tracked.finish()
}

async function runActiveSourceOperation<T>(sourceId: string, operation: () => Promise<T>): Promise<T> {
  // 启动清理本身会等待孤儿身份的活动操作；先等待它结束，避免 stale IPC 与清理互相等待。
  await sourceStartupCleanup
  if ((activeSourceOperations.get(sourceId)?.size ?? 0) >= MAX_SOURCE_OPERATIONS) {
    throw new Error('该书源并发操作过多')
  }
  const tracked = trackSourceOperation(sourceId)
  try {
    if (revokedSourceIds.has(sourceId)) throw new Error('书源不存在或会话已撤销')
    await assertActiveSource(sourceId)
    return await operation()
  } finally {
    finishSourceOperation(sourceId, tracked)
  }
}

async function waitForSourceOperations(sourceId: string): Promise<void> {
  const operations = [...(activeSourceOperations.get(sourceId) ?? [])]
  await Promise.all(operations.map((operation) => operation.done))
}

function coverMime(response: HttpRes): string {
  const declared = (response.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'].includes(declared)) {
    return declared
  }
  const head = Buffer.from(response.body.slice(0, 64), 'base64')
  if (head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg'
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (head.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif'
  if (head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp'
  }
  if (head.subarray(4, 8).toString('ascii') === 'ftyp') return 'image/avif'
  throw new Error('封面响应不是支持的图片格式')
}

function sourceIdFromCacheKey(key: string): string {
  const separator = key.indexOf(':')
  const sourceId = separator > 0 ? key.slice(0, separator) : ''
  if (!/^src-[a-zA-Z0-9_-]{1,120}$/.test(sourceId)) throw new Error('无效的书源缓存键')
  return sourceId
}

async function runSourceRequest(req: HttpReq): Promise<HttpRes> {
  if (!req.sourceId) throw new Error('书源请求缺少书源 ID')
  await sourceStartupCleanup

  const requests = activeSourceRequests.get(req.sourceId) ?? new Set<ActiveSourceRequest>()
  const globalRequestCount = [...activeSourceRequests.values()].reduce((total, active) => total + active.size, 0)
  if (requests.size >= MAX_SOURCE_REQUESTS) throw new Error('该书源并发网络请求过多')
  if (globalRequestCount >= MAX_GLOBAL_REQUESTS) throw new Error('书源网络请求总并发过多')

  const controller = new AbortController()
  let finish!: () => void
  const tracked: ActiveSourceRequest = {
    controller,
    done: new Promise<void>((resolve) => {
      finish = resolve
    }),
  }
  requests.add(tracked)
  activeSourceRequests.set(req.sourceId, requests)
  try {
    if (revokedSourceIds.has(req.sourceId)) throw new Error('书源不存在或会话已撤销')
    await assertActiveSource(req.sourceId)
    return await httpRequest(req, controller.signal)
  } finally {
    requests.delete(tracked)
    if (!requests.size) activeSourceRequests.delete(req.sourceId)
    finish()
  }
}

async function cancelSourceRequests(sourceId: string): Promise<void> {
  const requests = [...(activeSourceRequests.get(sourceId) ?? [])]
  for (const request of requests) request.controller.abort()
  await Promise.all(requests.map((request) => request.done))
}

async function clearSourceData(sourceId: string): Promise<void> {
  const loginWindow = loginWindows.get(sourceId)
  if (loginWindow && !loginWindow.isDestroyed()) loginWindow.destroy()
  loginWindows.delete(sourceId)
  await cancelSourceRequests(sourceId)
  await waitForSourceOperations(sourceId)
  const results = await Promise.allSettled([
    sourceCookies.clearAll(sourceId),
    sourceAuth.clear(sourceId),
    sourceCache.removePrefix(`${sourceId}:`),
  ])
  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failure) throw failure.reason
}

async function retryPendingSourceCleanup(): Promise<void> {
  for (const sourceId of [...pendingSourceCleanup]) {
    try {
      await clearSourceData(sourceId)
      pendingSourceCleanup.delete(sourceId)
    } catch (error) {
      console.error(`书源 ${sourceId} 的旧会话重试清理失败:`, error)
    }
  }
  for (const sourceId of [...pendingSessionReset]) {
    try {
      await clearSourceData(sourceId)
      pendingSessionReset.delete(sourceId)
      revokedSourceIds.delete(sourceId)
    } catch (error) {
      console.error(`书源 ${sourceId} 的会话重置重试失败:`, error)
    }
  }
}

async function cleanupOrphanedSourceData(): Promise<void> {
  await Promise.all([clearLegacySourcePartitions(), sourceCache.removeLegacySensitive()])
  const activeIds = new Set((await sources.list()).map((source) => source.id))
  const storedIds = new Set(
    (await Promise.all([storedSourcePartitionIds(), sourceAuth.ids(), sourceCache.sourceIds()])).flat()
  )
  for (const sourceId of storedIds) {
    if (activeIds.has(sourceId)) continue
    revokedSourceIds.add(sourceId)
    pendingSourceCleanup.add(sourceId)
  }
  await retryPendingSourceCleanup()
}

function loginUrl(value: string, allowBlank = false): string {
  const url = new URL(value)
  if (allowBlank && url.href === 'about:blank') return url.href
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('登录窗口只允许 http/https 地址')
  return url.href
}

function hardenLoginSession(sourceId: string): void {
  const partition = sourcePartition(sourceId)
  if (hardenedLoginPartitions.has(partition)) return
  hardenedLoginPartitions.add(partition)
  const sourceSession = session.fromPartition(partition)
  sourceSession.setPermissionCheckHandler(() => false)
  sourceSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  sourceSession.setDevicePermissionHandler(() => false)
  sourceSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    let target = ''
    try {
      target = loginUrl(details.url)
    } catch {
      callback({ cancel: true })
      return
    }
    void assertPublicHttpUrl(target, partition).then(
      () => callback({ cancel: revokedSourceIds.has(sourceId) }),
      () => callback({ cancel: true })
    )
  })
}

function hardenLoginContents(contents: WebContents, sourceId: string): void {
  const guardNavigation = (details: Electron.Event<Electron.WebContentsWillFrameNavigateEventParams>) => {
    try {
      loginUrl(details.url, true)
    } catch {
      details.preventDefault()
    }
  }
  contents.on('will-frame-navigate', guardNavigation)
  contents.on('will-redirect', (details) => {
    try {
      loginUrl(details.url, true)
    } catch {
      details.preventDefault()
    }
  })
  contents.setWindowOpenHandler(({ url }) => {
    try {
      loginUrl(url, true)
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 900,
          height: 700,
          parent: BrowserWindow.fromWebContents(contents) ?? undefined,
          webPreferences: {
            partition: sourcePartition(sourceId),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webviewTag: false,
            webSecurity: true,
          },
        },
      }
    } catch {
      return { action: 'deny' }
    }
  })
  contents.on('did-create-window', (child) => hardenLoginContents(child.webContents, sourceId))
}

async function openLoginWindow(sourceId: string, value: string): Promise<boolean> {
  await assertActiveSource(sourceId)
  const partition = sourcePartition(sourceId)
  const url = await assertPublicHttpUrl(loginUrl(value), partition)
  await assertActiveSource(sourceId)
  hardenLoginSession(sourceId)

  const existing = loginWindows.get(sourceId)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    await existing.loadURL(url)
    return true
  }

  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    title: '书源登录',
    webPreferences: {
      partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      webSecurity: true,
    },
  })
  loginWindows.set(sourceId, win)
  win.on('closed', () => {
    if (loginWindows.get(sourceId) === win) loginWindows.delete(sourceId)
  })
  hardenLoginContents(win.webContents, sourceId)
  await win.loadURL(url)
  return true
}

export const registerSourceHandlers = (window: BrowserWindow) => {
  sourceStartupCleanup ??= cleanupOrphanedSourceData().catch((error) =>
    console.error('旧版或孤儿书源敏感数据清理失败:', error)
  )

  handle('source-list', async () => {
    await sourceStartupCleanup
    await retryPendingSourceCleanup()
    return sources.list()
  })
  handle('source-add', (code: string, name?: string) => sources.add(code, name))
  handle('source-update', async (id: string, patch: SourcePatch) => {
    const mayRotateIdentity = patch.code !== undefined || patch.kind !== undefined
    if (mayRotateIdentity) {
      pendingSessionReset.delete(id)
      revokedSourceIds.add(id)
      await cancelSourceRequests(id)
    } else {
      await assertActiveSource(id)
    }

    try {
      const updated = await sources.update(id, patch)
      if (!updated) {
        revokedSourceIds.delete(id)
        return null
      }
      if (updated.id === id) {
        if (mayRotateIdentity) revokedSourceIds.delete(id)
        return updated
      }

      pendingSourceCleanup.add(id)
      try {
        await clearSourceData(id)
        pendingSourceCleanup.delete(id)
      } catch (error) {
        throw new Error(`书源已更新，但旧会话清理失败: ${(error as Error).message || String(error)}`)
      }
      return updated
    } catch (error) {
      let oldSourceStillExists = false
      try {
        oldSourceStillExists = (await sources.list()).some((source) => source.id === id)
      } catch {
        // 保持撤销状态，避免无法确认身份时重新开放旧会话。
      }
      if (oldSourceStillExists) revokedSourceIds.delete(id)
      throw error
    }
  })
  handle('source-move', (id: string, direction: SourceMove) => sources.move(id, direction))
  handle('source-remove', async (id: string) => {
    if (!(await sources.list()).some((source) => source.id === id)) {
      if (pendingSourceCleanup.has(id)) await retryPendingSourceCleanup()
      return false
    }

    pendingSessionReset.delete(id)
    revokedSourceIds.add(id)
    await cancelSourceRequests(id)
    try {
      const removed = await sources.remove(id)
      if (!removed) {
        revokedSourceIds.delete(id)
        return false
      }
      pendingSourceCleanup.add(id)
      try {
        await clearSourceData(id)
        pendingSourceCleanup.delete(id)
      } catch (error) {
        throw new Error(`书源已删除，但会话数据清理失败: ${(error as Error).message || String(error)}`)
      }
      return true
    } catch (error) {
      let sourceStillExists = false
      try {
        sourceStillExists = (await sources.list()).some((source) => source.id === id)
      } catch {
        // 保持撤销状态，避免无法确认删除结果时重新开放会话。
      }
      if (sourceStillExists) revokedSourceIds.delete(id)
      throw error
    }
  })
  handle('source-toggle', (id: string, enabled: boolean) => sources.toggle(id, enabled))

  handle('source-open-file', async () => {
    const res = await dialog.showOpenDialog(window, {
      title: '导入书源(JS / 轻悦时光 JSON)',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '书源', extensions: ['js', 'json', 'txt'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    if (res.canceled) return []
    return Promise.all(
      res.filePaths.map(async (path) => ({
        name: basename(path).replace(/\.(js|json|txt)$/i, ''),
        code: await readFile(path, 'utf-8'),
      }))
    )
  })

  handle('source-add-url', (url: string) => sources.addFromUrl(url))
  handle('source-runtime-preload', () => pathToFileURL(join(__dirname, '../preload/source-runtime.js')).href)

  handle('source-auth-status', (sourceId: string) =>
    runActiveSourceOperation(sourceId, async () => ({
      hasCredentials: Boolean(await sourceAuth.get(sourceId)),
      persistentAvailable: sourceAuth.available(),
    }))
  )
  handle('source-auth-get', (sourceId: string) => runActiveSourceOperation(sourceId, () => sourceAuth.get(sourceId)))
  handle('source-auth-set', (sourceId: string, value: string) =>
    runActiveSourceOperation(sourceId, async () => {
      const persistent = await sourceAuth.set(sourceId, value)
      return { saved: true, persistent }
    })
  )
  handle('source-auth-clear', (sourceId: string) =>
    runActiveSourceOperation(sourceId, async () => {
      await sourceAuth.clear(sourceId)
      return true
    })
  )
  handle('source-open-login', (sourceId: string, url: string) =>
    runActiveSourceOperation(sourceId, () => openLoginWindow(sourceId, url))
  )
  handle('source-session-clear', async (sourceId: string) => {
    if (!(await sources.list()).some((source) => source.id === sourceId)) return false
    revokedSourceIds.add(sourceId)
    pendingSessionReset.add(sourceId)
    try {
      await clearSourceData(sourceId)
      pendingSessionReset.delete(sourceId)
      revokedSourceIds.delete(sourceId)
      return true
    } catch (error) {
      throw new Error(`会话清理失败: ${(error as Error).message || String(error)}`)
    }
  })

  handle('source-cover', async (sourceId: string, url: string) => {
    const response = await runSourceRequest({
      sourceId,
      url,
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' },
    })
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`封面下载失败(HTTP ${response.statusCode})`)
    }
    return `data:${coverMime(response)};base64,${response.body}`
  })
  handle('source-http', (req: HttpReq) => runSourceRequest(req))
  handle('source-cookie-get', (sourceId: string, url: string) =>
    runActiveSourceOperation(sourceId, () => sourceCookies.get(sourceId, url))
  )
  handle('source-cookie-get-one', (sourceId: string, url: string, name: string) =>
    runActiveSourceOperation(sourceId, () => sourceCookies.getOne(sourceId, url, name))
  )
  handle('source-cookie-set', (sourceId: string, url: string, value: string) =>
    runActiveSourceOperation(sourceId, () => sourceCookies.setHeader(sourceId, url, value))
  )
  handle('source-cookie-set-one', (sourceId: string, url: string, name: string, value: string) =>
    runActiveSourceOperation(sourceId, () => sourceCookies.setOne(sourceId, url, name, value))
  )
  handle('source-cookie-remove', (sourceId: string, url: string) =>
    runActiveSourceOperation(sourceId, () => sourceCookies.clearUrl(sourceId, url))
  )
  handle('source-cache-get', (key: string) => {
    const sourceId = sourceIdFromCacheKey(key)
    return runActiveSourceOperation(sourceId, () => sourceCache.get(key))
  })
  handle('source-cache-set', (key: string, value: string) => {
    const sourceId = sourceIdFromCacheKey(key)
    return runActiveSourceOperation(sourceId, () => sourceCache.set(key, value))
  })
  handle('source-cache-remove', (key: string) => {
    const sourceId = sourceIdFromCacheKey(key)
    return runActiveSourceOperation(sourceId, () => sourceCache.remove(key))
  })
}
