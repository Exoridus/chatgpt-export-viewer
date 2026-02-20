/// <reference lib="webworker" />

import { type ImportBundle, type ImportParseProgress,parseExportZips } from '../lib/importer'

interface ParseRequestMessage {
  type: 'parse'
  files: File[]
}

interface ParseProgressMessage {
  type: 'progress'
  progress: ImportParseProgress
}

interface ParseCompleteMessage {
  type: 'done'
  bundle: ImportBundle
}

interface ParseErrorMessage {
  type: 'error'
  error: string
}

type WorkerRequestMessage = ParseRequestMessage
type WorkerResponseMessage = ParseProgressMessage | ParseCompleteMessage | ParseErrorMessage

const worker = self as DedicatedWorkerGlobalScope

worker.onmessage = async (event: MessageEvent<WorkerRequestMessage>) => {
  if (event.data.type !== 'parse') {
    return
  }
  try {
    const bundle = await parseExportZips(event.data.files, {
      onProgress(progress) {
        const message: ParseProgressMessage = { type: 'progress', progress }
        worker.postMessage(message)
      },
    })
    const done: ParseCompleteMessage = { type: 'done', bundle }
    worker.postMessage(done)
  } catch (error) {
    const response: ParseErrorMessage = {
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    }
    worker.postMessage(response)
  }
}

export type { WorkerRequestMessage, WorkerResponseMessage }
