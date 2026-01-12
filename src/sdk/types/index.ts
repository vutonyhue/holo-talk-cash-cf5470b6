/**
 * FunChat SDK - Type Exports
 * Central export point for all SDK types
 */

// Common types
export type {
  ApiResponse,
  ApiError,
  ResponseMeta,
  PaginationParams,
  FunChatConfig,
  RequestOptions,
  RateLimitInfo,
} from './common';

// Chat types
export type {
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
} from './chat';

// User types
export type {
  UpdateProfileParams,
  SearchUsersParams,
  PresenceStatus,
  UserWithPresence,
  UserStats,
} from './users';

// Call types
export type {
  CallType,
  CallStatus,
  CallSession,
  CallParticipant,
  InitiateCallParams,
  UpdateCallStatusParams,
  CallHistoryParams,
  CallStats,
} from './calls';

// Crypto types
export type {
  TransactionStatus,
  CryptoCurrency,
  CryptoTransaction,
  TransferParams,
  CryptoHistoryParams,
  CryptoBalance,
  CryptoStats,
  TransferResult,
} from './crypto';

// Webhook types
export type {
  WebhookEvent,
  Webhook,
  WebhookDelivery,
  CreateWebhookParams,
  UpdateWebhookParams,
  WebhookDeliveryParams,
  WebhookTestResult,
  WebhookPayload,
} from './webhooks';

export { WEBHOOK_SIGNATURE_HEADER, WEBHOOK_TIMESTAMP_HEADER } from './webhooks';
