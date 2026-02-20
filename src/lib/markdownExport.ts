import type { Conversation, Message } from '../types'
import { triggerDownload } from './download'
import { sanitizeRenderedMarkdown } from './text'

export function exportConversationMarkdown(conversation: Conversation) {
  const lines: string[] = []
  lines.push(`# ${conversation.title}`)
  lines.push('')
  conversation.messages.forEach((message) => {
    lines.push(`## ${message.role.toUpperCase()}`)
    if (message.time) {
      lines.push(new Date(message.time).toLocaleString())
    }
    lines.push('')
    appendBlocks(lines, message.blocks)
    if (message.variants?.length) {
      message.variants.forEach((variant, index) => {
        lines.push(`<details>
<summary>Variant ${index + 1}</summary>`)
        appendBlocks(lines, variant.blocks)
        lines.push('</details>')
      })
    }
    if (message.details) {
      lines.push('<details>')
      lines.push('<summary>Details</summary>')
      if (message.details.thinking) {lines.push(`Thinking:\n${message.details.thinking}`)}
      if (message.details.tool) {lines.push(`Tool:\n${message.details.tool.content}`)}
      if (message.details.search) {lines.push(`Search:\n${message.details.search.content}`)}
      if (message.details.data) {
        lines.push('Metadata:')
        lines.push('```json')
        lines.push(JSON.stringify(message.details.data, null, 2))
        lines.push('```')
      }
      lines.push('</details>')
    }
    lines.push('')
  })
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  triggerDownload(blob, `${conversation.title || conversation.id}.md`)
}

function appendBlocks(lines: string[], blocks: Message['blocks']) {
  blocks.forEach((block) => {
    if (block.type === 'markdown') {
      lines.push(sanitizeRenderedMarkdown(block.text))
    } else if (block.type === 'code') {
      lines.push(`\`\`\`${  block.lang ?? ''}`)
      lines.push(block.text)
      lines.push('```')
    } else if (block.type === 'asset') {
      lines.push(`![${block.alt ?? block.asset_pointer}](${block.asset_pointer})`)
    } else if (block.type === 'transcript') {
      lines.push('```')
      lines.push(block.text)
      lines.push('```')
    }
  })
}
