import type { Block } from '../types'

export interface StructuredSearchQuery {
  query: string
  recency?: number
  domains?: string[]
}

export interface StructuredSearchMeta {
  responseLength?: string
}

export interface StructuredSearchResult {
  queries: StructuredSearchQuery[]
  meta: StructuredSearchMeta
}

export function tryParseJsonText(value: string): unknown | null {
  const trimmed = value.trim()
  if (!trimmed) {return null}
  const startsWithBrace = trimmed.startsWith('{') || trimmed.startsWith('[')
  const endsWithBrace = trimmed.endsWith('}') || trimmed.endsWith(']')
  if (!startsWithBrace || !endsWithBrace) {return null}
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

export function isStructuredJsonBlock(block: Block): boolean {
  if (block.type !== 'markdown') {return false}
  return tryParseJsonText(block.text ?? '') !== null
}

export function parseSearchPayloadFromUnknown(payload: unknown): StructuredSearchResult | null {
  const queries = extractSearchQueryList(payload)
  if (!queries || !queries.length) {
    return null
  }
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  const responseLength =
    record && typeof record.response_length === 'string' ? (record.response_length as string) : undefined
  return {
    queries,
    meta: { responseLength },
  }
}

export function parseSearchPayloadFromString(raw: string): StructuredSearchResult | null {
  const trimmed = raw.trim()
  if (!trimmed) {return null}
  const variants = buildSearchPayloadVariants(trimmed)
  for (const candidate of variants) {
    const parsed = tryParseJsonText(candidate)
    if (!parsed) {continue}
    const interpreted = parseSearchPayloadFromUnknown(parsed)
    if (interpreted) {
      return interpreted
    }
  }
  return null
}

export function buildSearchPayloadVariants(value: string): string[] {
  const variants = [value]
  const mentionsSearch = value.includes('"search_query"')
  const trimmedStart = value.trimStart()
  const trimmedEnd = value.trimEnd()
  const needsLeadingBrace = mentionsSearch && !trimmedStart.startsWith('{') && !trimmedStart.startsWith('[')
  const needsTrailingBrace = mentionsSearch && !trimmedEnd.endsWith('}') && !trimmedEnd.endsWith(']')
  if (needsLeadingBrace || needsTrailingBrace) {
    variants.push(`${needsLeadingBrace ? '{' : ''}${value}${needsTrailingBrace ? '}' : ''}`)
  }
  return Array.from(new Set(variants))
}

function extractSearchQueryList(payload: unknown): StructuredSearchQuery[] | null {
  const list = resolveSearchQueryList(payload)
  if (!list) {return null}
  const queries = list
    .map((entry) => normalizeSearchEntry(entry))
    .filter((entry): entry is StructuredSearchQuery => Boolean(entry))
  return queries.length ? queries : null
}

function resolveSearchQueryList(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) {
    return payload
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (Array.isArray(record.search_query)) {
      return record.search_query
    }
    if (Array.isArray(record.queries)) {
      return record.queries
    }
  }
  return null
}

function normalizeSearchEntry(entry: unknown): StructuredSearchQuery | null {
  if (!entry || typeof entry !== 'object') {return null}
  const record = entry as Record<string, unknown>
  const rawQuery = record.q ?? record.query ?? record.search ?? record.prompt ?? record.text
  if (!rawQuery) {return null}
  return {
    query: String(rawQuery),
    recency: typeof record.recency === 'number' ? record.recency : undefined,
    domains: Array.isArray(record.domains) ? record.domains.map(String) : undefined,
  }
}
