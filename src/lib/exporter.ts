import { strToU8,zipSync } from 'fflate'
import type { IDBPDatabase } from 'idb'

import type { ConversationSummary, ExportExtraData } from '../types'
import type { SearchBundle } from '../types/search'
import type { ViewerDB } from './db'
import { loadExtraData, loadSearchBundleFromDb } from './db'

export async function exportServerCompatibleZip(db: IDBPDatabase<ViewerDB>): Promise<Blob> {
  const [indexRows, convRows, assetRows] = await Promise.all([
    db.getAll('index'),
    db.getAll('conversations'),
    db.getAll('assets'),
  ])
  const summaryMap = Object.fromEntries(
    indexRows.map((row: ConversationSummary) => [row.id, { title: row.title, last_message_time: row.last_message_time }] as const),
  )
  const [searchBundle, extras] = await Promise.all([loadSearchBundleFromDb(db, summaryMap), loadExtraData(db)])
  const files: Record<string, Uint8Array> = {}
  files['conversations.json'] = strToU8(JSON.stringify(indexRows, null, 2))
  for (const row of convRows) {
    const path = `conversations/${row.id}/conversation.json`
    files[path] = strToU8(JSON.stringify(row.conversationSlim, null, 2))
  }
  for (const asset of assetRows) {
    const arrayBuffer = await asset.blob.arrayBuffer()
    files[asset.key] = new Uint8Array(arrayBuffer)
  }
  const searchPath = 'search_index.json'
  const searchPayload: SearchBundle = searchBundle
  files[searchPath] = strToU8(JSON.stringify(searchPayload))
  appendExtraFiles(files, extras)
  const zipped = zipSync(files, { level: 9 })
  return new Blob([bufferFromU8(zipped)], { type: 'application/zip' })
}

function appendExtraFiles(files: Record<string, Uint8Array>, extras: ExportExtraData) {
  const append = (target: string, data?: unknown) => {
    if (data === undefined) {return}
    files[target] = strToU8(JSON.stringify(data, null, 2))
  }
  append('user.json', extras.user)
  append('message_feedback.json', extras.messageFeedback)
  append('group_chats.json', extras.groupChats)
  append('shopping.json', extras.shopping)
  append('basispoints.json', extras.basisPoints)
  append('sora.json', extras.sora)
  append('generated_files.json', extras.generatedAssets)
}

function bufferFromU8(view: Uint8Array): ArrayBuffer {
  return view.slice().buffer
}
