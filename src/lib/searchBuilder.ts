import type { Conversation, Message } from '../types'
import type { SearchLine } from '../types/search'
import { isStructuredJsonBlock } from './systemPayload'
import { buildTrigrams,linesFromText } from './text'

export interface SearchComputationResult {
  lines: SearchLine[]
  grams: string[]
}

export function buildSearchData(conversation: Conversation): SearchComputationResult {
  const lines: SearchLine[] = []
  const gramSource: string[] = []
  conversation.messages.forEach((message) => {
    if (!shouldIndexMessage(message)) {
      return
    }
    message.blocks.forEach((block, blockIndex) => {
      if (block.type === 'markdown' && isStructuredJsonBlock(block)) {
        return
      }
      if (block.type === 'markdown' || block.type === 'code' || block.type === 'transcript') {
        const text = block.text ?? ''
        const blockLines = linesFromText(text)
        blockLines.forEach((line, lineNo) => {
          lines.push({
            loc: {
              conversationId: conversation.id,
              messageId: message.id,
              blockIndex,
              lineNo,
            },
            text: line,
          })
        })
        gramSource.push(text)
      }
    })
  })
  const grams = Array.from(new Set(buildTrigrams(gramSource.join('\n'))))
  return { lines, grams }
}

function shouldIndexMessage(message: Message): boolean {
  if (message.role === 'user') {return true}
  if (message.role === 'assistant') {
    if (message.recipient && message.recipient !== 'all') {return false}
    return true
  }
  return false
}
