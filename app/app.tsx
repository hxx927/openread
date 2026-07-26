import { useEffect } from 'react'
import Shell from '@/app/Shell'
import LockScreen from '@/app/features/lock/LockScreen'
import { useLockStore } from '@/app/store/lockStore'
import { useStealthStore } from '@/app/store/stealthStore'
import './styles/app.css'

export default function App() {
  const { locked, init } = useLockStore()
  const initStealth = useStealthStore((s) => s.init)

  useEffect(() => {
    init()
    initStealth()
  }, [init, initStealth])

  return (
    <>
      <Shell />
      {locked && <LockScreen />}
    </>
  )
}
