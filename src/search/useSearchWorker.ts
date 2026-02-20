import { useCallback, useEffect, useRef, useState } from 'react'

import type { SearchBundle, SearchHit } from '../types/search'

export function useSearchWorker() {
  const workerRef = useRef<Worker | null>(null)
  const [ready, setReady] = useState(false)
  const pending = useRef(new Map<number, (hits: SearchHit[]) => void>())
  const requestCounter = useRef(0)

  const ensureWorker = useCallback(() => {
    if (workerRef.current) {return workerRef.current}
    const worker = new Worker(new URL('./searchWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ type: string; id: number; hits: SearchHit[] }>) => {
      if (event.data.type === 'result') {
        const resolver = pending.current.get(event.data.id)
        if (resolver) {
          pending.current.delete(event.data.id)
          resolver(event.data.hits)
        }
      }
    }
    workerRef.current = worker
    return worker
  }, [])

  const initWorker = useCallback((bundle: SearchBundle) => {
    const worker = ensureWorker()
    worker.postMessage({ type: 'init', payload: bundle })
    setReady(true)
  }, [ensureWorker])

  const runSearch = useCallback(
    (query: string, limit = 40) =>
      new Promise<SearchHit[]>((resolve) => {
        if (!workerRef.current) {
          resolve([])
          return
        }
        const id = requestCounter.current++
        pending.current.set(id, resolve)
        workerRef.current.postMessage({ type: 'search', id, query, limit })
      }),
    [],
  )

  useEffect(() => {
    const pendingMap = pending.current
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      pendingMap.clear()
    }
  }, [])

  return { initWorker, runSearch, ready, ensureWorker }
}
