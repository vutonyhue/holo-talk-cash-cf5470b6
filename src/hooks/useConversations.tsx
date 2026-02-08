import { useState, useEffect } from 'react';
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

      if (!response.ok) {
        console.error('[useConversations] Error fetching:', response.error);
        setConversations([]);
        return;
      }

      if (!response.data) {
        // Treat null/undefined as empty state (e.g. backend returns { ok:true, data:null })
        setConversations([]);
        return;
      }

      // Transform API response to Conversation type
      // Handle both wrapped format { conversations: [...] } and raw array [...]
      const rawConversations = (response.data as any).conversations || response.data;
      const conversationsArray = Array.isArray(rawConversations) ? rawConversations : [];
      
      const conversationsWithDetails = conversationsArray.map(conv => ({
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
    if (import.meta.env.DEV) {
      console.log('[createConversation] Starting:', { memberIds, name, isGroup, hasUser: !!user, userId: user?.id });
    }

    if (!user) {
      console.error('[createConversation] No user logged in');
      return { error: new Error('Not logged in') };
    }

    // For 1-on-1 chats, check if conversation already exists in local state
    if (!isGroup && memberIds.length === 1) {
      const otherUserId = memberIds[0];
      if (import.meta.env.DEV) {
        console.log('[createConversation] Checking for existing 1-on-1 conversation with:', otherUserId);
      }
      
      const existingConv = conversations.find(conv => {
        if (conv.is_group) return false;
        const memberUserIds = conv.members?.map(m => m.user_id) || [];
        return memberUserIds.length === 2 && 
               memberUserIds.includes(user.id) && 
               memberUserIds.includes(otherUserId);
      });
      
      if (existingConv) {
        if (import.meta.env.DEV) {
          console.log('[createConversation] Found existing conversation in local state:', existingConv.id);
        }
        return { data: existingConv, error: null };
      }

      // Check for existing direct conversation via API
      try {
        if (import.meta.env.DEV) {
          console.log('[createConversation] Checking via API findDirectConversation...');
        }
        const findResponse = await api.conversations.findDirectConversation(otherUserId);
        if (import.meta.env.DEV) console.log('[createConversation] findDirectConversation response:', findResponse);

        if (findResponse.ok && findResponse.data?.id) {
          await fetchConversations();
          return { data: findResponse.data, error: null };
        }
        if (import.meta.env.DEV) {
          console.log('[createConversation] No existing conversation found, will create new one');
        }
      } catch (e) {
        if (import.meta.env.DEV) {
          console.log('[createConversation] findDirectConversation error (will continue to create):', e);
        }
        // Continue to create new conversation
      }
    }

    // Create new conversation via API
    try {
      if (import.meta.env.DEV) console.log('[createConversation] Creating new conversation via API...');
      const response = await api.conversations.create({
        member_ids: memberIds,
        name: isGroup ? name : undefined,
        is_group: isGroup,
      });
      if (import.meta.env.DEV) console.log('[createConversation] Create response:', response);

      if (!response.ok) {
        console.error('[createConversation] API error:', response.error);
        return { error: new Error(response.error?.message || 'Failed to create conversation') };
      }

      await fetchConversations();
      return { data: response.data, error: null };
    } catch (error: any) {
      console.error('[createConversation] Exception:', error);
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
