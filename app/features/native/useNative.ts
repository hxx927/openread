import { useEffect, useState } from 'react'

interface NativeState {
  opacity: number
  alwaysOnTop: boolean
  contentProtection: boolean
}

/** 封装隐蔽能力(透明度 / 置顶 / 截图保护)的读写 */
export function useNative() {
  const [state, setState] = useState<NativeState>({ opacity: 1, alwaysOnTop: false, contentProtection: false })
  const native = window.conveyor.native

  useEffect(() => {
    native.getState().then((s) => setState({ opacity: s.opacity, alwaysOnTop: s.alwaysOnTop, contentProtection: s.contentProtection }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setOpacity = async (v: number) => {
    await native.setOpacity(v)
    setState((s) => ({ ...s, opacity: v }))
  }
  const setAlwaysOnTop = async (v: boolean) => {
    await native.setAlwaysOnTop(v)
    setState((s) => ({ ...s, alwaysOnTop: v }))
  }
  const setContentProtection = async (v: boolean) => {
    await native.setContentProtection(v)
    setState((s) => ({ ...s, contentProtection: v }))
  }
  const hide = () => native.toggleVisible()

  return { ...state, setOpacity, setAlwaysOnTop, setContentProtection, hide }
}
