import type React from 'react'

/**
 * Electron <webview> 的最小类型:只声明我们实际用到的方法/属性。
 * (完整类型见 Electron.WebviewTag,这里避免在渲染层引入整个 electron 类型包。)
 */
export interface WebviewElement extends HTMLElement {
  src: string
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  stop(): void
  loadURL(url: string): Promise<void>
  getURL(): string
  getTitle(): string
  setZoomLevel(level: number): void
  getZoomLevel(): number
  executeJavaScript(code: string): Promise<unknown>
  insertCSS(css: string): Promise<string>
  removeInsertedCSS(key: string): Promise<void>
  openDevTools(): void
}

type WebviewProps = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
  src?: string
  partition?: string
  allowpopups?: boolean | 'true' | 'false'
  useragent?: string
  disablewebsecurity?: boolean
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: WebviewProps
    }
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: WebviewProps
    }
  }
}
