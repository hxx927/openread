import { useEffect, useState } from 'react'
import { Lock, Delete } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLockStore } from '@/app/store/lockStore'

/** 全屏锁屏:输入 PIN 解锁 */
export default function LockScreen() {
  const unlock = useLockStore((s) => s.unlock)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  const submit = async (value: string) => {
    const ok = await unlock(value)
    if (!ok) {
      setError(true)
      setPin('')
      setTimeout(() => setError(false), 600)
    }
  }

  const press = (d: string) => {
    setError(false)
    setPin((p) => (p.length >= 8 ? p : p + d))
  }
  const back = () => setPin((p) => p.slice(0, -1))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') back()
      else if (e.key === 'Enter') submit(pin)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back']

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background text-foreground">
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <Lock className="size-6" />
        </div>
        <p className="text-sm text-muted-foreground">输入密码解锁 OpenRead</p>
      </div>

      {/* 圆点指示 */}
      <div className={cn('flex items-center gap-3', error && 'animate-[shake_0.4s]')}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span
            key={i}
            className={cn('size-3 rounded-full border', i < pin.length ? 'border-primary bg-primary' : 'border-muted-foreground/40')}
          />
        ))}
      </div>
      <div className="h-4 text-xs text-destructive">{error ? '密码错误' : ''}</div>

      {/* 数字键盘 */}
      <div className="grid grid-cols-3 gap-3">
        {keys.map((k, i) =>
          k === '' ? (
            <div key={i} />
          ) : k === 'back' ? (
            <button
              key={i}
              onClick={back}
              className="flex size-16 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <Delete className="size-5" />
            </button>
          ) : (
            <button
              key={i}
              onClick={() => press(k)}
              className="size-16 rounded-full bg-muted text-xl font-medium hover:bg-accent active:scale-95"
            >
              {k}
            </button>
          )
        )}
      </div>

      <button
        onClick={() => submit(pin)}
        disabled={pin.length < 4}
        className="rounded-md bg-primary px-8 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
      >
        解锁
      </button>
    </div>
  )
}
