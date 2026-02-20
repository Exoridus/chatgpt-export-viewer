import type { ConversationSummary } from '../types'

export function mergeSummaries(
  server: ConversationSummary[],
  local: ConversationSummary[],
  pinnedIds?: Set<string>,
): ConversationSummary[] {
  const serverMap = new Map(server.map((summary) => [summary.id, summary]))
  const localMap = new Map(local.map((summary) => [summary.id, summary]))
  const ids = new Set<string>([...serverMap.keys(), ...localMap.keys()])
  const merged: ConversationSummary[] = []
  ids.forEach((id) => {
    const serverEntry = serverMap.get(id)
    const localEntry = localMap.get(id)
    const winner = chooseWinner(serverEntry, localEntry)
    if (winner) {
      const pinnedSource = Boolean(pinnedIds?.has(winner.id) || localEntry?.pinned || winner.pinned)
      merged.push({ ...winner, pinned: pinnedSource })
    }
  })
  return sortSummaries(merged)
}

export function shouldUseLocal(serverEntry?: ConversationSummary, localEntry?: ConversationSummary): boolean {
  if (localEntry && !serverEntry) {return true}
  if (!localEntry) {return false}
  if (!serverEntry) {return true}
  if (localEntry.last_message_time > serverEntry.last_message_time) {return true}
  if (localEntry.last_message_time < serverEntry.last_message_time) {return false}
  return true
}

function chooseWinner(serverEntry?: ConversationSummary, localEntry?: ConversationSummary): ConversationSummary | undefined {
  if (!serverEntry && !localEntry) {return undefined}
  if (shouldUseLocal(serverEntry, localEntry)) {
    return localEntry
  }
  return serverEntry
}

function sortSummaries(entries: ConversationSummary[]): ConversationSummary[] {
  const pinned = entries.filter((entry) => entry.pinned)
  const others = entries.filter((entry) => !entry.pinned)
  const sorter = (a: ConversationSummary, b: ConversationSummary) => b.last_message_time - a.last_message_time
  pinned.sort(sorter)
  others.sort(sorter)
  return [...pinned, ...others]
}
