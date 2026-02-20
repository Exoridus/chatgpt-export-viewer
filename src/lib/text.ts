export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
}

export function buildTrigrams(input: string): string[] {
  const grams: string[] = []
  const normalized = normalizeSearchText(input)
  if (normalized.length < 3) {
    return grams
  }
  for (let i = 0; i <= normalized.length - 3; i += 1) {
    grams.push(normalized.slice(i, i + 3))
  }
  return grams
}

export function linesFromText(text: string): string[] {
  return text.split(/\r?\n/)
}

export function sanitizeRenderedMarkdown(input: string): string {
  return input
    .replace(/[^]*/g, '') // strip private-use citation artifacts like "citeturn0search1"
    .replace(/[]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
