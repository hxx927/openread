import { electronAPI } from '@electron-toolkit/preload'
import { AppApi } from './app-api'
import { WindowApi } from './window-api'
import { NativeApi } from './native-api'
import { BrowserApi } from './browser-api'
import { ReaderApi } from './reader-api'

export const conveyor = {
  app: new AppApi(electronAPI),
  window: new WindowApi(electronAPI),
  native: new NativeApi(electronAPI),
  browser: new BrowserApi(electronAPI),
  reader: new ReaderApi(electronAPI),
}

export type ConveyorApi = typeof conveyor
