import { useEffect } from 'react'
import Shell from '@/app/Shell'
import LockScreen from '@/app/features/lock/LockScreen'
import { useLockStore } from '@/app/store/lockStore'
import './styles/app.css'

export default function App() {
  const { locked, init } = useLockStore()
  useEffect(() => {
    init()
  }, [init])

  return (
    <>
      <Shell />
      {locked && <LockScreen />}
    </>
  )
}
