import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

export type NoticeTone = 'info' | 'success' | 'warning' | 'error'

export interface NoticeOptions {
  persistent?: boolean
}

export interface NoticeMessage {
  id: number
  message: string
  tone: NoticeTone
  persistent?: boolean
}

export interface NotificationContextValue {
  notice: NoticeMessage | null
  pushNotice: (message: string, tone?: NoticeTone, options?: NoticeOptions) => void
  clearNotice: () => void
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined)

export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext)
  if (!ctx) {throw new Error('NotificationContext missing')}
  return ctx
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<NoticeMessage | null>(null)

  const pushNotice = useCallback(
    (message: string, tone: NoticeTone = 'info', options?: NoticeOptions) => {
      setNotice({
        id: Date.now(),
        message,
        tone,
        persistent: options?.persistent ?? tone === 'error',
      })
    },
    [],
  )

  const clearNotice = useCallback(() => setNotice(null), [])

  const value = useMemo(
    () => ({ notice, pushNotice, clearNotice }),
    [notice, pushNotice, clearNotice],
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}
