import { ConveyorApi } from '@/lib/preload/shared'

export class NativeApi extends ConveyorApi {
  getState = () => this.invoke('native-get-state')
  setOpacity = (value: number) => this.invoke('native-set-opacity', value)
  setAlwaysOnTop = (enabled: boolean) => this.invoke('native-set-always-on-top', enabled)
  setContentProtection = (enabled: boolean) => this.invoke('native-set-content-protection', enabled)
  toggleVisible = () => this.invoke('native-toggle-visible')
  setBossKey = (accelerator: string) => this.invoke('native-set-boss-key', accelerator)
}
