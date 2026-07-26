import { contextBridge, webUtils } from 'electron'
import { conveyor } from '@/lib/conveyor/api'

// 拖拽导入需要拿到本地文件的真实路径。
// Electron ≥32 移除了 File.path,改用 webUtils.getPathForFile。
const openread = {
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
}

// Use `contextBridge` APIs to expose APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('conveyor', conveyor)
    contextBridge.exposeInMainWorld('openread', openread)
  } catch (error) {
    console.error(error)
  }
} else {
  window.conveyor = conveyor
  window.openread = openread
}
