/**
 * FunChat SDK - Chat Types
 * Type definitions for chat-related operations
 */

/**
 * User profile information
 */
export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status?: string | null;
  last_seen?: string | null;
  email?: string | null;
  phone_number?: string | null;
  wallet_address?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Conversation member with role
 */
export interface ConversationMember {
  id: string;
  user_id: string | null;
  conversation_id: string | null;
  role: 'admin' | 'member' | null;
  joined_at: string | null;
  is_muted: boolean | null;
  muted_at?: string | null;
  profile?: Profile;
}

/**
 * Conversation/chat room
 */
export interface Conversation {
  id: string;
  name: string | null;
  is_group: boolean | null;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  members?: ConversationMember[];
  last_message?: Message;
  unread_count?: number;
}

/**
 * Message types supported
 */
export type MessageType = 'text' | 'image' | 'file' | 'voice' | 'crypto' | 'call' | 'system';

/**
 * Message metadata based on type
 */
export interface MessageMetadata {
  // Image messages
  image_url?: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;

  // File messages
  file_url?: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;

  // Voice messages
  voice_url?: string;
  duration?: number;
  waveform?: number[];

  // Crypto messages
  tx_hash?: string;
  amount?: number;
  currency?: string;

  // Call messages
  call_id?: string;
  call_type?: 'video' | 'voice';
  call_duration?: number;

  // Forward info
  forwarded_from?: string;
  original_message_id?: string;

  // Reply info
  reply_preview?: string;

  // Custom metadata
  [key: string]: unknown;
}

/**
 * Chat message
 */
export interface Message {
  id: string;
  conversation_id: string | null;
  sender_id: string | null;
  content: string | null;
  message_type: MessageType | null;
  metadata: MessageMetadata | null;
  reply_to_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_deleted: boolean | null;
  deleted_at?: string | null;
  sender?: Profile;
  reply_to?: Message;
  reactions?: MessageReaction[];
  read_by?: MessageRead[];
}

/**
 * Message reaction
 */
export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  user?: Profile;
}

/**
 * Message read receipt
 */
export interface MessageRead {
  id: string;
  message_id: string;
  user_id: string;
  read_at: string;
  user?: Profile;
}

/**
 * Parameters for creating a new conversation
 */
export interface CreateConversationParams {
  /**
   * Conversation name (required for groups)
   */
  name?: string;

  /**
   * Whether this is a group conversation
   * @default false
   */
  is_group?: boolean;

  /**
   * User IDs to add as members
   */
  member_ids?: string[];

  /**
   * Avatar URL for group conversation
   */
  avatar_url?: string;
}

/**
 * Parameters for sending a message
 */
export interface SendMessageParams {
  /**
   * Message content (required for text messages)
   */
  content: string;

  /**
   * Message type
   * @default 'text'
   */
  message_type?: MessageType;

  /**
   * Additional metadata based on message type
   */
  metadata?: MessageMetadata;

  /**
   * Message ID to reply to
   */
  reply_to_id?: string;
}

/**
 * Parameters for listing messages
 */
export interface ListMessagesParams {
  /**
   * Maximum number of messages to return
   * @default 50
   */
  limit?: number;

  /**
   * Offset for pagination
   * @default 0
   */
  offset?: number;

  /**
   * Get messages before this message ID
   */
  before?: string;

  /**
   * Get messages after this message ID
   */
  after?: string;
}

/**
 * Parameters for updating a conversation
 */
export interface UpdateConversationParams {
  name?: string;
  avatar_url?: string;
}

/**
 * Parameters for adding members to a conversation
 */
export interface AddMembersParams {
  member_ids: string[];
  role?: 'admin' | 'member';
}
