import { type ImportBundle, type ImportParseProgress, parseExportZips } from './importer';

interface ParseRequestMessage {
  type: 'parse';
  files: File[];
}

interface ParseProgressMessage {
  type: 'progress';
  progress: ImportParseProgress;
}

interface ParseCompleteMessage {
  type: 'done';
  bundle: ImportBundle;
}

interface ParseErrorMessage {
  type: 'error';
  error: string;
}

type WorkerResponseMessage = ParseProgressMessage | ParseCompleteMessage | ParseErrorMessage;

export interface ImportWorkerClientOptions {
  onProgress?: (progress: ImportParseProgress) => void;
}

export async function parseExportZipsInWorker(files: File[], options: ImportWorkerClientOptions = {}): Promise<ImportBundle> {
  if (typeof Worker === 'undefined') {
    return parseExportZips(files, { onProgress: options.onProgress });
  }

  const worker = new Worker(new URL('../workers/importWorker.ts', import.meta.url), {
    type: 'module',
  });

  return new Promise<ImportBundle>((resolve, reject) => {
    let active = true;
    worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
      if (!active) {
        return;
      }
      const message = event.data;
      if (message.type === 'progress') {
        options.onProgress?.(message.progress);
        return;
      }
      if (message.type === 'done') {
        active = false;
        // Delay termination slightly to ensure all messages are processed
        setTimeout(() => worker.terminate(), 50);
        resolve(message.bundle);
        return;
      }
      if (message.type === 'error') {
        active = false;
        worker.terminate();
        reject(new Error(message.error));
      }
    };
    worker.onerror = event => {
      if (!active) {
        return;
      }
      active = false;
      worker.terminate();
      reject(new Error(event.message || 'Import worker failed'));
    };

    const request: ParseRequestMessage = { type: 'parse', files };
    worker.postMessage(request);
  });
}
