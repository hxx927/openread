import { ConveyorApi } from '@/lib/preload/shared'
import type { z } from 'zod'
import type { bookSourceSchema } from '@/lib/conveyor/schemas/source-schema'
import type { SourceMove, SourcePatch } from '@/lib/main/sources'

export type BookSource = z.infer<typeof bookSourceSchema>

export class SourceApi extends ConveyorApi {
  list = () => this.invoke('source-list')
  add = (code: string, name?: string) => this.invoke('source-add', code, name)
  update = (id: string, patch: SourcePatch) => this.invoke('source-update', id, patch)
  move = (id: string, direction: SourceMove) => this.invoke('source-move', id, direction)
  remove = (id: string) => this.invoke('source-remove', id)
  toggle = (id: string, enabled: boolean) => this.invoke('source-toggle', id, enabled)
  addUrl = (url: string) => this.invoke('source-add-url', url)
  openFile = () => this.invoke('source-open-file')
  runtimePreload = () => this.invoke('source-runtime-preload')
  cover = (sourceId: string, url: string) => this.invoke('source-cover', sourceId, url)

  authStatus = (sourceId: string) => this.invoke('source-auth-status', sourceId)
  authGet = (sourceId: string) => this.invoke('source-auth-get', sourceId)
  authSet = (sourceId: string, value: string) => this.invoke('source-auth-set', sourceId, value)
  authClear = (sourceId: string) => this.invoke('source-auth-clear', sourceId)
  openLogin = (sourceId: string, url: string) => this.invoke('source-open-login', sourceId, url)
  clearSession = (sourceId: string) => this.invoke('source-session-clear', sourceId)
}
