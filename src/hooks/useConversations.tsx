import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Conversation, Message, Profile } from '@/types';
import { api } from '@/lib/api';

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }

    fetchConversations();
  }, [user]);

  const fetchConversations = async () => {
    if (!user) return;

    setLoading(true);

    try {
      // Use API client instead of direct Supabase call
      const response = await api.conversations.list();

      if (!response.ok || !response.data) {
        console.error('[useConversations] Error fetching:', response.error);
        setLoading(false);
        return;
      }

      // Transform API response to Conversation type
      const conversationsWithDetails = response.data.conversations.map(conv => ({
        ...conv,
        members: conv.members?.map(m => ({
          ...m,
          profile: m.profile as Profile,
        })),
        last_message: conv.last_message as Message | undefined,
      })) as Conversation[];

      setConversations(conversationsWithDetails);
    } catch (error) {
      console.error('[useConversations] Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const createConversation = async (memberIds: string[], name?: string, isGroup = false) => {
    if (!user) return { error: new Error('Not logged in') };

    // For 1-on-1 chats, check if conversation already exists in local state
    if (!isGroup && memberIds.length === 1) {
      const otherUserId = memberIds[0];
      
      const existingConv = conversations.find(conv => {
        if (conv.is_group) return false;
        const memberUserIds = conv.members?.map(m => m.user_id) || [];
        return memberUserIds.length === 2 && 
               memberUserIds.includes(user.id) && 
               memberUserIds.includes(otherUserId);
      });
      
      if (existingConv) {
        return { data: existingConv, error: null };
      }

      // Check for existing direct conversation via API
      try {
        const findResponse = await api.conversations.findDirectConversation(otherUserId);
        if (findResponse.ok && findResponse.data) {
          await fetchConversations();
          return { data: findResponse.data, error: null };
        }
      } catch (e) {
        // Continue to create new conversation
      }
    }

    // Create new conversation via API
    try {
      const response = await api.conversations.create({
        member_ids: memberIds,
        name: isGroup ? name : undefined,
        is_group: isGroup,
      });

      if (!response.ok) {
        return { error: new Error(response.error?.message || 'Failed to create conversation') };
      }

      await fetchConversations();
      return { data: response.data, error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const deleteConversation = async (conversationId: string) => {
    if (!user) return { error: new Error('Not logged in') };

    try {
      const response = await api.conversations.leave(conversationId);

      if (!response.ok) {
        return { error: new Error(response.error?.message || 'Failed to leave conversation') };
      }

      // Optimistic update
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  return {
    conversations,
    loading,
    fetchConversations,
    createConversation,
    deleteConversation,
  };
}
