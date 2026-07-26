import { EyeOff, Pin, ShieldOff, Ghost, KeyRound, LogIn } from 'lucide-react'
import { Switch } from '@/app/components/ui/switch'
import { useNative } from './useNative'
import { useStealthStore } from '@/app/store/stealthStore'

/** 摸鱼工具条:透明度 / 置顶 / 防截图 / 老板键 / 失焦隐藏 / 立即隐藏。全是 Electron 原生能力。 */
export default function StealthBar() {
  const { opacity, alwaysOnTop, contentProtection, setOpacity, setAlwaysOnTop, setContentProtection } = useNative()
  const { bossKeyEnabled, autoHideOnBlur, setBossKeyEnabled, setAutoHideOnBlur } = useStealthStore()

  const minimize = () => window.conveyor.window.windowMinimize()

  return (
    <div className="flex items-center gap-4 border-t border-border bg-background/95 px-4 py-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <Ghost className="size-4" />
        摸鱼
      </div>

      <label className="flex items-center gap-2">
        透明度
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="h-1 w-24 cursor-pointer accent-primary"
        />
        <span className="w-8 tabular-nums">{Math.round(opacity * 100)}%</span>
      </label>

      <label className="flex items-center gap-1.5">
        <Pin className="size-3.5" /> 置顶
        <Switch size="sm" checked={alwaysOnTop} onCheckedChange={setAlwaysOnTop} />
      </label>

      <label className="flex items-center gap-1.5" title="开启后本窗口对系统截图、录屏软件不可见">
        <ShieldOff className="size-3.5" /> 防截图
        <Switch size="sm" checked={contentProtection} onCheckedChange={setContentProtection} />
      </label>

      <label className="flex items-center gap-1.5" title="开启后可用 Ctrl+Shift+X 一键显示/隐藏窗口">
        <KeyRound className="size-3.5" /> 老板键
        <Switch size="sm" checked={bossKeyEnabled} onCheckedChange={setBossKeyEnabled} />
      </label>

      <label className="flex items-center gap-1.5" title="点到别的窗口即最小化;点任务栏图标恢复">
        <LogIn className="size-3.5" /> 失焦隐藏
        <Switch size="sm" checked={autoHideOnBlur} onCheckedChange={setAutoHideOnBlur} />
      </label>

      <div className="flex-1" />

      {bossKeyEnabled && <span className="opacity-70">Ctrl+Shift+X</span>}
      <button
        onClick={minimize}
        className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-foreground hover:bg-accent"
        title="最小化到任务栏"
      >
        <EyeOff className="size-3.5" /> 立即隐藏
      </button>
    </div>
  )
}
