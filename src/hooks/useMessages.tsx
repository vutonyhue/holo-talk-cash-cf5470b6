import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import { useSSE } from '@/realtime/useSSE';
import { Message, Profile } from '@/types';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { MessageEventData, TypingEventData, ReactionEventData, ReadReceiptEventData } from '@/realtime/events';

interface UseMessagesOptions {
  onTyping?: (users: TypingEventData[]) => void;
  onReactionAdded?: (reaction: ReactionEventData) => void;
  onReactionRemoved?: (reaction: ReactionEventData) => void;
  onReadReceipt?: (receipt: ReadReceiptEventData) => void;
}

export function useMessages(conversationId: string | null, options?: UseMessagesOptions) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);

  // Fetch current user profile for optimistic updates
  useEffect(() => {
    if (!user?.id) return;
    
    const fetchProfile = async () => {
      try {
        const response = await api.users.getProfile(user.id);
        if (response.ok && response.data) {
          setUserProfile({
            id: response.data.id,
            username: response.data.username,
            display_name: response.data.display_name,
            avatar_url: response.data.avatar_url,
            wallet_address: response.data.wallet_address,
            status: response.data.status || 'online',
            last_seen: response.data.last_seen || new Date().toISOString(),
            created_at: response.data.created_at || new Date().toISOString(),
            updated_at: response.data.updated_at || new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Failed to fetch user profile:', error);
      }
    };
    
    fetchProfile();
  }, [user?.id]);

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

      const raw = (response.data as any).messages ?? response.data;
      const messageArray = Array.isArray(raw) ? raw : [];

      // Transform API response, attach reply_to references
      const messageMap = new Map<string, Message>();
      messageArray.forEach(m => {
        const msg = {
          ...m,
          sender: m.sender as Profile | undefined,
        } as Message;
        messageMap.set(m.id, msg);
      });

      // Attach reply_to references
      const messagesWithReplies = messageArray.map(m => {
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

  // Handle incoming SSE messages
  const handleStreamMessage = useCallback((streamMessage: MessageEventData) => {
    // Convert SSE sender to Profile type with default values
    const sender: Profile | undefined = streamMessage.sender ? {
      id: streamMessage.sender.id,
      username: streamMessage.sender.username,
      display_name: streamMessage.sender.display_name,
      avatar_url: streamMessage.sender.avatar_url,
      wallet_address: null,
      status: 'online',
      last_seen: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } : undefined;

    const message: Message = {
      id: streamMessage.id,
      conversation_id: streamMessage.conversation_id,
      sender_id: streamMessage.sender_id,
      content: streamMessage.content,
      message_type: streamMessage.message_type,
      metadata: streamMessage.metadata,
      created_at: streamMessage.created_at,
      updated_at: streamMessage.updated_at || streamMessage.created_at,
      is_deleted: streamMessage.is_deleted,
      deleted_at: streamMessage.deleted_at,
      reply_to_id: streamMessage.reply_to_id,
      sender,
    };

    setMessages(prev => {
      // Case 1: Skip if message already exists (by ID)
      if (prev.some(m => m.id === message.id)) {
        return prev;
      }

      // Case 2: Own message - check for optimistic update to replace
      if (message.sender_id === user?.id) {
        const optimisticMatch = prev.find(m =>
          m._sending &&
          m.sender_id === message.sender_id &&
          m.content === message.content
        );

        if (optimisticMatch) {
          // Replace optimistic message with real one from server
          return prev.map(m =>
            m.id === optimisticMatch.id
              ? { ...message, _sending: false }
              : m
          );
        }
        // Already handled by API response, skip
        return prev;
      }

      // Case 3: Message from others - add to list
      return [...prev, message];
    });
  }, [user?.id]);

  // Handle message updates (edits, deletions)
  const handleStreamUpdate = useCallback((updatedMessage: MessageEventData) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === updatedMessage.id
          ? { 
              ...m, 
              content: updatedMessage.content,
              is_deleted: updatedMessage.is_deleted,
              deleted_at: updatedMessage.deleted_at,
              updated_at: updatedMessage.updated_at || m.updated_at,
            }
          : m
      )
    );
  }, []);

  // SSE hook - unified realtime connection
  const sseOptions = useMemo(() => ({
    onMessage: handleStreamMessage,
    onMessageUpdate: handleStreamUpdate,
    onTyping: options?.onTyping,
    onReactionAdded: options?.onReactionAdded,
    onReactionRemoved: options?.onReactionRemoved,
    onReadReceipt: options?.onReadReceipt,
    onConnect: () => {
      console.log('[useMessages] SSE connected for conversation:', conversationId);
    },
    onDisconnect: () => {
      console.log('[useMessages] SSE disconnected');
    },
    onError: (error: Error) => {
      console.error('[useMessages] SSE error:', error);
      if (error.message === 'Max reconnection attempts reached') {
        toast.error('Mất kết nối realtime, đang tải lại...');
        fetchMessages(); // Reload messages on connection failure
      }
    },
  }), [handleStreamMessage, handleStreamUpdate, conversationId, fetchMessages, options]);

  // Subscribe to SSE stream
  const { isConnected, isReconnecting, connectionStatus, reconnect } = useSSE(
    conversationId,
    sseOptions
  );

  // Send message with OPTIMISTIC UPDATE
  const sendMessage = async (content: string, messageType = 'text', metadata = {}, replyToId?: string) => {
    if (!user || !conversationId) return { error: new Error('Not ready') };

    // Create temporary message for optimistic update
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const tempMessage: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      message_type: messageType,
      metadata,
      created_at: now,
      updated_at: now,
      is_deleted: false,
      deleted_at: null,
      sender: userProfile || {
        id: user.id,
        username: user.email?.split('@')[0] || 'user',
        display_name: user.email?.split('@')[0] || 'User',
        avatar_url: null,
        wallet_address: null,
        status: 'online',
        last_seen: now,
        created_at: now,
        updated_at: now,
      },
      reply_to_id: replyToId || null,
      _sending: true,
    };

    // Add message to UI immediately (optimistic update)
    setMessages(prev => [...prev, tempMessage]);

    try {
      const response = await api.messages.send(conversationId, {
        content,
        message_type: messageType,
        metadata,
        reply_to_id: replyToId,
      });

      if (!response.ok) {
        // Mark message as failed
        setMessages(prev => 
          prev.map(m => m.id === tempId ? { ...m, _sending: false, _failed: true } : m)
        );
        toast.error(response.error?.message || 'Không thể gửi tin nhắn');
        return { error: new Error(response.error?.message || 'Failed to send message') };
      }

      // Replace temp message with real one from server
      setMessages(prev => 
        prev.map(m => 
          m.id === tempId 
            ? { 
                ...m,
                id: response.data!.id,
                created_at: response.data!.created_at,
                updated_at: response.data!.updated_at || response.data!.created_at,
                _sending: false,
                _failed: false,
              } 
            : m
        )
      );

      return { data: response.data, error: null };
    } catch (error: any) {
      // Mark message as failed
      setMessages(prev => 
        prev.map(m => m.id === tempId ? { ...m, _sending: false, _failed: true } : m)
      );
      toast.error('Lỗi kết nối, không thể gửi tin nhắn');
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

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const tempMessage: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: `Đã gửi ${amount} ${currency}`,
      message_type: 'crypto',
      metadata: { amount, currency, tx_hash: txHash },
      created_at: now,
      updated_at: now,
      is_deleted: false,
      deleted_at: null,
      sender: userProfile || undefined,
      _sending: true,
    };

    setMessages(prev => [...prev, tempMessage]);

    try {
      const response = await api.messages.sendCrypto(conversationId, {
        to_user_id: toUserId,
        amount,
        currency,
        tx_hash: txHash,
      });

      if (!response.ok) {
        setMessages(prev => 
          prev.map(m => m.id === tempId ? { ...m, _sending: false, _failed: true } : m)
        );
        toast.error(response.error?.message || 'Không thể gửi crypto');
        return { error: new Error(response.error?.message || 'Failed to send crypto message') };
      }

      setMessages(prev => 
        prev.map(m => 
          m.id === tempId 
            ? { ...m, id: response.data!.id, _sending: false }
            : m
        )
      );

      return { data: response.data, error: null };
    } catch (error: any) {
      setMessages(prev => 
        prev.map(m => m.id === tempId ? { ...m, _sending: false, _failed: true } : m)
      );
      return { error };
    }
  };

  const sendImageMessage = async (file: File, caption?: string) => {
    if (!user || !conversationId) return { error: new Error('Not ready') };

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    const tempUrl = URL.createObjectURL(file);
    
    const tempMessage: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: caption || 'Đã gửi hình ảnh',
      message_type: 'image',
      metadata: { 
        file_url: tempUrl, 
        file_name: file.name, 
        file_size: file.size,
        file_type: file.type,
        caption 
      },
      created_at: now,
      updated_at: now,
      is_deleted: false,
      deleted_at: null,
      sender: userProfile || undefined,
      _sending: true,
    };

    setMessages(prev => [...prev, tempMessage]);

    try {
      // 1. Get presigned URL from API
      const presignResponse = await api.media.getPresignedUrl({
        filename: file.name,
        contentType: file.type,
        bucket: 'chat-attachments',
        path: `${user.id}/${conversationId}`,
      });

      if (!presignResponse.ok || !presignResponse.data) {
        throw new Error(presignResponse.error?.message || 'Failed to get upload URL');
      }

      // 2. Upload directly to presigned URL
      const uploadRes = await fetch(presignResponse.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!uploadRes.ok) {
        throw new Error('Failed to upload file');
      }

      // 3. Determine message type
      const isImage = file.type.startsWith('image/');
      const messageType = isImage ? 'image' : 'file';
      const content = caption || (isImage ? 'Đã gửi hình ảnh' : `Đã gửi file: ${file.name}`);

      // 4. Send message via API (not calling sendMessage to avoid double optimistic update)
      const response = await api.messages.send(conversationId, {
        content,
        message_type: messageType,
        metadata: {
          file_url: presignResponse.data.publicUrl,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          caption: caption || null,
        },
      });

      if (!response.ok) {
        throw new Error(response.error?.message || 'Failed to send message');
      }

      // Update message with real data
      setMessages(prev => 
        prev.map(m => 
          m.id === tempId 
            ? { 
                ...m, 
                id: response.data!.id,
                metadata: { 
                  ...m.metadata, 
                  file_url: presignResponse.data!.publicUrl 
                },
                _sending: false 
              }
            : m
        )
      );

      URL.revokeObjectURL(tempUrl);
      return { data: response.data, error: null };
    } catch (error: any) {
      setMessages(prev => 
        prev.map(m => m.id === tempId ? { ...m, _sending: false, _failed: true } : m)
      );
      URL.revokeObjectURL(tempUrl);
      toast.error('Không thể gửi hình ảnh');
      return { error };
    }
  };

  const sendVoiceMessage = async (audioBlob: Blob, duration: number) => {
    if (!user || !conversationId) return { error: new Error('Not ready') };

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    const tempUrl = URL.createObjectURL(audioBlob);
    
    const tempMessage: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: 'Tin nhắn thoại',
      message_type: 'voice',
      metadata: { file_url: tempUrl, duration, file_type: 'audio/webm' },
      created_at: now,
      updated_at: now,
      is_deleted: false,
      deleted_at: null,
      sender: userProfile || undefined,
      _sending: true,
    };

    setMessages(prev => [...prev, tempMessage]);

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
        throw new Error(presignResponse.error?.message || 'Failed to get upload URL');
      }

      // 2. Upload directly to presigned URL
      const uploadRes = await fetch(presignResponse.data.uploadUrl, {
        method: 'PUT',
        body: audioBlob,
        headers: { 'Content-Type': 'audio/webm' },
      });

      if (!uploadRes.ok) {
        throw new Error('Failed to upload voice message');
      }

      // 3. Send message via API
      const response = await api.messages.send(conversationId, {
        content: 'Tin nhắn thoại',
        message_type: 'voice',
        metadata: {
          file_url: presignResponse.data.publicUrl,
          duration: duration,
          file_type: 'audio/webm',
        },
      });

      if (!response.ok) {
        throw new Error(response.error?.message || 'Failed to send voice message');
      }

      setMessages(prev => 
        prev.map(m => 
          m.id === tempId 
            ? { 
                ...m, 
                id: response.data!.id,
                metadata: { ...m.metadata, file_url: presignResponse.data!.publicUrl },
                _sending: false 
              }
            : m
        )
      );

      URL.revokeObjectURL(tempUrl);
      return { data: response.data, error: null };
    } catch (error: any) {
      setMessages(prev => 
        prev.map(m => m.id === tempId ? { ...m, _sending: false, _failed: true } : m)
      );
      URL.revokeObjectURL(tempUrl);
      toast.error('Không thể gửi tin nhắn thoại');
      return { error };
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    // Optimistic update - mark as deleted immediately
    setMessages(prev => 
      prev.map(m => 
        m.id === messageId 
          ? { ...m, is_deleted: true, deleted_at: new Date().toISOString() } 
          : m
      )
    );

    try {
      const response = await api.messages.delete(messageId);

      if (!response.ok) {
        // Rollback on failure
        setMessages(prev => 
          prev.map(m => 
            m.id === messageId 
              ? { ...m, is_deleted: false, deleted_at: null } 
              : m
          )
        );
        toast.error('Không thể xóa tin nhắn');
        return { error: new Error(response.error?.message || 'Failed to delete message') };
      }

      return { error: null };
    } catch (error: any) {
      // Rollback on error
      setMessages(prev => 
        prev.map(m => 
          m.id === messageId 
            ? { ...m, is_deleted: false, deleted_at: null } 
            : m
        )
      );
      return { error };
    }
  };

  // Retry failed message
  const retryMessage = async (tempMessageId: string) => {
    const failedMessage = messages.find(m => m.id === tempMessageId && m._failed);
    if (!failedMessage) return;

    // Remove failed message
    setMessages(prev => prev.filter(m => m.id !== tempMessageId));
    
    // Resend based on message type
    if (failedMessage.message_type === 'text') {
      await sendMessage(
        failedMessage.content || '', 
        failedMessage.message_type, 
        failedMessage.metadata,
        failedMessage.reply_to_id || undefined
      );
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
    retryMessage,
    fetchMessages,
    // SSE connection status
    isConnected,
    isReconnecting,
    connectionStatus,
    reconnect,
  };
}
