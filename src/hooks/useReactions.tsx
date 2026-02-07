import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import { api } from '@/lib/api';
import { ReactionEventData } from '@/realtime/events';

export interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
  hasReacted: boolean;
}

export function useReactions(conversationId: string | null) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<Map<string, Reaction[]>>(new Map());

  const fetchReactions = useCallback(async (messageIds: string[]) => {
    if (!messageIds.length) return;

    try {
      const response = await api.reactions.getForMessages(messageIds);

      if (!response.ok || !response.data) {
        console.error('[useReactions] Error fetching:', response.error);
        return;
      }

      const reactionMap = new Map<string, Reaction[]>();
      (response.data.reactions || []).forEach((r: Reaction) => {
        const existing = reactionMap.get(r.message_id) || [];
        reactionMap.set(r.message_id, [...existing, r]);
      });

      setReactions(reactionMap);
    } catch (error) {
      console.error('[useReactions] Fetch error:', error);
    }
  }, []);

  // Handle SSE reaction:added event
  const handleReactionAdded = useCallback((reaction: ReactionEventData) => {
    setReactions(prev => {
      const updated = new Map(prev);
      const existing = updated.get(reaction.message_id) || [];
      // Avoid duplicates
      if (!existing.some(r => r.id === reaction.id)) {
        updated.set(reaction.message_id, [...existing, reaction as Reaction]);
      }
      return updated;
    });
  }, []);

  // Handle SSE reaction:removed event
  const handleReactionRemoved = useCallback((reaction: ReactionEventData) => {
    setReactions(prev => {
      const updated = new Map(prev);
      const existing = updated.get(reaction.message_id) || [];
      updated.set(reaction.message_id, existing.filter(r => r.id !== reaction.id));
      return updated;
    });
  }, []);

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;

    const messageReactions = reactions.get(messageId) || [];
    const existingReaction = messageReactions.find(
      r => r.emoji === emoji && r.user_id === user.id
    );

    if (existingReaction) {
      // Optimistic update - remove immediately
      setReactions(prev => {
        const updated = new Map(prev);
        const existing = updated.get(messageId) || [];
        updated.set(messageId, existing.filter(r => r.id !== existingReaction.id));
        return updated;
      });

      // Then delete via API
      try {
        const response = await api.reactions.remove(existingReaction.id);
        if (!response.ok) {
          console.error('[useReactions] Error removing:', response.error);
          // Rollback on error
          fetchReactions([messageId]);
        }
      } catch (error) {
        console.error('[useReactions] Remove error:', error);
        fetchReactions([messageId]);
      }
    } else {
      // Optimistic update - add immediately with temp ID
      const tempReaction: Reaction = {
        id: `temp-${Date.now()}`,
        message_id: messageId,
        user_id: user.id,
        emoji,
        created_at: new Date().toISOString(),
      };
      
      setReactions(prev => {
        const updated = new Map(prev);
        const existing = updated.get(messageId) || [];
        updated.set(messageId, [...existing, tempReaction]);
        return updated;
      });

      // Then add via API
      try {
        const response = await api.reactions.add(messageId, emoji);
        if (!response.ok) {
          console.error('[useReactions] Error adding:', response.error);
          // Rollback on error
          setReactions(prev => {
            const updated = new Map(prev);
            const existing = updated.get(messageId) || [];
            updated.set(messageId, existing.filter(r => r.id !== tempReaction.id));
            return updated;
          });
        }
      } catch (error) {
        console.error('[useReactions] Add error:', error);
        setReactions(prev => {
          const updated = new Map(prev);
          const existing = updated.get(messageId) || [];
          updated.set(messageId, existing.filter(r => r.id !== tempReaction.id));
          return updated;
        });
      }
    }
  };

  const getReactionGroups = (messageId: string): ReactionGroup[] => {
    const messageReactions = reactions.get(messageId) || [];
    const groups = new Map<string, { count: number; userIds: string[] }>();

    messageReactions.forEach(r => {
      const existing = groups.get(r.emoji) || { count: 0, userIds: [] };
      groups.set(r.emoji, {
        count: existing.count + 1,
        userIds: [...existing.userIds, r.user_id],
      });
    });

    return Array.from(groups.entries()).map(([emoji, data]) => ({
      emoji,
      count: data.count,
      userIds: data.userIds,
      hasReacted: user ? data.userIds.includes(user.id) : false,
    }));
  };

  return {
    reactions,
    fetchReactions,
    toggleReaction,
    getReactionGroups,
    handleReactionAdded,
    handleReactionRemoved,
  };
}
