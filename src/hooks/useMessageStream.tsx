/**
 * SSE-based message stream hook
 * Replaces Supabase Realtime for message updates
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Message, Profile } from '@/types';
import { useAuth } from './useAuth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://funchat-api-gateway.india-25d.workers.dev';

interface StreamMessage extends Message {
  sender?: Profile;
}

interface TypingUser {
  user_id: string;
  user_name: string;
  timestamp: number;
}

interface UseMessageStreamOptions {
  onMessage: (message: StreamMessage) => void;
  onTyping?: (users: TypingUser[]) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export function useMessageStream(
  conversationId: string | null,
  options: UseMessageStreamOptions
) {
  const { session } = useAuth();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_RECONNECT_DELAY = 1000;

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);
    setIsReconnecting(false);
  }, []);

  const connect = useCallback(() => {
    if (!conversationId || !session?.access_token) {
      return;
    }

    // Close existing connection
    disconnect();

    try {
      // Build URL with token in query param (EventSource doesn't support headers)
      const url = `${API_BASE_URL}/v1/conversations/${conversationId}/stream?token=${encodeURIComponent(session.access_token)}`;
      
      const eventSource = new EventSource(url, {
        withCredentials: false,
      });

      eventSource.onopen = () => {
        console.log('[SSE] Connected to stream:', conversationId);
        setIsConnected(true);
        setIsReconnecting(false);
        reconnectAttemptsRef.current = 0;
        options.onConnect?.();
      };

      // Handle connected event
      eventSource.addEventListener('connected', (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[SSE] Stream connected:', data);
        } catch (e) {
          console.error('[SSE] Failed to parse connected event:', e);
        }
      });

      // Handle message events
      eventSource.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data) as StreamMessage;
          options.onMessage(message);
        } catch (e) {
          console.error('[SSE] Failed to parse message:', e);
        }
      });

      // Handle typing events
      eventSource.addEventListener('typing', (event) => {
        try {
          const users = JSON.parse(event.data) as TypingUser[];
          options.onTyping?.(users);
        } catch (e) {
          console.error('[SSE] Failed to parse typing event:', e);
        }
      });

      // Handle close event
      eventSource.addEventListener('close', (event) => {
        console.log('[SSE] Stream closed by server');
        disconnect();
        // Server closed connection, try to reconnect
        scheduleReconnect();
      });

      eventSource.onerror = (event) => {
        console.error('[SSE] Connection error');
        setIsConnected(false);
        
        // EventSource auto-reconnects, but we track state
        if (eventSource.readyState === EventSource.CLOSED) {
          disconnect();
          options.onDisconnect?.();
          scheduleReconnect();
        }
      };

      eventSourceRef.current = eventSource;
    } catch (error) {
      console.error('[SSE] Failed to create connection:', error);
      options.onError?.(error as Error);
      scheduleReconnect();
    }
  }, [conversationId, session?.access_token, options, disconnect]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[SSE] Max reconnect attempts reached');
      options.onError?.(new Error('Max reconnection attempts reached'));
      return;
    }

    setIsReconnecting(true);
    reconnectAttemptsRef.current++;

    // Exponential backoff
    const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1);
    console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

    reconnectTimeoutRef.current = window.setTimeout(() => {
      connect();
    }, delay);
  }, [connect, options]);

  // Connect when conversation changes
  useEffect(() => {
    if (conversationId && session?.access_token) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [conversationId, session?.access_token]); // Don't include connect/disconnect to avoid loops

  // Manual reconnect function
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  return {
    isConnected,
    isReconnecting,
    reconnect,
    disconnect,
  };
}
