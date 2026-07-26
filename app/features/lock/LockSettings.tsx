import { useState } from 'react'
import { Lock, X } from 'lucide-react'
import { useLockStore } from '@/app/store/lockStore'

/** 密码锁设置弹窗:开启 / 关闭 / 立即锁定 */
export default function LockSettings({ onClose }: { onClose: () => void }) {
  const { enabled, available, enable, disable, lockNow } = useLockStore()
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [msg, setMsg] = useState('')

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 8)

  const doEnable = async () => {
    if (!/^\d{4,8}$/.test(pin)) return setMsg('请输入 4–8 位数字')
    if (pin !== pin2) return setMsg('两次输入不一致')
    const ok = await enable(pin)
    setMsg(ok ? '' : '开启失败')
    if (ok) onClose()
  }
  const doDisable = async () => {
    const ok = await disable(pin)
    if (!ok) setMsg('密码错误')
    else onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl">
        <div className="mb-4 flex items-center gap-2">
          <Lock className="size-4" />
          <h2 className="flex-1 text-sm font-semibold">密码锁</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        {!available ? (
          <p className="text-xs text-muted-foreground">当前系统不支持安全存储(safeStorage),无法启用密码锁。</p>
        ) : enabled ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">密码锁已开启。系统挂起/锁屏或重启后需输入密码。</p>
            <button
              onClick={() => {
                lockNow()
                onClose()
              }}
              className="rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              立即锁定
            </button>
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-xs text-muted-foreground">关闭密码锁需验证当前密码:</p>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(digits(e.target.value))}
                placeholder="当前密码"
                className="mb-2 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={doDisable}
                className="w-full rounded-md border border-destructive/50 py-2 text-sm text-destructive hover:bg-destructive/10"
              >
                关闭密码锁
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="mb-1 text-xs text-muted-foreground">设置 4–8 位数字密码。仅存于本机(scrypt + 系统安全存储)。</p>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(digits(e.target.value))}
              placeholder="设置密码"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none"
            />
            <input
              type="password"
              inputMode="numeric"
              value={pin2}
              onChange={(e) => setPin2(digits(e.target.value))}
              placeholder="确认密码"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none"
            />
            <button
              onClick={doEnable}
              className="mt-1 rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              开启密码锁
            </button>
          </div>
        )}

        {msg && <p className="mt-3 text-xs text-destructive">{msg}</p>}
      </div>
    </>
  )
}
