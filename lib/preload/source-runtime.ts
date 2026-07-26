import { contextBridge, ipcRenderer } from 'electron'

/**
 * 书源运行时 preload(隔离环境)。
 * 不可信的书源 JS 只能拿到这里暴露的少量能力,拿不到 conveyor / Node / 文件系统。
 */
const host = {
  http: (req: {
    url: string
    method?: string
    headers?: Record<string, string>
    body?: string
    followRedirects?: boolean
  }) => ipcRenderer.invoke('source-http', req),

  cacheGet: (key: string) => ipcRenderer.invoke('source-cache-get', key),
  cacheSet: (key: string, value: string) => ipcRenderer.invoke('source-cache-set', key, value),
  cacheRemove: (key: string) => ipcRenderer.invoke('source-cache-remove', key),
}

contextBridge.exposeInMainWorld('__sourceHost', host)
