import { BrowserWindow, dialog } from 'electron'
import { readFile } from 'fs/promises'
import { basename } from 'path'
import { handle } from '@/lib/main/shared'
import { library, type Book } from '@/lib/main/library'

const EBOOK_FILTERS = [
  { name: '电子书', extensions: ['epub', 'mobi', 'azw3', 'azw', 'fb2', 'fbz', 'cbz', 'pdf', 'txt'] },
  { name: '所有文件', extensions: ['*'] },
]

export const registerReaderHandlers = (window: BrowserWindow) => {
  handle('reader-open-dialog', async () => {
    const res = await dialog.showOpenDialog(window, {
      title: '打开电子书',
      properties: ['openFile', 'multiSelections'],
      filters: EBOOK_FILTERS,
    })
    return res.canceled ? [] : res.filePaths
  })

  handle('reader-read-file', async (path: string) => {
    const buf = await readFile(path)
    // Buffer 是 Uint8Array 的子类;通过 IPC 传到渲染层会成为 Uint8Array
    return { name: basename(path), bytes: new Uint8Array(buf) }
  })

  handle('library-list', () => library.list())
  handle('library-upsert', (book: Book) => library.upsert(book))
  handle('library-remove', (id: string) => library.remove(id))
  handle('library-set-progress', (id: string, progress: number, location: string) =>
    library.setProgress(id, progress, location)
  )
}
