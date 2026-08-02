import { contextBridge, ipcRenderer } from 'electron'

/**
 * 书源运行时 preload(隔离环境)。
 * sourceId 由主进程在 will-attach-webview 时绑定到进程参数，页面导航无法改写。
 */
const SOURCE_ID_PATTERN = /^src-[a-zA-Z0-9_-]{1,120}$/
const sourceArgument = process.argv.findLast((argument) => argument.startsWith('--openread-source-id='))
let sourceId = 'invalid-source'
if (sourceArgument) {
  try {
    const candidate = decodeURIComponent(sourceArgument.slice('--openread-source-id='.length))
    if (SOURCE_ID_PATTERN.test(candidate)) sourceId = candidate
  } catch {
    // 保持无效身份，所有绑定书源的 IPC 都会被主进程拒绝。
  }
}

const host = {
  sourceId,
  http: (req: {
    url: string
    method?: string
    headers?: Record<string, string>
    body?: string
    followRedirects?: boolean
  }) => ipcRenderer.invoke('source-http', { ...req, sourceId }),

  cacheGet: (key: string) => ipcRenderer.invoke('source-cache-get', `${sourceId}:${key}`),
  cacheSet: (key: string, value: string) => ipcRenderer.invoke('source-cache-set', `${sourceId}:${key}`, value),
  cacheRemove: (key: string) => ipcRenderer.invoke('source-cache-remove', `${sourceId}:${key}`),

  cookieGet: (url: string) => ipcRenderer.invoke('source-cookie-get', sourceId, url),
  cookieGetOne: (url: string, name: string) => ipcRenderer.invoke('source-cookie-get-one', sourceId, url, name),
  cookieSet: (url: string, value: string) => ipcRenderer.invoke('source-cookie-set', sourceId, url, value),
  cookieSetOne: (url: string, name: string, value: string) =>
    ipcRenderer.invoke('source-cookie-set-one', sourceId, url, name, value),
  cookieRemove: (url: string) => ipcRenderer.invoke('source-cookie-remove', sourceId, url),

  authGet: () => ipcRenderer.invoke('source-auth-get', sourceId),
  authSet: (value: string) =>
    ipcRenderer.invoke('source-auth-set', sourceId, value).then((result: { saved: boolean }) => result.saved),
  authClear: () => ipcRenderer.invoke('source-auth-clear', sourceId),
  openLogin: (url: string) => ipcRenderer.invoke('source-open-login', sourceId, url),
}

contextBridge.exposeInMainWorld('__sourceHost', host)
