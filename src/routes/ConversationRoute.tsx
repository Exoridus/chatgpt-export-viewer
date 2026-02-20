import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'

import { ConversationView } from '../components/viewer/ConversationView'
import { useAppData } from '../state/AppDataContext'
import type { Conversation } from '../types'

interface HitState {
  messageId: string
  blockIndex: number
  lineNo: number
  query: string
}

export function ConversationRoute() {
  const { conversationId } = useParams()
  const location = useLocation()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeHit, setActiveHit] = useState<HitState | null>(null)
  const { getConversation } = useAppData()

  useEffect(() => {
    const state = location.state as { hit?: HitState } | null
    setActiveHit(state?.hit ?? null)
  }, [location.state])

  useEffect(() => {
    if (!conversationId) {return}
    setLoading(true)
    setError(null)
    getConversation(conversationId)
      .then((data) => {
        setConversation(data)
        if (!data) {
          setError('Not found')
        }
      })
      .catch((err) => {
        console.error(err)
        setError('Failed to load conversation')
      })
      .finally(() => setLoading(false))
  }, [conversationId, getConversation])

  if (loading) {
    return <div className="viewer-loading">Loading conversation…</div>
  }

  if (error || !conversation) {
    return (
      <div className="empty-state">
        <h2>{error || 'Conversation not found'}</h2>
        <p>It might not exist locally or on the server yet.</p>
      </div>
    )
  }

  return <ConversationView conversation={conversation} hit={activeHit} onHitConsumed={() => setActiveHit(null)} />
}
