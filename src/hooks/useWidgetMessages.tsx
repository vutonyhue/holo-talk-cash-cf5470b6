/**
 * Widget Messages Hook
 * Simplified message handling for embedded widgets
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Message } from '@/sdk/types/chat';

interface UseWidgetMessagesResult {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<boolean>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  unreadCount: number;
}

interface UseWidgetMessagesOptions {
  conversationId: string | null;
  userId: string | null;
  canWrite: boolean;
  limit?: number;
}

export function useWidgetMessages({
  conversationId,
  userId,
  canWrite,
  limit = 50,
}: UseWidgetMessagesOptions): UseWidgetMessagesResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Fetch messages
  const fetchMessages = useCallback(async (before?: string) => {
    if (!conversationId) return;

    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('messages')
        .select(`
          *,
          sender:profiles!messages_sender_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (before) {
        query = query.lt('created_at', before);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        setError('Failed to load messages');
        return;
      }

      const formattedMessages: Message[] = (data || []).map(msg => ({
        id: msg.id,
        conversation_id: msg.conversation_id,
        sender_id: msg.sender_id,
        content: msg.content,
        message_type: msg.message_type as Message['message_type'],
        metadata: msg.metadata as Message['metadata'],
        reply_to_id: msg.reply_to_id,
        created_at: msg.created_at,
        updated_at: msg.updated_at,
        is_deleted: msg.is_deleted,
        deleted_at: msg.deleted_at,
        sender: msg.sender as any,
      })).reverse();

      if (before) {
        setMessages(prev => [...formattedMessages, ...prev]);
      } else {
        setMessages(formattedMessages);
      }

      setHasMore((data || []).length === limit);
    } catch {
      setError('Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, limit]);

  // Send message
  const sendMessage = useCallback(async (content: string): Promise<boolean> => {
    if (!conversationId || !userId || !canWrite || !content.trim()) {
      return false;
    }

    try {
      const { error: sendError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: content.trim(),
          message_type: 'text',
        });

      if (sendError) {
        setError('Failed to send message');
        return false;
      }

      return true;
    } catch {
      setError('Failed to send message');
      return false;
    }
  }, [conversationId, userId, canWrite]);

  // Load more
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading || messages.length === 0) return;
    const oldestMessage = messages[0];
    if (oldestMessage?.created_at) {
      await fetchMessages(oldestMessage.created_at);
    }
  }, [hasMore, isLoading, messages, fetchMessages]);

  // Initial fetch
  useEffect(() => {
    if (conversationId) {
      fetchMessages();
    }
  }, [conversationId, fetchMessages]);

  // Real-time subscription
  useEffect(() => {
    if (!conversationId) return;

    channelRef.current = supabase
      .channel(`widget-messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          // Fetch sender info
          const { data: senderData } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .eq('id', payload.new.sender_id)
            .single();

          const newMessage: Message = {
            ...payload.new as any,
            sender: senderData as any,
          };

          setMessages(prev => [...prev, newMessage]);

          // Update unread if not from current user
          if (payload.new.sender_id !== userId) {
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === payload.new.id ? { ...msg, ...payload.new } : msg
            )
          );
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [conversationId, userId]);

  // Reset unread when component focused
  const resetUnread = useCallback(() => {
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    const handleFocus = () => resetUnread();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [resetUnread]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    loadMore,
    hasMore,
    unreadCount,
  };
}
