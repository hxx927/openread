import { useEffect } from 'react'
import Shell from '@/app/Shell'
import LockScreen from '@/app/features/lock/LockScreen'
import { useLockStore } from '@/app/store/lockStore'
import { useStealthStore } from '@/app/store/stealthStore'
import './styles/app.css'

export default function App() {
  const { locked, init } = useLockStore()
  const transparent = useStealthStore((s) => s.transparent)
  const initStealth = useStealthStore((s) => s.init)

  useEffect(() => {
    init()
    initStealth()
  }, [init, initStealth])

  // 透明摸鱼模式:给 <html> 挂 class,让应用底层透明
  useEffect(() => {
    document.documentElement.classList.toggle('stealth-on', transparent)
  }, [transparent])

  return (
    <>
      <Shell />
      {locked && <LockScreen />}
    </>
  )
}
