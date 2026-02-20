export interface SearchLocation {
  conversationId: string
  messageId: string
  blockIndex: number
  lineNo: number
}

export interface SearchLine {
  loc: SearchLocation
  text: string
}

export interface SearchBundle {
  grams: Record<string, string[]>
  linesByConversation: Record<string, SearchLine[]>
  summaryMap: Record<string, { title: string; last_message_time: number }>
}

export interface SearchHit {
  conversationId: string
  conversationTitle: string
  conversationTime?: number
  messageId: string
  blockIndex: number
  lineNo: number
  snippet: {
    before: string
    match: string
    after: string
    contextBefore: string[]
    contextAfter: string[]
  }
}
