import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Message, Profile } from '@/types';
import { api } from '@/lib/api';

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    if (!conversationId || !user) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const response = await api.messages.list(conversationId);

      if (!response.ok || !response.data) {
        console.error('[useMessages] Error fetching:', response.error);
        setLoading(false);
        return;
      }

      // Transform API response, attach reply_to references
      const messageMap = new Map<string, Message>();
      response.data.messages.forEach(m => {
        const msg = {
          ...m,
          sender: m.sender as Profile | undefined,
        } as Message;
        messageMap.set(m.id, msg);
      });

      // Attach reply_to references
      const messagesWithReplies = response.data.messages.map(m => {
        const msg = messageMap.get(m.id)!;
        if (m.reply_to_id && messageMap.has(m.reply_to_id)) {
          msg.reply_to = messageMap.get(m.reply_to_id);
        }
        return msg;
      });

      setMessages(messagesWithReplies);
    } catch (error) {
      console.error('[useMessages] Fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId, user]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Subscribe to realtime messages (INSERT and UPDATE)
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMessage = payload.new as Message;
          
          // Fetch sender profile via API
          if (newMessage.sender_id) {
            try {
              const profileRes = await api.users.getProfile(newMessage.sender_id);
              if (profileRes.ok && profileRes.data) {
                newMessage.sender = profileRes.data as Profile;
              }
            } catch (e) {
              // Fallback: fetch from Supabase directly
              const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', newMessage.sender_id)
                .maybeSingle();
              
              newMessage.sender = profile as Profile;
            }
          }

          setMessages(prev => [...prev, newMessage]);
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
          const updatedMessage = payload.new as Message;
          
          setMessages(prev => 
            prev.map(m => 
              m.id === updatedMessage.id 
                ? { ...m, ...updatedMessage }
                : m
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const sendMessage = async (content: string, messageType = 'text', metadata = {}, replyToId?: string) => {
    if (!user || !conversationId) return { error: new Error('Not ready') };

    try {
      const response = await api.messages.send(conversationId, {
        content,
        message_type: messageType,
        metadata,
        reply_to_id: replyToId,
      });

      if (!response.ok) {
        return { error: new Error(response.error?.message || 'Failed to send message') };
      }

      return { data: response.data, error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const sendCryptoMessage = async (
    toUserId: string,
    amount: number,
    currency: string,
    txHash?: string
  ) => {
    if (!user || !conversationId) return { error: new Error('Not ready') };

    try {
      const response = await api.messages.sendCrypto(conversationId, {
        to_user_id: toUserId,
        amount,
        currency,
        tx_hash: txHash,
      });

      if (!response.ok) {
        return { error: new Error(response.error?.message || 'Failed to send crypto message') };
      }

      return { data: response.data, error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const sendImageMessage = async (file: File, caption?: string) => {
    if (!user || !conversationId) return { error: new Error('Not ready') };

    try {
      // 1. Get presigned URL from API
      const presignResponse = await api.media.getPresignedUrl({
        filename: file.name,
        contentType: file.type,
        bucket: 'chat-attachments',
        path: `${user.id}/${conversationId}`,
      });

      if (!presignResponse.ok || !presignResponse.data) {
        return { error: new Error(presignResponse.error?.message || 'Failed to get upload URL') };
      }

      // 2. Upload directly to presigned URL
      const uploadRes = await fetch(presignResponse.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!uploadRes.ok) {
        return { error: new Error('Failed to upload file') };
      }

      // 3. Determine message type
      const isImage = file.type.startsWith('image/');
      const messageType = isImage ? 'image' : 'file';
      const content = caption || (isImage ? 'Đã gửi hình ảnh' : `Đã gửi file: ${file.name}`);

      // 4. Send message via API
      return sendMessage(content, messageType, {
        file_url: presignResponse.data.publicUrl,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        caption: caption || null,
      });
    } catch (error: any) {
      return { error };
    }
  };

  const sendVoiceMessage = async (audioBlob: Blob, duration: number) => {
    if (!user || !conversationId) return { error: new Error('Not ready') };

    try {
      // 1. Get presigned URL from API
      const filename = `${Date.now()}.webm`;
      const presignResponse = await api.media.getPresignedUrl({
        filename,
        contentType: 'audio/webm',
        bucket: 'chat-attachments',
        path: `${user.id}/${conversationId}`,
      });

      if (!presignResponse.ok || !presignResponse.data) {
        return { error: new Error(presignResponse.error?.message || 'Failed to get upload URL') };
      }

      // 2. Upload directly to presigned URL
      const uploadRes = await fetch(presignResponse.data.uploadUrl, {
        method: 'PUT',
        body: audioBlob,
        headers: { 'Content-Type': 'audio/webm' },
      });

      if (!uploadRes.ok) {
        return { error: new Error('Failed to upload voice message') };
      }

      // 3. Send message via API
      return sendMessage('Tin nhắn thoại', 'voice', {
        file_url: presignResponse.data.publicUrl,
        duration: duration,
        file_type: 'audio/webm',
      });
    } catch (error: any) {
      return { error };
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const response = await api.messages.delete(messageId);

      if (!response.ok) {
        return { error: new Error(response.error?.message || 'Failed to delete message') };
      }

      // Optimistic update
      setMessages(prev => 
        prev.map(m => 
          m.id === messageId 
            ? { ...m, is_deleted: true, deleted_at: new Date().toISOString() } 
            : m
        )
      );

      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  return {
    messages,
    loading,
    sendMessage,
    sendCryptoMessage,
    sendImageMessage,
    sendVoiceMessage,
    deleteMessage,
    fetchMessages,
  };
}
