import clsx from 'clsx'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { sanitizeRenderedMarkdown } from '../../lib/text'

interface MarkdownBlockProps {
  text: string
  highlight?: boolean
}

export function MarkdownBlock({ text, highlight }: MarkdownBlockProps) {
  const sanitized = sanitizeRenderedMarkdown(text)
  return (
    <div className={clsx('markdown-block', highlight && 'hit')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{sanitized}</ReactMarkdown>
    </div>
  )
}
