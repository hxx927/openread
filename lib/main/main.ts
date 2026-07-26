import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { join } from 'path'
import { appendFileSync } from 'fs'
import { createAppWindow } from './app'

// 开发期把用户数据(含 <webview> 浏览缓存)放到项目同盘(E:),避免占用 C 盘。
// 打包版默认仍写系统 userData;便携版可在此改成 exe 同级目录。
if (!app.isPackaged) {
  app.setPath('userData', join(app.getAppPath(), '..', '.openread-userdata'))
}

// 主进程未捕获异常写入 userData/error.log,而不是弹致命框把应用冻住(便于排查)
const logError = (tag: string, err: unknown) => {
  try {
    const line = `[${tag}] ${new Date().toISOString()} ${err instanceof Error ? err.stack : String(err)}\n`
    appendFileSync(join(app.getPath('userData'), 'error.log'), line)
  } catch {
    /* ignore */
  }
  console.error(tag, err)
}
process.on('uncaughtException', (err) => logError('uncaughtException', err))
process.on('unhandledRejection', (err) => logError('unhandledRejection', err))

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')
  // Create app window
  createAppWindow()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createAppWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file, you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
