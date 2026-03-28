import clsx from 'clsx'
import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { sanitizeRenderedMarkdown } from '../../lib/text'
import styles from './MarkdownBlock.module.scss'

interface MarkdownBlockProps {
  text: string
  highlight?: boolean
  className?: string
}

export const MarkdownBlock = memo(function MarkdownBlock({ text, highlight, className }: MarkdownBlockProps) {
  const sanitized = sanitizeRenderedMarkdown(text)
  return (
    <div className={clsx(styles.markdownBlock, highlight && styles.hit, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{sanitized}</ReactMarkdown>
    </div>
  )
})
