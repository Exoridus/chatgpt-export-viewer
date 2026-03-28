import clsx from 'clsx';
import { Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, type RowComponentProps } from 'react-window';

import { formatShortDate } from '../../lib/date';
import { useSearchWorker } from '../../search/useSearchWorker';
import { useAppData } from '../../state/AppDataContext';
import { usePreferences } from '../../state/PreferencesContext';
import type { SearchHit } from '../../types/search';
import styles from './SearchPalette.module.scss';

interface SearchPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface SearchRowData {
  results: SearchHit[];
  selectedIndex: number;
  onSelect: (hit: SearchHit) => void;
}

export function SearchPalette({ open, onClose }: SearchPaletteProps) {
  const { ensureSearchBundle } = useAppData();
  const { t } = usePreferences();
  const { initWorker, runSearch, ensureWorker } = useSearchWorker();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(t.search.minChars);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setStatusMessage(t.search.minChars);
      return;
    }
    let cancelled = false;
    async function loadBundle() {
      const bundle = await ensureSearchBundle();
      if (!bundle) {
        setStatusMessage(t.search.unavailable);
        return;
      }
      ensureWorker();
      if (!cancelled) {
        initWorker(bundle);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
    void loadBundle();
    return () => {
      cancelled = true;
    };
  }, [ensureSearchBundle, ensureWorker, initWorker, open, t.search.minChars, t.search.unavailable]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (query.trim().length < 3) {
      setResults([]);
      setStatusMessage(t.search.minChars);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      const hits = await runSearch(query.trim());
      if (cancelled) {
        return;
      }
      setResults(hits);
      setSelectedIndex(0);
      setLoading(false);
      if (!hits.length) {
        setStatusMessage(t.search.noMatches);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, query, runSearch, t.search.minChars, t.search.noMatches]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onWindowKeyDown);
    return () => window.removeEventListener('keydown', onWindowKeyDown);
  }, [onClose, open]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, Math.max(0, results.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (event.key === 'Enter') {
      const hit = results[selectedIndex];
      if (hit) {
        handleSelect(hit);
      }
    }
  };

  const handleSelect = useCallback(
    (hit: SearchHit) => {
      void navigate(`/${hit.conversationId}`, {
        state: { hit: { messageId: hit.messageId, blockIndex: hit.blockIndex, lineNo: hit.lineNo, query } },
      });
      onClose();
    },
    [navigate, onClose, query]
  );

  const rowData = useMemo<SearchRowData>(() => ({ results, selectedIndex, onSelect: handleSelect }), [handleSelect, results, selectedIndex]);

  if (!open) {
    return null;
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={styles.palette}>
        <div className={styles.inputRow}>
          <Search size={18} />
          <input ref={inputRef} placeholder={t.search.placeholder} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={handleKeyDown} />
          <button className="icon-button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className={styles.results}>
          {loading ? <div className={styles.status}>{t.search.searching}</div> : null}
          {!loading && results.length === 0 && <div className={styles.status}>{statusMessage}</div>}
          {!loading && results.length > 0 && (
            <List
              rowComponent={SearchRow}
              rowCount={results.length}
              rowHeight={96}
              rowProps={rowData}
              style={{ height: Math.min(results.length * 96, 500), width: '100%' }}
              tagName="ul"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SearchRow({ ariaAttributes, index, onSelect, results, selectedIndex, style }: RowComponentProps<SearchRowData>) {
  const hit = results[index];
  if (!hit) {
    return null;
  }
  const dateLabel = hit.conversationTime ? formatShortDate(hit.conversationTime) : '';
  const isActive = index === selectedIndex;

  return (
    <li {...ariaAttributes} style={style}>
      <button className={clsx(styles.resultButton, isActive && styles.resultButtonActive)} onClick={() => onSelect(hit)}>
        <div className={styles.resultTitle}>
          <span>{hit.conversationTitle}</span>
          <time>{dateLabel}</time>
        </div>
        <div className={styles.resultSnippet}>
          {hit.snippet.before}
          <mark>{hit.snippet.match}</mark>
          {hit.snippet.after}
        </div>
        {hit.snippet.contextBefore.length || hit.snippet.contextAfter.length ? (
          <div className={styles.resultContext}>
            {[...hit.snippet.contextBefore, ...hit.snippet.contextAfter].slice(0, 2).map((line, idx) => (
              <p key={`ctx-${idx}`}>{line}</p>
            ))}
          </div>
        ) : null}
      </button>
    </li>
  );
}
