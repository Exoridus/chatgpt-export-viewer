import type { ExportProgressState } from './exporter';

interface ExportRequestMessage {
  type: 'export';
}

interface ExportProgressMessage {
  type: 'progress';
  progress: ExportProgressState;
}

interface ExportDoneMessage {
  type: 'done';
  blob: Blob;
}

interface ExportErrorMessage {
  type: 'error';
  error: string;
}

type WorkerResponseMessage = ExportProgressMessage | ExportDoneMessage | ExportErrorMessage;

export async function buildExportZipInWorker(options: { onProgress?: (progress: ExportProgressState) => void } = {}): Promise<Blob> {
  const worker = new Worker(new URL('../workers/exportWorker.ts', import.meta.url), {
    type: 'module',
  });

  return new Promise<Blob>((resolve, reject) => {
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
        worker.terminate();
        resolve(message.blob);
        return;
      }
      active = false;
      worker.terminate();
      reject(new Error(message.error));
    };
    worker.onerror = event => {
      if (!active) {
        return;
      }
      active = false;
      worker.terminate();
      reject(new Error(event.message || 'Export worker failed'));
    };

    const request: ExportRequestMessage = {
      type: 'export',
    };
    worker.postMessage(request);
  });
}
