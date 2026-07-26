import { app } from 'electron'
import { join } from 'path'
import fse from 'fs-extra'

export interface Book {
  id: string
  title: string
  author: string
  path: string // 原始文件路径
  format: string // epub / mobi / azw3 / fb2 / cbz / pdf / txt
  addedAt: number
  lastReadAt: number
  progress: number // 0..1
  location: string // foliate CFI 或 pdf 页码,用于恢复位置
  cover: string // dataURL,可空
}

const dataFile = () => join(app.getPath('userData'), 'library.json')

async function readAll(): Promise<Book[]> {
  try {
    const data = await fse.readJSON(dataFile())
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

async function writeAll(books: Book[]): Promise<void> {
  await fse.ensureDir(app.getPath('userData'))
  await fse.writeJSON(dataFile(), books, { spaces: 2 })
}

export const library = {
  list: () => readAll(),

  async upsert(book: Book): Promise<Book> {
    const books = await readAll()
    const idx = books.findIndex((b) => b.id === book.id)
    if (idx >= 0) books[idx] = { ...books[idx], ...book }
    else books.unshift(book)
    await writeAll(books)
    return book
  },

  async remove(id: string): Promise<boolean> {
    const books = await readAll()
    const next = books.filter((b) => b.id !== id)
    await writeAll(next)
    return next.length !== books.length
  },

  async setProgress(id: string, progress: number, location: string): Promise<boolean> {
    const books = await readAll()
    const b = books.find((x) => x.id === id)
    if (!b) return false
    b.progress = progress
    b.location = location
    b.lastReadAt = Date.now()
    await writeAll(books)
    return true
  },
}
