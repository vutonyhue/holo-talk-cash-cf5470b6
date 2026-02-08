/**
 * API Client Types
 * Chuẩn hóa response format cho toàn bộ API Gateway
 */

// Standard API Response format
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T | null;
  error?: ApiError;
  requestId?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Pagination
export interface PaginationParams {
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total?: number;
  hasMore: boolean;
  nextCursor?: string;
}

// Profile
export interface ProfileResponse {
  id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  phone_number: string | null;
  wallet_address: string | null;
  status: string | null;
  last_seen: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// Conversation
export interface ConversationMember {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profile?: ProfileResponse;
}

export interface ConversationResponse {
  id: string;
  name: string | null;
  is_group: boolean;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  members: ConversationMember[];
  last_message?: MessageResponse;
}

// Message
export interface MessageResponse {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  message_type: string;
  metadata: Record<string, unknown> | null;
  reply_to_id: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string | null;
  sender?: ProfileResponse;
  reply_to?: MessageResponse;
}

// Reaction
export interface ReactionResponse {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

// Read Receipt
export interface ReadReceiptResponse {
  id: string;
  message_id: string;
  user_id: string;
  read_at: string;
}

// Media presign
export interface PresignedUrlRequest {
  filename: string;
  contentType: string;
  bucket?: string;
  path?: string;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  publicUrl: string;
  path: string;
}

// Request options
export interface RequestConfig {
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

// API Client config
export interface ApiClientConfig {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  onUnauthorized?: () => void;
  onError?: (error: ApiError) => void;
  debug?: boolean;
}
