import type { ConversationSummary } from '../types'

export function mergeSummaries(
  server: ConversationSummary[],
  local: ConversationSummary[],
  pinnedIds?: Set<string>,
): ConversationSummary[] {
  if (server.length === 0 && local.length === 0) {return []}
  
  const mergedMap = new Map<string, ConversationSummary>()

  // Process server entries first
  for (let i = 0; i < server.length; i++) {
    const entry = server[i]
    mergedMap.set(entry.id, entry)
  }

  // Process local entries and choose winner
  for (let i = 0; i < local.length; i++) {
    const localEntry = local[i]
    const serverEntry = mergedMap.get(localEntry.id)
    
    if (shouldUseLocal(serverEntry, localEntry)) {
      mergedMap.set(localEntry.id, localEntry)
    }
  }

  const mergedList = Array.from(mergedMap.values())
  
  // Apply pinned status
  if (pinnedIds && pinnedIds.size > 0) {
    for (let i = 0; i < mergedList.length; i++) {
      const entry = mergedList[i]
      if (pinnedIds.has(entry.id)) {
        entry.pinned = true
      }
    }
  }

  return sortSummaries(mergedList)
}

export function shouldUseLocal(serverEntry?: ConversationSummary, localEntry?: ConversationSummary): boolean {
  if (localEntry && !serverEntry) {return true}
  if (!localEntry) {return false}
  if (!serverEntry) {return true}
  if (localEntry.last_message_time > serverEntry.last_message_time) {return true}
  if (localEntry.last_message_time < serverEntry.last_message_time) {return false}
  return true
}

function sortSummaries(entries: ConversationSummary[]): ConversationSummary[] {
  return entries.sort((a, b) => {
    // Both pinned or both unpinned -> sort by time
    if (!!a.pinned === !!b.pinned) {
      return b.last_message_time - a.last_message_time
    }
    // a is pinned, b is not -> a comes first
    return a.pinned ? -1 : 1
  })
}
