import { EyeOff, Pin, ShieldOff, Ghost } from 'lucide-react'
import { Switch } from '@/app/components/ui/switch'
import { useNative } from './useNative'

/** 摸鱼工具条:透明度 / 置顶 / 截图保护 / 立即隐藏。全部是 Electron 原生能力。 */
export default function StealthBar() {
  const { opacity, alwaysOnTop, contentProtection, setOpacity, setAlwaysOnTop, setContentProtection, hide } = useNative()

  return (
    <div className="flex items-center gap-4 border-t border-border bg-background/95 px-4 py-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <Ghost className="size-4" />
        摸鱼
      </div>

      {/* 窗口透明度 */}
      <label className="flex items-center gap-2">
        透明度
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="h-1 w-28 cursor-pointer accent-primary"
        />
        <span className="w-8 tabular-nums">{Math.round(opacity * 100)}%</span>
      </label>

      {/* 窗口置顶 */}
      <label className="flex items-center gap-1.5">
        <Pin className="size-3.5" />
        置顶
        <Switch size="sm" checked={alwaysOnTop} onCheckedChange={setAlwaysOnTop} />
      </label>

      {/* 截图 / 录屏保护 */}
      <label className="flex items-center gap-1.5" title="开启后本窗口对系统截图、录屏软件不可见">
        <ShieldOff className="size-3.5" />
        防截图
        <Switch size="sm" checked={contentProtection} onCheckedChange={setContentProtection} />
      </label>

      <div className="flex-1" />

      <span className="opacity-70">老板键 Ctrl+Shift+X</span>
      <button
        onClick={hide}
        className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-foreground hover:bg-accent"
      >
        <EyeOff className="size-3.5" />
        立即隐藏
      </button>
    </div>
  )
}
