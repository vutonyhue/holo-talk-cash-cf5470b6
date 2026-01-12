/**
 * FunChat SDK - Webhook Types
 * Type definitions for webhook operations
 */

/**
 * Supported webhook event types
 */
export type WebhookEvent =
  | 'message.created'
  | 'message.updated'
  | 'message.deleted'
  | 'conversation.created'
  | 'conversation.updated'
  | 'member.added'
  | 'member.removed'
  | 'call.started'
  | 'call.ended'
  | 'call.missed'
  | 'crypto.transfer'
  | 'user.updated'
  | '*'; // Wildcard for all events

/**
 * Webhook configuration
 */
export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  is_active: boolean | null;
  failure_count: number | null;
  max_retries: number | null;
  last_triggered_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  created_at: string | null;
  updated_at: string | null;
  /**
   * Secret for signature verification
   * Only returned when webhook is first created
   */
  secret?: string;
}

/**
 * Webhook delivery log entry
 */
export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  payload: Record<string, unknown>;
  response_status: number | null;
  response_body: string | null;
  attempt_count: number | null;
  delivered_at: string | null;
  error_message: string | null;
  created_at: string | null;
}

/**
 * Parameters for creating a webhook
 */
export interface CreateWebhookParams {
  /**
   * URL to receive webhook events
   * Must be HTTPS in production
   */
  url: string;

  /**
   * Events to subscribe to
   * @default ['message.created']
   */
  events?: WebhookEvent[];

  /**
   * Maximum retry attempts for failed deliveries
   * @default 3
   */
  max_retries?: number;
}

/**
 * Parameters for updating a webhook
 */
export interface UpdateWebhookParams {
  /**
   * New webhook URL
   */
  url?: string;

  /**
   * Updated event subscriptions
   */
  events?: WebhookEvent[];

  /**
   * Enable or disable webhook
   */
  is_active?: boolean;

  /**
   * Maximum retry attempts
   */
  max_retries?: number;
}

/**
 * Parameters for listing webhook deliveries
 */
export interface WebhookDeliveryParams {
  /**
   * Maximum number of deliveries to return
   * @default 20
   */
  limit?: number;

  /**
   * Offset for pagination
   * @default 0
   */
  offset?: number;

  /**
   * Filter by event type
   */
  event?: WebhookEvent;

  /**
   * Filter by delivery status: 'success', 'failed', or 'all'
   * @default 'all'
   */
  status?: 'success' | 'failed' | 'all';
}

/**
 * Webhook test result
 */
export interface WebhookTestResult {
  sent: boolean;
  response_status?: number;
  response_time_ms?: number;
  error?: string;
}

/**
 * Incoming webhook payload structure
 */
export interface WebhookPayload<T = Record<string, unknown>> {
  /**
   * Event type
   */
  event: WebhookEvent;

  /**
   * Event data
   */
  data: T;

  /**
   * Timestamp when event occurred (ISO 8601)
   */
  timestamp: string;

  /**
   * Unique delivery ID for idempotency
   */
  delivery_id: string;

  /**
   * API key ID that owns this webhook
   */
  api_key_id: string;
}

/**
 * Webhook signature header name
 */
export const WEBHOOK_SIGNATURE_HEADER = 'x-funchat-signature';

/**
 * Webhook timestamp header name
 */
export const WEBHOOK_TIMESTAMP_HEADER = 'x-funchat-timestamp';
