/// <reference lib="webworker" />

import { exportFullWorkingZipFromDatabase, type ExportProgressState } from '../lib/exporter';

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

type WorkerRequestMessage = ExportRequestMessage;
type WorkerResponseMessage = ExportProgressMessage | ExportDoneMessage | ExportErrorMessage;

const worker = self as DedicatedWorkerGlobalScope;

worker.onmessage = async (event: MessageEvent<WorkerRequestMessage>) => {
  if (event.data.type !== 'export') {
    return;
  }
  try {
    const blob = await exportFullWorkingZipFromDatabase({
      onProgress(progress) {
        const response: ExportProgressMessage = {
          type: 'progress',
          progress,
        };
        worker.postMessage(response);
      },
    });
    const done: ExportDoneMessage = {
      type: 'done',
      blob,
    };
    worker.postMessage(done);
  } catch (error) {
    const response: ExportErrorMessage = {
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
    worker.postMessage(response);
  }
};

export type { WorkerRequestMessage, WorkerResponseMessage };
