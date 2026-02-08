/**
 * Unified SSE Realtime Hook
 * Single hook for all realtime events (messages, typing, reactions, read receipts)
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  ConnectionStatus,
  MessageEventData,
  TypingEventData,
  ReactionEventData,
  ReadReceiptEventData,
  UseSSEOptions,
  UseSSEReturn,
} from './events';
import { API_BASE_URL } from '@/config/workerUrls';

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000;

export function useSSE(
  conversationId: string | null,
  options: UseSSEOptions
): UseSSEReturn {
  const { session } = useAuth();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Memoize options to prevent unnecessary reconnections
  const optionsRef = useRef(options);
  optionsRef.current = options;

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
        optionsRef.current.onConnect?.();
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
          const message = JSON.parse(event.data) as MessageEventData;
          optionsRef.current.onMessage?.(message);
        } catch (e) {
          console.error('[SSE] Failed to parse message:', e);
        }
      });

      // Handle message update events
      eventSource.addEventListener('message:update', (event) => {
        try {
          const message = JSON.parse(event.data) as MessageEventData;
          optionsRef.current.onMessageUpdate?.(message);
        } catch (e) {
          console.error('[SSE] Failed to parse message update:', e);
        }
      });

      // Handle message delete events
      eventSource.addEventListener('message:delete', (event) => {
        try {
          const message = JSON.parse(event.data) as MessageEventData;
          optionsRef.current.onMessageDelete?.(message);
        } catch (e) {
          console.error('[SSE] Failed to parse message delete:', e);
        }
      });

      // Handle typing events
      eventSource.addEventListener('typing', (event) => {
        try {
          const users = JSON.parse(event.data) as TypingEventData[];
          optionsRef.current.onTyping?.(users);
        } catch (e) {
          console.error('[SSE] Failed to parse typing event:', e);
        }
      });

      // Handle reaction added events
      eventSource.addEventListener('reaction:added', (event) => {
        try {
          const reaction = JSON.parse(event.data) as ReactionEventData;
          optionsRef.current.onReactionAdded?.(reaction);
        } catch (e) {
          console.error('[SSE] Failed to parse reaction:added event:', e);
        }
      });

      // Handle reaction removed events
      eventSource.addEventListener('reaction:removed', (event) => {
        try {
          const reaction = JSON.parse(event.data) as ReactionEventData;
          optionsRef.current.onReactionRemoved?.(reaction);
        } catch (e) {
          console.error('[SSE] Failed to parse reaction:removed event:', e);
        }
      });

      // Handle read receipt events
      eventSource.addEventListener('read_receipt', (event) => {
        try {
          const receipt = JSON.parse(event.data) as ReadReceiptEventData;
          optionsRef.current.onReadReceipt?.(receipt);
        } catch (e) {
          console.error('[SSE] Failed to parse read_receipt event:', e);
        }
      });

      // Handle close event
      eventSource.addEventListener('close', () => {
        console.log('[SSE] Stream closed by server');
        disconnect();
        // Server closed connection, try to reconnect
        scheduleReconnect();
      });

      eventSource.onerror = () => {
        console.error('[SSE] Connection error');
        setIsConnected(false);
        
        // EventSource auto-reconnects, but we track state
        if (eventSource.readyState === EventSource.CLOSED) {
          disconnect();
          optionsRef.current.onDisconnect?.();
          scheduleReconnect();
        }
      };

      eventSourceRef.current = eventSource;
    } catch (error) {
      console.error('[SSE] Failed to create connection:', error);
      optionsRef.current.onError?.(error as Error);
      scheduleReconnect();
    }
  }, [conversationId, session?.access_token, disconnect]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[SSE] Max reconnect attempts reached');
      optionsRef.current.onError?.(new Error('Max reconnection attempts reached'));
      setIsReconnecting(false);
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
  }, [connect]);

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

  // Connection status
  const connectionStatus: ConnectionStatus = useMemo(() => {
    if (isConnected) return 'connected';
    if (isReconnecting) return 'reconnecting';
    return 'offline';
  }, [isConnected, isReconnecting]);

  return {
    isConnected,
    isReconnecting,
    connectionStatus,
    reconnect,
    disconnect,
  };
}
