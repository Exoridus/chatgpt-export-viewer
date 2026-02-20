import { useEffect, useState } from 'react'

const getInitialSize = () => ({
  width: typeof window !== 'undefined' ? window.innerWidth : 0,
  height: typeof window !== 'undefined' ? window.innerHeight : 0,
})

export function useWindowSize() {
  const [size, setSize] = useState(getInitialSize)
  useEffect(() => {
    const listener = () => setSize(getInitialSize())
    window.addEventListener('resize', listener)
    return () => window.removeEventListener('resize', listener)
  }, [])
  return size
}
