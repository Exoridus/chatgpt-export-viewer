import { createContext, type Dispatch, type ReactNode, type SetStateAction, useCallback, useContext, useMemo, useState } from 'react';

import type { ExportProgressState } from '../lib/exporter';
import { translations } from '../lib/i18n';

export interface ImportProgressState {
  phase: 'idle' | 'processing' | 'saving' | 'complete' | 'error';
  message: string;
  total?: number;
  processed?: number;
  resultCount?: number;
  assetsTotal?: number;
  assetsProcessed?: number;
  currentAssetsTotal?: number;
  currentAssetsProcessed?: number;
  currentArchiveName?: string;
  currentArchiveIndex?: number;
  currentArchiveTotal?: number;
}

export interface ImportExportContextValue {
  importing: boolean;
  exporting: boolean;
  importProgress: ImportProgressState;
  exportProgress: ExportProgressState;
  resetImportProgress: () => void;
}

export interface ImportExportSetters {
  setImporting: Dispatch<SetStateAction<boolean>>;
  setExporting: Dispatch<SetStateAction<boolean>>;
  setImportProgress: Dispatch<SetStateAction<ImportProgressState>>;
  setExportProgress: Dispatch<SetStateAction<ExportProgressState>>;
}

const ImportExportContext = createContext<ImportExportContextValue | undefined>(undefined);
const ImportExportSettersContext = createContext<ImportExportSetters | undefined>(undefined);

export function useImportExport(): ImportExportContextValue {
  const ctx = useContext(ImportExportContext);
  if (!ctx) {
    throw new Error('ImportExportContext missing');
  }
  return ctx;
}

export function useImportExportSetters(): ImportExportSetters {
  const ctx = useContext(ImportExportSettersContext);
  if (!ctx) {
    throw new Error('ImportExportSettersContext missing');
  }
  return ctx;
}

export function ImportExportProvider({ children }: { children: ReactNode }) {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgressState>({
    phase: 'idle',
    message: translations.en.importer.status.idle,
  });
  const [exportProgress, setExportProgress] = useState<ExportProgressState>({
    phase: 'idle',
    message: translations.en.exporter.ready,
  });

  const resetImportProgress = useCallback(() => {
    setImportProgress({ phase: 'idle', message: translations.en.importer.status.idle });
  }, []);

  const value = useMemo(
    () => ({ importing, exporting, importProgress, exportProgress, resetImportProgress }),
    [importing, exporting, importProgress, exportProgress, resetImportProgress]
  );

  const setters = useMemo(() => ({ setImporting, setExporting, setImportProgress, setExportProgress }), []);

  return (
    <ImportExportSettersContext.Provider value={setters}>
      <ImportExportContext.Provider value={value}>{children}</ImportExportContext.Provider>
    </ImportExportSettersContext.Provider>
  );
}
