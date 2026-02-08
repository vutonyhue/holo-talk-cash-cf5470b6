/**
 * Widget Messages Hook
 * Simplified message handling for embedded widgets.
 *
 * IMPORTANT:
 * - No direct Supabase DB queries.
 * - No Supabase Realtime.
 * - Use API Gateway + widget token header.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Message } from '@/sdk/types/chat';
import { API_BASE_URL } from '@/config/workerUrls';

interface UseWidgetMessagesResult {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  isLoadingMore: boolean;
  unreadCount: number;
}

interface UseWidgetMessagesOptions {
  conversationId: string | null;
  userId: string | null;
  canWrite: boolean;
  widgetToken: string | null;
  limit?: number;
  pollIntervalMs?: number;
}

export function useWidgetMessages({
  conversationId,
  userId,
  canWrite,
  widgetToken,
  limit = 50,
  pollIntervalMs = 3000,
}: UseWidgetMessagesOptions): UseWidgetMessagesResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const offsetRef = useRef(0);
  const isFocusedRef = useRef(true);

  const authHeaders = useCallback((): Record<string, string> => {
    return widgetToken ? { 'x-funchat-widget-token': widgetToken } : {};
  }, [widgetToken]);

  const unwrapOkData = useCallback(async (res: Response): Promise<unknown> => {
    const json = (await res.json().catch(() => null)) as any;
    if (!json || typeof json !== 'object') throw new Error('Bad response');

    // Support nested envelope: { ok:true, data:{ ok:true, data:... } }
    let cur: any = json;
    for (let i = 0; i < 3; i++) {
      if (cur && typeof cur === 'object' && typeof cur.ok === 'boolean') {
        if (cur.ok === false) throw new Error(cur.error?.message || 'Request failed');
        if ('data' in cur) {
          cur = cur.data;
          continue;
        }
      }
      break;
    }
    return cur;
  }, []);

  const fetchPage = useCallback(async (offset: number): Promise<Message[]> => {
    if (!conversationId || !widgetToken) return [];

    const url = `${API_BASE_URL}/v1/conversations/${conversationId}/messages?limit=${encodeURIComponent(
      limit
    )}&offset=${encodeURIComponent(offset)}`;

    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);

    const data = await unwrapOkData(res);
    const rows = Array.isArray(data) ? data : [];

    // api-chat returns newest first; reverse for display.
    return (rows as any[]).map((m) => ({
      ...m,
      message_type: (m.message_type || 'text') as Message['message_type'],
    })) as Message[];
  }, [conversationId, widgetToken, limit, unwrapOkData, authHeaders]);

  const refresh = useCallback(async () => {
    if (!conversationId || !widgetToken) return;

    setIsLoading(true);
    setError(null);
    try {
      offsetRef.current = 0;
      const rows = await fetchPage(0);
      const list = [...rows].reverse();
      setMessages(list);
      setHasMore(rows.length === limit);
      setUnreadCount(0);
    } catch (e) {
      if (import.meta.env.DEV) console.error('[useWidgetMessages] refresh error', e);
      setError('Failed to load messages');
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, widgetToken, fetchPage, limit]);

  // Send message
  const sendMessage = useCallback(async (content: string): Promise<boolean> => {
    if (!conversationId || !userId || !widgetToken || !canWrite || !content.trim()) {
      return false;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/v1/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          content: content.trim(),
          message_type: 'text',
        }),
      });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      await unwrapOkData(res);

      return true;
    } catch {
      setError('Failed to send message');
      return false;
    }
  }, [conversationId, userId, canWrite, widgetToken, authHeaders, unwrapOkData]);

  // Load more
  const loadMore = useCallback(async () => {
    if (!conversationId || !widgetToken) return;
    if (!hasMore || isLoading || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const nextOffset = offsetRef.current + limit;
      const rows = await fetchPage(nextOffset);
      offsetRef.current = nextOffset;
      setHasMore(rows.length === limit);
      const page = [...rows].reverse();
      setMessages(prev => [...page, ...prev]);
    } catch (e) {
      if (import.meta.env.DEV) console.error('[useWidgetMessages] loadMore error', e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [conversationId, widgetToken, hasMore, isLoading, isLoadingMore, fetchPage, limit]);

  // Initial fetch
  useEffect(() => {
    if (conversationId) {
      refresh();
    }
  }, [conversationId, refresh]);

  // Window focus tracking for unread count
  useEffect(() => {
    const onFocus = () => { isFocusedRef.current = true; setUnreadCount(0); };
    const onBlur = () => { isFocusedRef.current = false; };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, [conversationId, userId]);

  // Polling for new messages (replaces Supabase Realtime)
  useEffect(() => {
    if (!conversationId || !widgetToken) return;
    if (pollIntervalMs <= 0) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'hidden') return;

      try {
        const rows = await fetchPage(0);
        const latest = [...rows].reverse();

        setMessages(prev => {
          const prevIds = new Set(prev.map(m => m.id));
          const appended = latest.filter(m => !prevIds.has(m.id));
          if (appended.length === 0) return prev;

          // Unread count for messages from others while not focused.
          if (!isFocusedRef.current) {
            const unread = appended.filter(m => (m as any).sender_id && (m as any).sender_id !== userId).length;
            if (unread > 0) setUnreadCount(c => c + unread);
          }

          return [...prev, ...appended];
        });
      } catch (e) {
        if (import.meta.env.DEV) console.error('[useWidgetMessages] poll error', e);
      }
    };

    const interval = window.setInterval(() => { void tick(); }, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [conversationId, widgetToken, pollIntervalMs, fetchPage, userId]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    refresh,
    loadMore,
    hasMore,
    isLoadingMore,
    unreadCount,
  };
}
