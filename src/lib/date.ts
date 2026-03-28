const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatConversationDate(ts?: number | null): string {
  const normalized = normalizeTimestamp(ts);
  if (!normalized) {
    return '';
  }
  try {
    return dateTimeFormatter.format(new Date(normalized));
  } catch {
    return '';
  }
}

export function formatShortDate(ts?: number | null): string {
  const normalized = normalizeTimestamp(ts);
  if (!normalized) {
    return '';
  }
  try {
    return dateFormatter.format(new Date(normalized));
  } catch {
    return '';
  }
}

function normalizeTimestamp(ts?: number | null): number | null {
  if (!ts || !Number.isFinite(ts)) {
    return null;
  }
  return ts > 10_000_000_000 ? ts : ts * 1000;
}
