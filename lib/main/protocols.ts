import { protocol, net } from 'electron'
import { join, normalize } from 'path'
import { pathToFileURL } from 'url'

export function registerResourcesProtocol() {
  protocol.handle('res', async (request) => {
    try {
      const url = new URL(request.url)
      // Combine hostname and pathname to get the full path
      const fullPath = join(url.hostname, url.pathname.slice(1))
      const resourcesRoot = join(__dirname, '../../resources')
      const filePath = normalize(join(resourcesRoot, fullPath))

      // 防目录穿越:解析后的路径必须仍在 resources 根目录内
      if (!filePath.startsWith(resourcesRoot)) {
        return new Response('Forbidden', { status: 403 })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch (error) {
      console.error('Protocol error:', error)
      return new Response('Resource not found', { status: 404 })
    }
  })
}
