import { useEffect } from 'react'

interface UseHotkeysOptions {
  shouldHandle?: (event: KeyboardEvent) => boolean
}

export function useHotkeys(keys: string[], handler: (event: KeyboardEvent) => void, options?: UseHotkeysOptions) {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const combo = buildCombo(event)
      if (keys.includes(combo) && (options?.shouldHandle ? options.shouldHandle(event) : true)) {
        event.preventDefault()
        handler(event)
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [handler, keys, options])
}

function buildCombo(event: KeyboardEvent): string {
  const parts = []
  if (event.ctrlKey) {parts.push('ctrl')}
  if (event.metaKey) {parts.push('meta')}
  if (event.shiftKey) {parts.push('shift')}
  parts.push(event.key.toLowerCase())
  return parts.join('+')
}
