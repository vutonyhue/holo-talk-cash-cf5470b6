import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface ReadReceipt {
  message_id: string;
  user_id: string;
  read_at: string;
}

export function useReadReceipts(conversationId: string, messageIds: string[]) {
  const { user } = useAuth();
  const [readReceipts, setReadReceipts] = useState<Record<string, ReadReceipt[]>>({});
  const markedAsReadRef = useRef<Set<string>>(new Set());

  // Fetch existing read receipts
  useEffect(() => {
    if (!conversationId || messageIds.length === 0) return;

    const fetchReadReceipts = async () => {
      const { data, error } = await supabase
        .from('message_reads')
        .select('*')
        .in('message_id', messageIds);

      if (!error && data) {
        const receiptsMap: Record<string, ReadReceipt[]> = {};
        data.forEach((receipt) => {
          if (!receiptsMap[receipt.message_id]) {
            receiptsMap[receipt.message_id] = [];
          }
          receiptsMap[receipt.message_id].push(receipt);
        });
        setReadReceipts(receiptsMap);
      }
    };

    fetchReadReceipts();
  }, [conversationId, messageIds.join(',')]);

  // Subscribe to realtime read receipts
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`read-receipts:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reads',
        },
        (payload) => {
          const newReceipt = payload.new as ReadReceipt;
          setReadReceipts((prev) => {
            const existing = prev[newReceipt.message_id] || [];
            // Avoid duplicates
            if (existing.some(r => r.user_id === newReceipt.user_id)) {
              return prev;
            }
            return {
              ...prev,
              [newReceipt.message_id]: [...existing, newReceipt],
            };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Mark messages as read
  const markAsRead = useCallback(async (messageIdsToMark: string[]) => {
    if (!user) return;

    // Filter out already marked messages
    const newMessageIds = messageIdsToMark.filter(
      (id) => !markedAsReadRef.current.has(id)
    );

    if (newMessageIds.length === 0) return;

    // Mark as pending
    newMessageIds.forEach((id) => markedAsReadRef.current.add(id));

    try {
      // Check which messages are already read to avoid duplicate insert errors
      const { data: existingReads } = await supabase
        .from('message_reads')
        .select('message_id')
        .in('message_id', newMessageIds)
        .eq('user_id', user.id);

      const existingIds = new Set(existingReads?.map(r => r.message_id) || []);
      const toInsert = newMessageIds.filter(id => !existingIds.has(id));

      if (toInsert.length === 0) return;

      // Insert only new read receipts
      const inserts = toInsert.map((messageId) => ({
        message_id: messageId,
        user_id: user.id,
      }));

      const { error } = await supabase
        .from('message_reads')
        .insert(inserts);

      if (error) {
        // Remove from pending if failed
        toInsert.forEach((id) => markedAsReadRef.current.delete(id));
        console.error('Error marking messages as read:', error);
      }
    } catch (err) {
      // Remove from pending if failed
      newMessageIds.forEach((id) => markedAsReadRef.current.delete(id));
      console.error('Error marking messages as read:', err);
    }
  }, [user]);

  // Check if message is read by anyone other than sender
  const isReadByOthers = useCallback((messageId: string, senderId: string) => {
    const receipts = readReceipts[messageId] || [];
    return receipts.some((r) => r.user_id !== senderId);
  }, [readReceipts]);

  // Get read count (excluding sender)
  const getReadCount = useCallback((messageId: string, senderId: string) => {
    const receipts = readReceipts[messageId] || [];
    return receipts.filter((r) => r.user_id !== senderId).length;
  }, [readReceipts]);

  // Get the latest read time (excluding sender)
  const getReadTime = useCallback((messageId: string, senderId: string): string | null => {
    const receipts = readReceipts[messageId] || [];
    const otherReceipts = receipts.filter((r) => r.user_id !== senderId);
    if (otherReceipts.length === 0) return null;
    // Return the latest read time
    const latestReceipt = otherReceipts.reduce((latest, current) => 
      new Date(current.read_at) > new Date(latest.read_at) ? current : latest
    );
    return latestReceipt.read_at;
  }, [readReceipts]);

  return {
    readReceipts,
    markAsRead,
    isReadByOthers,
    getReadCount,
    getReadTime,
  };
}
