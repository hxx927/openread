import { ConveyorApi } from '@/lib/preload/shared'
import type { z } from 'zod'
import type { bookSchema } from '@/lib/conveyor/schemas/reader-schema'

export type Book = z.infer<typeof bookSchema>

export class ReaderApi extends ConveyorApi {
  openDialog = () => this.invoke('reader-open-dialog')
  readFile = (path: string) => this.invoke('reader-read-file', path)

  listBooks = () => this.invoke('library-list')
  upsertBook = (book: Book) => this.invoke('library-upsert', book)
  removeBook = (id: string) => this.invoke('library-remove', id)
  setProgress = (id: string, progress: number, location: string) =>
    this.invoke('library-set-progress', id, progress, location)
}
