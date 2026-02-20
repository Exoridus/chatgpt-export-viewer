import clsx from 'clsx'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'

import { DeepLinkRedirect } from './components/layout/DeepLinkRedirect'
import { TopBar } from './components/layout/TopBar'
import { Sidebar } from './components/sidebar/Sidebar'
import { useHotkeys } from './hooks/useHotkeys'
import { HomeRoute } from './routes/HomeRoute'
import { NotFoundRoute } from './routes/NotFoundRoute'
import { useAppData } from './state/AppDataContext'

const ConversationRoute = lazy(() => import('./routes/ConversationRoute').then((mod) => ({ default: mod.ConversationRoute })))
const GalleryRoute = lazy(() => import('./routes/GalleryRoute').then((mod) => ({ default: mod.GalleryRoute })))
const SearchPalette = lazy(() => import('./components/search/SearchPalette').then((mod) => ({ default: mod.SearchPalette })))
const SettingsModal = lazy(() => import('./components/settings/SettingsModal').then((mod) => ({ default: mod.SettingsModal })))
const AboutModal = lazy(() => import('./components/layout/AboutModal').then((mod) => ({ default: mod.AboutModal })))
const ImportModal = lazy(() => import('./components/importer/ImportModal').then((mod) => ({ default: mod.ImportModal })))

function App() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const { notice, clearNotice } = useAppData()

  const shouldOpenSearchHotkey = useCallback((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    if (!target) {return true}
    const tag = target.tagName.toLowerCase()
    const isEditable =
      target.isContentEditable ||
      tag === 'input' ||
      tag === 'textarea' ||
      target.closest('[contenteditable="true"]') !== null ||
      target.closest('.code-block') !== null ||
      target.closest('.cm-editor') !== null
    if (isEditable) {return false}
    return target.closest('.app-shell') !== null
  }, [])

  useHotkeys(['ctrl+f', 'meta+f', 'ctrl+k', 'meta+k'], () => setSearchOpen(true), { shouldHandle: shouldOpenSearchHotkey })

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') {return}
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [sidebarOpen])

  useEffect(() => {
    if (!notice) {return}
    if (notice.tone === 'error' || notice.persistent) {return}
    const timer = window.setTimeout(() => {
      clearNotice()
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [notice, clearNotice])

  return (
    <div className={clsx('app-shell', sidebarOpen && 'sidebar-mobile-open')}>
      <Sidebar
        onOpenUpload={() => setUploadOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenAbout={() => setAboutOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        isMobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
      />
      <div className="main-column">
        <TopBar onToggleSidebar={() => setSidebarOpen((open) => !open)} />
        <main className="content-area">
          <DeepLinkRedirect />
          <Suspense fallback={<div className="viewer-loading">Loading…</div>}>
            <Routes>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/gallery" element={<GalleryRoute />} />
              <Route path="/:conversationId" element={<ConversationRoute />} />
              <Route path="*" element={<NotFoundRoute />} />
            </Routes>
          </Suspense>
        </main>
        {notice && (
          <div className="toast-container" role="status" aria-live="polite">
            <button type="button" className={clsx('toast', `toast-${notice.tone}`)} onClick={clearNotice}>
              <span>{notice.message}</span>
            </button>
          </div>
        )}
      </div>
      {searchOpen && (
        <Suspense fallback={null}>
          <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
        </Suspense>
      )}
      {(settingsOpen || aboutOpen || uploadOpen) && (
        <Suspense fallback={null}>
          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
          <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
          <ImportModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
        </Suspense>
      )}
      {sidebarOpen && (
        <button type="button" className="sidebar-backdrop" aria-label="Close conversation list" onClick={() => setSidebarOpen(false)} />
      )}
    </div>
  )
}

export default App
