const STORAGE_KEYS = {
  imports: 'importsAvailable',
  cache: 'cacheConversations',
  pinned: 'pinnedConversationIds',
} as const

export const localSettings = {
  hasImportsAvailable(): boolean {
    return safeLocalStorage()?.getItem(STORAGE_KEYS.imports) === '1'
  },
  setImportsAvailable(): void {
    safeLocalStorage()?.setItem(STORAGE_KEYS.imports, '1')
  },
  isCacheEnabled(): boolean {
    return safeLocalStorage()?.getItem(STORAGE_KEYS.cache) === '1'
  },
  setCacheEnabled(enabled: boolean): void {
    const storage = safeLocalStorage()
    if (!storage) {return}
    if (enabled) {
      storage.setItem(STORAGE_KEYS.cache, '1')
      storage.setItem(STORAGE_KEYS.imports, '1')
    } else {
      storage.removeItem(STORAGE_KEYS.cache)
    }
  },
  clearAll(): void {
    safeLocalStorage()?.clear()
  },
  getPinnedConversationIds(): string[] {
    const raw = safeLocalStorage()?.getItem(STORAGE_KEYS.pinned) ?? '[]'
    try {
      const parsed = JSON.parse(raw) as string[]
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === 'string')
      }
      return []
    } catch {
      return []
    }
  },
  setPinnedConversationIds(ids: string[]): void {
    safeLocalStorage()?.setItem(STORAGE_KEYS.pinned, JSON.stringify(Array.from(new Set(ids))))
  },
}

function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {return null}
  try {
    return window.localStorage
  } catch (error) {
    console.warn('localStorage unavailable', error)
    return null
  }
}
