import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Message, Profile } from '@/types';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export function useMessages(conversationId: string | null) {
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
    if (!conversationId || !user) return;

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
          
          // Skip if this is our own message (already added via optimistic update)
          if (newMessage.sender_id === user.id) {
            setMessages(prev => {
              // Check if we already have this exact message from server
              const existingRealMessage = prev.find(m => m.id === newMessage.id);
              if (existingRealMessage) return prev;
              
              // Check for matching optimistic message (temp ID, same content)
              const optimisticMatch = prev.find(m => 
                m._sending && 
                m.sender_id === newMessage.sender_id && 
                m.content === newMessage.content
              );
              
              if (optimisticMatch) {
                // Replace optimistic message with real one
                return prev.map(m => 
                  m.id === optimisticMatch.id 
                    ? { ...newMessage, sender: userProfile || m.sender, _sending: false }
                    : m
                );
              }
              
              // Add new message (edge case - shouldn't normally happen)
              return [...prev, { ...newMessage, sender: userProfile || undefined }];
            });
            return;
          }

          // For messages from others, fetch their profile and add
          let senderProfile: Profile | undefined;
          
          if (newMessage.sender_id) {
            try {
              const profileRes = await api.users.getProfile(newMessage.sender_id);
              if (profileRes.ok && profileRes.data) {
                senderProfile = profileRes.data as Profile;
              }
            } catch (e) {
              // Fallback: fetch from Supabase directly
              const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', newMessage.sender_id)
                .maybeSingle();
              
              senderProfile = profile as Profile;
            }
          }

          setMessages(prev => {
            // Check for duplicates
            if (prev.some(m => m.id === newMessage.id)) return prev;
            return [...prev, { ...newMessage, sender: senderProfile }];
          });
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
  }, [conversationId, user, userProfile]);

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
  };
}
