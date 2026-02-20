import { Check, Copy, ExternalLink, Github, Heart, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useModalA11y } from '../../hooks/useModalA11y'

interface AboutModalProps {
  open: boolean
  onClose: () => void
}

const sponsorUrl = 'https://github.com/sponsors/Exoridus'

export function AboutModal({ open, onClose }: AboutModalProps) {
  const [copied, setCopied] = useState(false)
  const { containerRef, onOverlayMouseDown } = useModalA11y({ open, onClose })

  const licenseUrl = useMemo(() => `${__APP_REPO_URL__.replace(/\/$/, '')}/blob/main/LICENSE`, [])

  if (!open) {return null}

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="about-title" onMouseDown={onOverlayMouseDown}>
      <div className="modal about-modal" ref={containerRef}>
        <header>
          <h2 id="about-title">About</h2>
          <button className="icon-button modal-close-btn" onClick={onClose} aria-label="Close About dialog">
            <X size={16} />
          </button>
        </header>

        <section className="about-hero">
          <h3>ChatGPT Data Export Viewer</h3>
          <p className="about-lead">Browse ChatGPT exports in a static SPA with local import, search, and offline-friendly hosting.</p>
          <p className="about-copy">
            No backend required. Host static files as-is, and optionally add imported conversation datasets for server-side usage.
          </p>
        </section>

        <section>
          <h3>License</h3>
          <p className="about-copy">AGPL-3.0-or-later. If you host a modified version for users, you must provide the source code.</p>
          <a href={licenseUrl} target="_blank" rel="noreferrer" className="about-inline-link">
            Read license <ExternalLink size={13} />
          </a>
        </section>

        <section>
          <h3>Links</h3>
          <div className="about-link-row">
            <a href={__APP_REPO_URL__} target="_blank" rel="noreferrer" title="GitHub Repository">
              <Github size={14} /> GitHub <ExternalLink size={13} />
            </a>
            <a href={sponsorUrl} target="_blank" rel="noreferrer" title="Sponsor">
              <Heart size={14} /> Sponsor <ExternalLink size={13} />
            </a>
          </div>
        </section>

        <section className="about-meta">
          <h3>Build</h3>
          <p>
            <span>Version</span>
            <code>{__APP_VERSION__}</code>
          </p>
          <p>
            <span>Commit</span>
            <span className="about-commit-row">
              <code>{__APP_COMMIT__}</code>
              <button
                type="button"
                className="icon-button about-copy-btn"
                title={copied ? 'Copied' : 'Copy commit'}
                aria-label={copied ? 'Copied commit hash' : 'Copy commit hash'}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(__APP_COMMIT__)
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 1400)
                  } catch {
                    setCopied(false)
                  }
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </span>
          </p>
        </section>
      </div>
    </div>
  )
}
