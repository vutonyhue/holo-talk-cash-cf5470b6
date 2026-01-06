import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

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

    const { data, error } = await supabase
      .from('message_reactions')
      .select('*')
      .in('message_id', messageIds);

    if (error) {
      console.error('Error fetching reactions:', error);
      return;
    }

    const reactionMap = new Map<string, Reaction[]>();
    (data || []).forEach((r: Reaction) => {
      const existing = reactionMap.get(r.message_id) || [];
      reactionMap.set(r.message_id, [...existing, r]);
    });

    setReactions(reactionMap);
  }, []);

  // Subscribe to realtime reactions
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`reactions:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newReaction = payload.new as Reaction;
            setReactions(prev => {
              const updated = new Map(prev);
              const existing = updated.get(newReaction.message_id) || [];
              
              // Check if already exists (from optimistic update)
              const existingIndex = existing.findIndex(r => 
                r.id === newReaction.id || 
                (r.user_id === newReaction.user_id && r.emoji === newReaction.emoji)
              );
              
              if (existingIndex >= 0) {
                // Replace temp with real reaction
                const newExisting = [...existing];
                newExisting[existingIndex] = newReaction;
                updated.set(newReaction.message_id, newExisting);
              } else {
                updated.set(newReaction.message_id, [...existing, newReaction]);
              }
              return updated;
            });
          } else if (payload.eventType === 'DELETE') {
            const oldReaction = payload.old as Reaction;
            setReactions(prev => {
              const updated = new Map(prev);
              const existing = updated.get(oldReaction.message_id) || [];
              updated.set(
                oldReaction.message_id,
                existing.filter(r => r.id !== oldReaction.id)
              );
              return updated;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

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

      // Then delete from database
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('id', existingReaction.id);

      if (error) {
        console.error('Error removing reaction:', error);
        // Rollback on error
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

      // Then insert to database
      const { error } = await supabase
        .from('message_reactions')
        .insert({
          message_id: messageId,
          user_id: user.id,
          emoji,
        });

      if (error) {
        console.error('Error adding reaction:', error);
        // Rollback on error
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
  };
}
