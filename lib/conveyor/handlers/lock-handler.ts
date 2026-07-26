import { BrowserWindow, powerMonitor } from 'electron'
import { handle } from '@/lib/main/shared'
import { lock } from '@/lib/main/lock'

export const registerLockHandlers = (window: BrowserWindow) => {
  handle('lock-status', () => ({ enabled: lock.isEnabled(), available: lock.available() }))
  handle('lock-set-pin', (pin: string) => lock.setPin(pin))
  handle('lock-verify', (pin: string) => lock.verify(pin))
  handle('lock-disable', (pin: string) => lock.disable(pin))

  // 系统挂起 / 锁屏时,若启用了密码锁则自动锁定应用
  const autoLock = () => {
    if (lock.isEnabled() && !window.isDestroyed()) window.webContents.send('app-lock')
  }
  powerMonitor.on('suspend', autoLock)
  powerMonitor.on('lock-screen', autoLock)
}
