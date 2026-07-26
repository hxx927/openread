import { BrowserWindow, dialog } from 'electron'
import { readFile } from 'fs/promises'
import { basename, join } from 'path'
import { pathToFileURL } from 'url'
import { handle } from '@/lib/main/shared'
import { sources, httpRequest, sourceCache, type HttpReq } from '@/lib/main/sources'

export const registerSourceHandlers = (window: BrowserWindow) => {
  handle('source-list', () => sources.list())
  handle('source-add', (code: string, name?: string) => sources.add(code, name))
  handle('source-remove', (id: string) => sources.remove(id))
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
      res.filePaths.map(async (p) => ({
        name: basename(p).replace(/\.(js|json|txt)$/i, ''),
        code: await readFile(p, 'utf-8'),
      }))
    )
  })

  handle('source-add-url', (url: string) => sources.addFromUrl(url))

  handle('source-runtime-preload', () => pathToFileURL(join(__dirname, '../preload/source-runtime.js')).href)

  // 书源运行时能力(由隔离 webview 的 preload 调用)
  handle('source-http', (req: HttpReq) => httpRequest(req))
  handle('source-cache-get', (key: string) => sourceCache.get(key))
  handle('source-cache-set', (key: string, value: string) => sourceCache.set(key, value))
  handle('source-cache-remove', (key: string) => sourceCache.remove(key))
}
