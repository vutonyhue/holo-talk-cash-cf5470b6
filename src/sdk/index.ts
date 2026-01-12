/**
 * FunChat SDK
 * 
 * Official TypeScript SDK for the FunChat API.
 * 
 * @packageDocumentation
 * @module funchat-sdk
 * 
 * @example
 * ```typescript
 * import { FunChatClient } from 'funchat-sdk';
 * 
 * const client = new FunChatClient({
 *   apiKey: 'fc_live_your_api_key'
 * });
 * 
 * // List conversations
 * const conversations = await client.chat.listConversations();
 * 
 * // Send a message
 * const message = await client.chat.sendMessage('conv-id', {
 *   content: 'Hello from SDK!'
 * });
 * 
 * // Get user profile
 * const me = await client.users.me();
 * ```
 */

// Main client
export { FunChatClient, FunChat } from './client';

// Error classes
export {
  FunChatError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  NetworkError,
  TimeoutError,
  ServerError,
  ConflictError,
  WebhookSignatureError,
  isFunChatError,
  isErrorCode,
  createErrorFromResponse,
} from './errors';

// Resource classes
export {
  ChatResource,
  UsersResource,
  CallsResource,
  CryptoResource,
  WebhooksResource,
} from './resources';

// Types
export type {
  // Common types
  ApiResponse,
  ApiError,
  ResponseMeta,
  PaginationParams,
  FunChatConfig,
  RequestOptions,
  RateLimitInfo,
  
  // Chat types
  Profile,
  ConversationMember,
  Conversation,
  MessageType,
  MessageMetadata,
  Message,
  MessageReaction,
  MessageRead,
  CreateConversationParams,
  SendMessageParams,
  ListMessagesParams,
  UpdateConversationParams,
  AddMembersParams,
  
  // User types
  UpdateProfileParams,
  SearchUsersParams,
  PresenceStatus,
  UserWithPresence,
  UserStats,
  
  // Call types
  CallType,
  CallStatus,
  CallSession,
  CallParticipant,
  InitiateCallParams,
  UpdateCallStatusParams,
  CallHistoryParams,
  CallStats,
  
  // Crypto types
  TransactionStatus,
  CryptoCurrency,
  CryptoTransaction,
  TransferParams,
  CryptoHistoryParams,
  CryptoBalance,
  CryptoStats,
  TransferResult,
  
  // Webhook types
  WebhookEvent,
  Webhook,
  WebhookDelivery,
  CreateWebhookParams,
  UpdateWebhookParams,
  WebhookDeliveryParams,
  WebhookTestResult,
  WebhookPayload,
} from './types';

// Webhook constants
export { WEBHOOK_SIGNATURE_HEADER, WEBHOOK_TIMESTAMP_HEADER } from './types';

/**
 * Default export for convenience
 * 
 * @example
 * ```typescript
 * import FunChat from 'funchat-sdk';
 * 
 * const client = new FunChat({
 *   apiKey: 'fc_live_xxx'
 * });
 * ```
 */
export { FunChatClient as default } from './client';
