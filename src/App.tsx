import './index.scss'

import clsx from 'clsx'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Route, Routes } from 'react-router-dom'

import { DeepLinkRedirect } from './components/layout/DeepLinkRedirect'
import { ErrorBoundary } from './components/layout/ErrorBoundary'
import { TopBar } from './components/layout/TopBar'
import { Sidebar } from './components/sidebar/Sidebar'
import { useHotkeys } from './hooks/useHotkeys'
import { HomeRoute } from './routes/HomeRoute'
import { NotFoundRoute } from './routes/NotFoundRoute'
import { useImportExport } from './state/ImportExportContext'
import { useNotification } from './state/NotificationContext'
import { usePreferences } from './state/PreferencesContext'

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
  const [isDropImportActive, setIsDropImportActive] = useState(false)
  const [pendingDroppedZipFiles, setPendingDroppedZipFiles] = useState<File[]>([])
  const dragDepthRef = useRef(0)
  const { notice, clearNotice } = useNotification()
  const { importing } = useImportExport()
  const { t } = usePreferences()

  const shouldOpenSearchHotkey = useCallback((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    if (!target) {return true}
    const tag = target.tagName.toLowerCase()
    const isEditable =
      target.isContentEditable ||
      tag === 'input' ||
      tag === 'textarea' ||
      target.closest('[contenteditable="true"]') !== null ||
      target.closest('[data-code-block="true"]') !== null ||
      target.closest('.cm-editor') !== null
    if (isEditable) {return false}
    if (target === document.body || target === document.documentElement) {
      return true
    }
    return target.closest('[data-app-shell="true"]') !== null
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

  useEffect(() => {
    const hasZipFiles = (transfer: DataTransfer | null) => {
      if (!transfer) {return false}
      if (Array.from(transfer.files).some((file) => file.name.toLowerCase().endsWith('.zip'))) {
        return true
      }
      return Array.from(transfer.items).some((item) => item.kind === 'file')
    }

    const onDragEnter = (event: DragEvent) => {
      if (!hasZipFiles(event.dataTransfer)) {return}
      event.preventDefault()
      dragDepthRef.current += 1
      setIsDropImportActive(true)
    }

    const onDragOver = (event: DragEvent) => {
      if (!hasZipFiles(event.dataTransfer)) {return}
      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy'
      }
      setIsDropImportActive(true)
    }

    const onDragLeave = (event: DragEvent) => {
      if (!hasZipFiles(event.dataTransfer)) {return}
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) {
        setIsDropImportActive(false)
      }
    }

    const onDrop = (event: DragEvent) => {
      if (!hasZipFiles(event.dataTransfer)) {return}
      event.preventDefault()
      dragDepthRef.current = 0
      setIsDropImportActive(false)
      if (importing) {return}
      const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.name.toLowerCase().endsWith('.zip'))
      if (!files.length) {return}
      setPendingDroppedZipFiles(files)
      setUploadOpen(true)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)

    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [importing])

  return (
    <div className="app-shell" data-app-shell="true">
      {isDropImportActive && (
        <div className="app-drop-overlay" role="status" aria-live="polite">
          <div className="app-drop-overlay-card">
            <strong>{t.app.dropImportTitle}</strong>
            <span>{t.app.dropImportSubtitle}</span>
          </div>
        </div>
      )}
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
          <ErrorBoundary>
            <Suspense fallback={<div className="viewer-loading">{t.app.loading}</div>}>
              <Routes>
                <Route path="/" element={<HomeRoute />} />
                <Route path="/artifacts" element={<GalleryRoute />} />
                <Route path="/gallery" element={<GalleryRoute />} />
                <Route path="/:conversationId" element={<ConversationRoute />} />
                <Route path="*" element={<NotFoundRoute />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
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
          <ImportModal
            open={uploadOpen}
            onClose={() => {
              setUploadOpen(false)
              setPendingDroppedZipFiles([])
            }}
            pendingFiles={pendingDroppedZipFiles}
            onConsumePendingFiles={() => setPendingDroppedZipFiles([])}
          />
        </Suspense>
      )}
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label={t.sidebar.closeConversationList}
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}

export default App
