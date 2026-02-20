/// <reference lib="webworker" />
import { buildTrigrams, normalizeSearchText } from '../lib/text'
import type { SearchBundle, SearchHit, SearchLine } from '../types/search'

type SearchRequest = {
  type: 'search'
  id: number
  query: string
  limit?: number
}

type InitRequest = {
  type: 'init'
  payload: SearchBundle
}

type WorkerRequest = SearchRequest | InitRequest

type WorkerResponse = {
  type: 'result'
  id: number
  hits: SearchHit[]
}

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope

let searchData: SearchBundle | null = null
let postings = new Map<string, Set<string>>()
const lineBuckets = new Map<string, SearchLine[]>()
const blockBuckets = new Map<string, SearchLine[]>()

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  if (message.type === 'init') {
    searchData = message.payload
    buildIndexes(searchData)
    return
  }
  if (message.type === 'search') {
    const hits = performSearch(message.query, message.limit ?? 40)
    const response: WorkerResponse = { type: 'result', id: message.id, hits }
    ctx.postMessage(response)
  }
}

function buildIndexes(bundle: SearchBundle) {
  postings = new Map()
  lineBuckets.clear()
  blockBuckets.clear()
  Object.entries(bundle.grams).forEach(([gram, ids]) => {
    postings.set(gram, new Set(ids))
  })
  Object.entries(bundle.linesByConversation).forEach(([conversationId, lines]) => {
    const sorted = [...lines].sort((a, b) => a.loc.lineNo - b.loc.lineNo)
    lineBuckets.set(conversationId, sorted)
    sorted.forEach((line) => {
      const key = blockKey(line)
      if (!blockBuckets.has(key)) {
        blockBuckets.set(key, [])
      }
      blockBuckets.get(key)!.push(line)
    })
  })
  for (const bucket of blockBuckets.values()) {
    bucket.sort((a, b) => a.loc.lineNo - b.loc.lineNo)
  }
}

function performSearch(query: string, limit: number): SearchHit[] {
  if (!searchData) {return []}
  const normalized = normalizeSearchText(query)
  if (!normalized || normalized.length < 3) {return []}
  const grams = buildTrigrams(query)
  if (!grams.length) {return []}
  let candidateIds: Set<string> | null = null
  for (const gram of grams) {
    const ids = postings.get(gram)
    if (!ids) {return []}
    candidateIds = candidateIds ? intersectSets(candidateIds, ids) : new Set(ids)
    if (!candidateIds.size) {return []}
  }
  if (!candidateIds) {return []}
  const hits: SearchHit[] = []
  const rawNeedle = query.trim()
  const loweredNeedle = rawNeedle.toLocaleLowerCase()
  for (const conversationId of candidateIds) {
    if (hits.length >= limit) {break}
    const lines = lineBuckets.get(conversationId) ?? []
    for (const line of lines) {
      if (hits.length >= limit) {break}
      const textLower = line.text.toLocaleLowerCase()
      const idx = textLower.indexOf(loweredNeedle)
      if (idx === -1) {continue}
      const snippet = buildSnippet(line, idx, rawNeedle.length)
      const summaryInfo = searchData.summaryMap[conversationId]
      hits.push({
        conversationId,
        conversationTitle: summaryInfo?.title ?? 'Conversation',
        conversationTime: summaryInfo?.last_message_time,
        messageId: line.loc.messageId,
        blockIndex: line.loc.blockIndex,
        lineNo: line.loc.lineNo,
        snippet,
      })
    }
  }
  return hits.slice(0, limit)
}

function buildSnippet(line: SearchLine, start: number, length: number) {
  const block = blockBuckets.get(blockKey(line)) ?? []
  const index = block.findIndex((entry) => entry.loc.lineNo === line.loc.lineNo)
  const contextBefore = index > 0 ? block.slice(Math.max(0, index - 2), index).map((entry) => entry.text) : []
  const contextAfter = block.slice(index + 1, index + 3).map((entry) => entry.text)
  const before = line.text.slice(0, start)
  const match = line.text.slice(start, start + length)
  const after = line.text.slice(start + length)
  return { before, match, after, contextBefore, contextAfter }
}

function blockKey(line: SearchLine): string {
  return `${line.loc.conversationId}|${line.loc.messageId}|${line.loc.blockIndex}`
}

function intersectSets(a: Set<string>, b: Set<string>): Set<string> {
  const result = new Set<string>()
  const smaller = a.size < b.size ? a : b
  const larger = a.size < b.size ? b : a
  smaller.forEach((value) => {
    if (larger.has(value)) {
      result.add(value)
    }
  })
  return result
}
