import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Message, Profile } from '@/types';

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

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      setLoading(false);
      return;
    }

    // Get unique sender IDs
    const senderIds = [...new Set(data?.map(m => m.sender_id).filter(Boolean) as string[])];

    // Fetch profiles for senders
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', senderIds);

    const profileMap = new Map<string, Profile>();
    profiles?.forEach(p => profileMap.set(p.id, p as Profile));

    const messagesWithSenders = (data || []).map(m => ({
      ...m,
      sender: m.sender_id ? profileMap.get(m.sender_id) : undefined,
    })) as Message[];

    setMessages(messagesWithSenders);
    setLoading(false);
  }, [conversationId, user]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Subscribe to realtime messages
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
          
          // Fetch sender profile
          if (newMessage.sender_id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', newMessage.sender_id)
              .maybeSingle();
            
            newMessage.sender = profile as Profile;
          }

          setMessages(prev => [...prev, newMessage]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const sendMessage = async (content: string, messageType = 'text', metadata = {}) => {
    if (!user || !conversationId) return { error: new Error('Not ready') };

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        message_type: messageType,
        metadata,
      })
      .select()
      .single();

    return { data, error };
  };

  const sendCryptoMessage = async (
    toUserId: string,
    amount: number,
    currency: string,
    txHash?: string
  ) => {
    if (!user || !conversationId) return { error: new Error('Not ready') };

    // Create message
    const { data: messageData, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: `Sent ${amount} ${currency}`,
        message_type: 'crypto',
        metadata: { amount, currency, to_user_id: toUserId },
      })
      .select()
      .single();

    if (messageError) return { error: messageError };

    // Create transaction record
    const { error: txError } = await supabase
      .from('crypto_transactions')
      .insert({
        message_id: messageData.id,
        from_user_id: user.id,
        to_user_id: toUserId,
        amount,
        currency,
        tx_hash: txHash,
        status: txHash ? 'completed' : 'pending',
      });

    if (txError) return { error: txError };

    return { data: messageData, error: null };
  };

  const sendImageMessage = async (file: File) => {
    if (!user || !conversationId) return { error: new Error('Not ready') };

    // Create file path: user_id/conversation_id/timestamp_filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${conversationId}/${Date.now()}.${fileExt}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('chat-attachments')
      .upload(fileName, file);

    if (uploadError) return { error: uploadError };

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(fileName);

    // Determine message type
    const isImage = file.type.startsWith('image/');
    const messageType = isImage ? 'image' : 'file';
    const content = isImage ? 'Đã gửi hình ảnh' : `Đã gửi file: ${file.name}`;

    // Send message
    return sendMessage(content, messageType, {
      file_url: publicUrl,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
    });
  };

  return {
    messages,
    loading,
    sendMessage,
    sendCryptoMessage,
    sendImageMessage,
    fetchMessages,
  };
}
