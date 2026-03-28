import type { ConversationSummary } from '../types';

export function mergeSummaries(server: ConversationSummary[], local: ConversationSummary[]): ConversationSummary[] {
  if (server.length === 0 && local.length === 0) {
    return [];
  }

  const mergedMap = new Map<string, ConversationSummary>();

  // Process server entries first
  for (const entry of server) {
    mergedMap.set(entry.id, entry);
  }

  // Process local entries and choose winner
  for (const localEntry of local) {
    const serverEntry = mergedMap.get(localEntry.id);

    if (shouldUseLocal(serverEntry, localEntry)) {
      mergedMap.set(localEntry.id, localEntry);
    }
  }

  const mergedList = [...mergedMap.values()].map(entry => ({ ...entry }));

  for (const entry of mergedList) {
    if (entry.pinned_time !== undefined && entry.pinned_time !== null) {
      entry.pinned = true;
    } else {
      entry.pinned = false;
      entry.pinned_time = null;
    }
  }

  return sortSummaries(mergedList);
}

export function shouldUseLocal(serverEntry?: ConversationSummary, localEntry?: ConversationSummary): boolean {
  if (localEntry && !serverEntry) {
    return true;
  }
  if (!localEntry) {
    return false;
  }
  if (!serverEntry) {
    return true;
  }
  if (localEntry.last_message_time > serverEntry.last_message_time) {
    return true;
  }
  if (localEntry.last_message_time < serverEntry.last_message_time) {
    return false;
  }
  return true;
}

function sortSummaries(entries: ConversationSummary[]): ConversationSummary[] {
  return entries.sort((a, b) => {
    const aPinned = a.pinned_time !== null && a.pinned_time !== undefined;
    const bPinned = b.pinned_time !== null && b.pinned_time !== undefined;
    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }

    if (aPinned && bPinned) {
      const byPinnedTime = (a.pinned_time ?? 0) - (b.pinned_time ?? 0);
      if (byPinnedTime !== 0) {
        return byPinnedTime;
      }
      const byLastMessagePinned = b.last_message_time - a.last_message_time;
      if (byLastMessagePinned !== 0) {
        return byLastMessagePinned;
      }
      return a.id.localeCompare(b.id);
    }

    const byLastMessage = b.last_message_time - a.last_message_time;
    if (byLastMessage !== 0) {
      return byLastMessage;
    }
    return a.id.localeCompare(b.id);
  });
}
