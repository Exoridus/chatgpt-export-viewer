import { Archive, Upload } from 'lucide-react';

import { usePreferences } from '../state/PreferencesContext';
import styles from './HomeRoute.module.scss';

interface HomeRouteProps {
  onOpenUpload: () => void;
}

export function HomeRoute({ onOpenUpload }: HomeRouteProps) {
  const { t } = usePreferences();

  return (
    <section className={styles.welcome}>
      <div
        className={styles.heroPanel}
        role="button"
        tabIndex={0}
        onClick={onOpenUpload}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpenUpload();
          }
        }}
      >
        <div className={styles.heroArt} aria-hidden="true">
          <div className={styles.heroGlow} />
          <div className={styles.archiveTile}>
            <span className={styles.archiveIcon}>
              <Archive size={24} />
            </span>
            <span className={styles.archiveLine} />
            <span className={styles.archiveLineShort} />
          </div>
          <span className={styles.archiveBadge}>ZIP</span>
        </div>

        <div className={styles.heroContent}>
          <h2>{t.home.welcome}</h2>
          <p>{t.home.desc1}</p>

          <button
            type="button"
            className={styles.primaryCta}
            onClick={event => {
              event.stopPropagation();
              onOpenUpload();
            }}
          >
            <Upload size={15} />
            <span>{t.actions.importZip}</span>
          </button>

          <p className={styles.helper}>
            {t.importer.multipleHint} {t.home.desc2}
          </p>
        </div>
      </div>
    </section>
  );
}
