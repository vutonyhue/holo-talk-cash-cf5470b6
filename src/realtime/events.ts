/**
 * SSE Realtime Event Types
 * Unified types for all realtime events in FunChat
 */

// Event type enum
export type SSEEventType = 
  | 'connected'
  | 'message'
  | 'message:update'
  | 'message:delete'
  | 'typing'
  | 'reaction:added'
  | 'reaction:removed'
  | 'read_receipt'
  | 'ping'
  | 'close';

// Connection status
export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

// Base event wrapper
export interface SSEEvent<T = unknown> {
  event: SSEEventType;
  data: T;
  timestamp?: number;
}

// Profile data for senders
export interface SenderProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

// Message event payload
export interface MessageEventData {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  message_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  reply_to_id: string | null;
  sender?: SenderProfile;
}

// Typing event payload
export interface TypingEventData {
  user_id: string;
  user_name: string;
  timestamp: number;
}

// Reaction event payload
export interface ReactionEventData {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

// Read receipt event payload
export interface ReadReceiptEventData {
  id?: string;
  message_id: string;
  user_id: string;
  read_at: string;
}

// Connected event payload
export interface ConnectedEventData {
  conversationId: string;
  userId: string;
}

// Close event payload
export interface CloseEventData {
  reason: 'timeout' | 'error' | 'manual';
}

// SSE hook options
export interface UseSSEOptions {
  onMessage?: (message: MessageEventData) => void;
  onMessageUpdate?: (message: MessageEventData) => void;
  onMessageDelete?: (message: MessageEventData) => void;
  onTyping?: (users: TypingEventData[]) => void;
  onReactionAdded?: (reaction: ReactionEventData) => void;
  onReactionRemoved?: (reaction: ReactionEventData) => void;
  onReadReceipt?: (receipt: ReadReceiptEventData) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

// SSE hook return type
export interface UseSSEReturn {
  isConnected: boolean;
  isReconnecting: boolean;
  connectionStatus: ConnectionStatus;
  reconnect: () => void;
  disconnect: () => void;
}
