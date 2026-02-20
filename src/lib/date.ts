const formatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

export function formatConversationDate(ts?: number | null): string {
  if (!ts) {return 'Unknown'}
  try {
    const date = new Date(ts)
    return `${formatter.format(date)} · ${timeFormatter.format(date)}`
  } catch {
    return 'Unknown'
  }
}

export function formatShortDate(ts?: number | null): string {
  if (!ts) {return ''}
  try {
    return formatter.format(new Date(ts))
  } catch {
    return ''
  }
}
