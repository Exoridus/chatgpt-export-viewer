import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import { ConversationView } from '../components/viewer/ConversationView';
import { useAppData } from '../state/AppDataContext';
import { usePreferences } from '../state/PreferencesContext';
import type { Conversation } from '../types';

interface HitState {
  messageId: string;
  blockIndex: number;
  lineNo: number;
  query: string;
}

export function ConversationRoute() {
  const { conversationId } = useParams();
  const location = useLocation();
  const { t } = usePreferences();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeHit, setActiveHit] = useState<HitState | null>(null);
  const { getConversation, mergedIndex } = useAppData();
  const getConversationRef = useRef(getConversation);
  const activeSummary = mergedIndex.find(item => item.id === conversationId);

  useEffect(() => {
    getConversationRef.current = getConversation;
  }, [getConversation]);

  useEffect(() => {
    const state = location.state as { hit?: HitState } | null;
    setActiveHit(state?.hit ?? null);
  }, [location.state]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }
    setLoading(true);
    setError(null);
    getConversationRef
      .current(conversationId)
      .then(data => {
        setConversation(data);
        if (!data) {
          setError(t.viewer.conversationNotFound);
        }
      })
      .catch(err => {
        console.error(err);
        setError(t.viewer.conversationLoadFailed);
      })
      .finally(() => setLoading(false));
  }, [
    conversationId,
    activeSummary?.last_message_time,
    activeSummary?.source,
    activeSummary?.update_time,
    t.viewer.conversationLoadFailed,
    t.viewer.conversationNotFound,
  ]);

  if (loading) {
    return <div className="viewer-loading">{t.viewer.loadingConversation}</div>;
  }

  if (error || !conversation) {
    return (
      <div className="empty-state">
        <h2>{error || t.viewer.conversationNotFound}</h2>
        <p>{t.viewer.conversationMissingHint}</p>
      </div>
    );
  }

  return <ConversationView conversation={conversation} hit={activeHit} onHitConsumed={() => setActiveHit(null)} />;
}
