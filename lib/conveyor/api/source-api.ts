import { ConveyorApi } from '@/lib/preload/shared'
import type { z } from 'zod'
import type { bookSourceSchema } from '@/lib/conveyor/schemas/source-schema'

export type BookSource = z.infer<typeof bookSourceSchema>

export class SourceApi extends ConveyorApi {
  list = () => this.invoke('source-list')
  add = (code: string, name?: string) => this.invoke('source-add', code, name)
  remove = (id: string) => this.invoke('source-remove', id)
  toggle = (id: string, enabled: boolean) => this.invoke('source-toggle', id, enabled)
  openFile = () => this.invoke('source-open-file')
  runtimePreload = () => this.invoke('source-runtime-preload')
}
