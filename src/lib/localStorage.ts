const STORAGE_KEYS = {
  imports: 'importsAvailable',
  cache: 'cacheConversations',
  pinned: 'pinnedConversationIds',
  viewerPrefs: 'viewerPreferences',
} as const;

export interface ViewerPreferences {
  locale: 'auto' | 'en' | 'de';
  appTheme: 'system' | 'dark' | 'light';
  codeThemeFollowAppTheme: boolean;
  codeTheme:
    | 'a11yDark'
    | 'a11yLight'
    | 'monokaiSublime'
    | 'idea'
    | 'oneDark'
    | 'oneLight'
    | 'github'
    | 'nightOwl'
    | 'nightOwlLight'
    | 'shadesOfPurple'
    | 'duotoneDark'
    | 'duotoneLight'
    | 'vsDark'
    | 'vsLight';
  collapseSystemMessages: boolean;
  collapseCodeBlocks: boolean;
}

const DEFAULT_VIEWER_PREFERENCES: ViewerPreferences = {
  locale: 'auto',
  appTheme: 'system',
  codeThemeFollowAppTheme: true,
  codeTheme: 'a11yDark',
  collapseSystemMessages: true,
  collapseCodeBlocks: false,
};

const CODE_THEME_VALUES: Array<ViewerPreferences['codeTheme']> = [
  'a11yDark',
  'a11yLight',
  'monokaiSublime',
  'idea',
  'oneDark',
  'oneLight',
  'github',
  'nightOwl',
  'nightOwlLight',
  'shadesOfPurple',
  'duotoneDark',
  'duotoneLight',
  'vsDark',
  'vsLight',
];

export const localSettings = {
  hasImportsAvailable(): boolean {
    return safeLocalStorage()?.getItem(STORAGE_KEYS.imports) === '1';
  },
  setImportsAvailable(): void {
    safeLocalStorage()?.setItem(STORAGE_KEYS.imports, '1');
  },
  isCacheEnabled(): boolean {
    return safeLocalStorage()?.getItem(STORAGE_KEYS.cache) === '1';
  },
  setCacheEnabled(enabled: boolean): void {
    const storage = safeLocalStorage();
    if (!storage) {
      return;
    }
    if (enabled) {
      storage.setItem(STORAGE_KEYS.cache, '1');
      storage.setItem(STORAGE_KEYS.imports, '1');
    } else {
      storage.removeItem(STORAGE_KEYS.cache);
    }
  },
  clearAll(): void {
    safeLocalStorage()?.clear();
  },
  getPinnedConversationIds(): string[] {
    const raw = safeLocalStorage()?.getItem(STORAGE_KEYS.pinned) ?? '[]';
    try {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === 'string');
      }
      return [];
    } catch {
      return [];
    }
  },
  setPinnedConversationIds(ids: string[]): void {
    safeLocalStorage()?.setItem(STORAGE_KEYS.pinned, JSON.stringify([...new Set(ids)]));
  },
  getViewerPreferences(): ViewerPreferences {
    const raw = safeLocalStorage()?.getItem(STORAGE_KEYS.viewerPrefs);
    if (!raw) {
      return { ...DEFAULT_VIEWER_PREFERENCES };
    }
    try {
      const parsed = JSON.parse(raw) as Partial<ViewerPreferences>;
      return {
        locale: parsed.locale === 'en' || parsed.locale === 'de' || parsed.locale === 'auto' ? parsed.locale : 'auto',
        appTheme: parsed.appTheme === 'dark' || parsed.appTheme === 'light' || parsed.appTheme === 'system' ? parsed.appTheme : 'system',
        codeThemeFollowAppTheme:
          typeof parsed.codeThemeFollowAppTheme === 'boolean' ? parsed.codeThemeFollowAppTheme : DEFAULT_VIEWER_PREFERENCES.codeThemeFollowAppTheme,
        codeTheme:
          typeof parsed.codeTheme === 'string' && CODE_THEME_VALUES.includes(parsed.codeTheme as ViewerPreferences['codeTheme'])
            ? (parsed.codeTheme as ViewerPreferences['codeTheme'])
            : DEFAULT_VIEWER_PREFERENCES.codeTheme,
        collapseSystemMessages:
          typeof parsed.collapseSystemMessages === 'boolean' ? parsed.collapseSystemMessages : DEFAULT_VIEWER_PREFERENCES.collapseSystemMessages,
        collapseCodeBlocks: typeof parsed.collapseCodeBlocks === 'boolean' ? parsed.collapseCodeBlocks : DEFAULT_VIEWER_PREFERENCES.collapseCodeBlocks,
      };
    } catch {
      return { ...DEFAULT_VIEWER_PREFERENCES };
    }
  },
  setViewerPreferences(preferences: ViewerPreferences): void {
    safeLocalStorage()?.setItem(STORAGE_KEYS.viewerPrefs, JSON.stringify(preferences));
  },
};

function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch (error) {
    console.warn('localStorage unavailable', error);
    return null;
  }
}
