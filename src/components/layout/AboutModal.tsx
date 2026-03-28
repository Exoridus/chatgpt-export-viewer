import clsx from 'clsx';
import { Check, Copy, ExternalLink, FileText, Github, Heart, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useModalA11y } from '../../hooks/useModalA11y';
import { usePreferences } from '../../state/PreferencesContext';
import styles from './AboutModal.module.scss';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

const sponsorUrl = 'https://github.com/sponsors/Exoridus';

export function AboutModal({ open, onClose }: AboutModalProps) {
  const [copied, setCopied] = useState(false);
  const { t } = usePreferences();
  const { containerRef, onOverlayMouseDown } = useModalA11y({ open, onClose });

  const licenseUrl = useMemo(() => `${__APP_REPO_URL__.replace(/\/$/, '')}/blob/main/LICENSE`, []);

  if (!open) {
    return null;
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="about-title" onMouseDown={onOverlayMouseDown}>
      <div className={clsx('modal', styles.modal)} ref={containerRef}>
        <header className={styles.header}>
          <h2 id="about-title">{t.about.title}</h2>
          <button type="button" className="icon-button modal-close-btn" onClick={onClose} aria-label={t.about.closeDialog}>
            <X size={16} />
          </button>
        </header>

        <div className={styles.body}>
          <section className={styles.hero}>
            <span className={styles.heroIcon} aria-hidden="true">
              <Sparkles size={16} />
            </span>
            <h3>{t.about.productName}</h3>
            <p className={styles.lead}>{t.about.lead}</p>
            <p className={styles.copy}>{t.about.copy}</p>
          </section>

          <section className={styles.actions} aria-label={t.about.linksLabel}>
            <a className={styles.iconAction} href={__APP_REPO_URL__} target="_blank" rel="noreferrer" title={t.about.github} aria-label={t.about.github}>
              <Github size={16} />
            </a>
            <a className={styles.iconAction} href={sponsorUrl} target="_blank" rel="noreferrer" title={t.about.sponsor} aria-label={t.about.sponsor}>
              <Heart size={16} />
            </a>
            <a className={styles.licenseLink} href={licenseUrl} target="_blank" rel="noreferrer" title={t.about.license}>
              <FileText size={13} />
              <span>{t.about.license}</span>
              <ExternalLink size={12} />
            </a>
          </section>

          <section className={styles.metaArea}>
            <div className={styles.metaPill}>
              <span>{t.about.version}</span>
              <code>{__APP_VERSION__}</code>
            </div>
            <div className={styles.metaPill}>
              <span>{t.about.commit}</span>
              <code>{__APP_COMMIT__}</code>
              <button
                type="button"
                className={clsx('icon-button', styles.copyButton)}
                title={copied ? t.about.copiedCommit : t.about.copyCommit}
                aria-label={copied ? t.about.copiedCommit : t.about.copyCommit}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(__APP_COMMIT__);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1400);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
