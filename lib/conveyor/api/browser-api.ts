import { ConveyorApi } from '@/lib/preload/shared'

export class BrowserApi extends ConveyorApi {
  /** 主进程要求把某个 URL 作为新标签打开(来自 <webview> 内的 window.open / target=_blank) */
  onOpenTab = (cb: (url: string) => void): (() => void) => {
    return this.renderer.on('browser-open-tab', (_event: unknown, url: string) => cb(url))
  }
}
