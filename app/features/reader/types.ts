export interface ViewerHandle {
  prev: () => void
  next: () => void
  goTo: (target: string | number) => void
  goToFraction: (fraction: number) => void
}

export interface TocItem {
  label: string
  href: string
  subitems?: TocItem[]
}

export interface ViewerProps {
  path: string
  initialLocation: string
  fontSize: number
  lineHeight: number
  theme: 'light' | 'sepia' | 'dark'
  onProgress: (fraction: number, location: string) => void
  onToc?: (toc: TocItem[]) => void
  onMeta?: (meta: { title?: string; author?: string; cover?: string }) => void
}

export const THEME_COLORS: Record<'light' | 'sepia' | 'dark', { bg: string; fg: string }> = {
  light: { bg: '#ffffff', fg: '#1a1a1a' },
  sepia: { bg: '#f5ecd9', fg: '#5b4636' },
  dark: { bg: '#191919', fg: '#c9c9c9' },
}
