import clsx from 'clsx'
import { Search, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { formatShortDate } from '../../lib/date'
import { useSearchWorker } from '../../search/useSearchWorker'
import { useAppData } from '../../state/AppDataContext'
import type { SearchHit } from '../../types/search'

interface SearchPaletteProps {
  open: boolean
  onClose: () => void
}

export function SearchPalette({ open, onClose }: SearchPaletteProps) {
  const { ensureSearchBundle } = useAppData()
  const { initWorker, runSearch, ensureWorker } = useSearchWorker()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('Type at least 3 characters to search')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setStatusMessage('Type at least 3 characters to search')
      return
    }
    let cancelled = false
    async function loadBundle() {
      const bundle = await ensureSearchBundle()
      if (!bundle) {
        setStatusMessage('Search will be available after importing data or providing a server search index.')
        return
      }
      ensureWorker()
      if (!cancelled) {
        initWorker(bundle)
        setTimeout(() => inputRef.current?.focus(), 100)
      }
    }
    loadBundle()
    return () => {
      cancelled = true
    }
  }, [ensureSearchBundle, ensureWorker, initWorker, open])

  useEffect(() => {
    if (!open) {return}
    if (query.trim().length < 3) {
      setResults([])
      setStatusMessage('Type at least 3 characters to search')
      return
    }
    let cancelled = false
    setLoading(true)
    const handle = setTimeout(async () => {
      const hits = await runSearch(query.trim())
      if (cancelled) {return}
      setResults(hits)
      setSelectedIndex(0)
      setLoading(false)
      if (!hits.length) {
        setStatusMessage('No matches yet — try another phrase')
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [open, query, runSearch])

  useEffect(() => {
    if (!open) {return}
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onWindowKeyDown)
    return () => window.removeEventListener('keydown', onWindowKeyDown)
  }, [onClose, open])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      onClose()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, results.length - 1)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((prev) => Math.max(0, prev - 1))
    } else if (event.key === 'Enter') {
      const hit = results[selectedIndex]
      if (hit) {
        handleSelect(hit)
      }
    }
  }

  const handleSelect = useCallback(
    (hit: SearchHit) => {
      navigate(`/${hit.conversationId}`, {
        state: { hit: { messageId: hit.messageId, blockIndex: hit.blockIndex, lineNo: hit.lineNo, query } },
      })
      onClose()
    },
    [navigate, onClose, query],
  )

  if (!open) {return null}

  return (
    <div
      className="search-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="search-palette">
        <div className="search-input-row">
          <Search size={18} />
          <input
            ref={inputRef}
            placeholder="Search conversations"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="icon-button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="search-results">
          {loading && <div className="search-status">Searching…</div>}
          {!loading && results.length === 0 && <div className="search-status">{statusMessage}</div>}
          {!loading && results.length > 0 && (
            <ul>
              {results.map((hit, index) => {
                const dateLabel = hit.conversationTime ? formatShortDate(hit.conversationTime) : ''
                return (
                  <li key={`${hit.conversationId}-${hit.messageId}-${hit.lineNo}`}>
                    <button className={clsx(index === selectedIndex && 'active')} onClick={() => handleSelect(hit)}>
                      <div className="result-title">
                        <span>{hit.conversationTitle}</span>
                        <time>{dateLabel}</time>
                      </div>
                      <div className="result-snippet">
                        {hit.snippet.before}
                        <mark>{hit.snippet.match}</mark>
                        {hit.snippet.after}
                      </div>
                      {(hit.snippet.contextBefore.length || hit.snippet.contextAfter.length) && (
                        <div className="result-context">
                          {[...hit.snippet.contextBefore, ...hit.snippet.contextAfter].slice(0, 2).map((line, idx) => (
                            <p key={`ctx-${idx}`}>{line}</p>
                          ))}
                        </div>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
