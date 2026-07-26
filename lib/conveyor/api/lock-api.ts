import { ConveyorApi } from '@/lib/preload/shared'

export class LockApi extends ConveyorApi {
  status = () => this.invoke('lock-status')
  setPin = (pin: string) => this.invoke('lock-set-pin', pin)
  verify = (pin: string) => this.invoke('lock-verify', pin)
  disable = (pin: string) => this.invoke('lock-disable', pin)

  /** 主进程要求锁定(系统挂起/锁屏触发) */
  onLock = (cb: () => void): (() => void) => {
    return this.renderer.on('app-lock', () => cb())
  }
}
