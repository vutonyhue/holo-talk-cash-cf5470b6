import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

interface ReadReceipt {
  message_id: string;
  user_id: string;
  read_at: string;
}

export function useReadReceipts(conversationId: string, messageIds: string[]) {
  const { user } = useAuth();
  const [readReceipts, setReadReceipts] = useState<Record<string, ReadReceipt[]>>({});
  const markedAsReadRef = useRef<Set<string>>(new Set());
  const pendingFetchRef = useRef<boolean>(false);

  // Fetch existing read receipts via API (debounced)
  useEffect(() => {
    if (!conversationId || messageIds.length === 0) return;
    
    // Skip temp message IDs
    const stableIds = messageIds.filter(id => !id.startsWith('temp_'));
    if (stableIds.length === 0) return;

    // Debounce fetch
    const timer = setTimeout(async () => {
      if (pendingFetchRef.current) return;
      pendingFetchRef.current = true;
      
      try {
        const response = await api.readReceipts.getForMessages(stableIds);

        if (response.ok && response.data) {
          const receiptsMap: Record<string, ReadReceipt[]> = {};
          response.data.receipts.forEach((receipt) => {
            if (!receiptsMap[receipt.message_id]) {
              receiptsMap[receipt.message_id] = [];
            }
            receiptsMap[receipt.message_id].push(receipt);
          });
          setReadReceipts(receiptsMap);
        }
      } catch (error) {
        console.error('[useReadReceipts] Fetch error:', error);
      } finally {
        pendingFetchRef.current = false;
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [conversationId, messageIds.join(',')]);

  // Subscribe to realtime read receipts - KEEP SUPABASE REALTIME
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

  // Mark messages as read via API (with debounce and deduplication)
  const markAsRead = useCallback(async (messageIdsToMark: string[]) => {
    if (!user) return;

    // Filter out already marked messages AND temp messages
    const newMessageIds = messageIdsToMark.filter(
      (id) => !id.startsWith('temp_') && !markedAsReadRef.current.has(id)
    );

    if (newMessageIds.length === 0) return;

    // Mark as pending immediately to prevent duplicates
    newMessageIds.forEach((id) => markedAsReadRef.current.add(id));

    try {
      const response = await api.readReceipts.markAsRead(newMessageIds);

      if (!response.ok) {
        // Only log, don't remove from pending (server might have accepted some)
        console.warn('[useReadReceipts] Partial or failed mark as read:', response.error);
      }
    } catch (err) {
      // Only log, keep marked as pending to avoid retries causing 409
      console.warn('[useReadReceipts] Error marking as read:', err);
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
