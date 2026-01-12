/**
 * FunChat SDK - Common Types
 * Shared type definitions used across all resources
 */

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

/**
 * API error details
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Response metadata
 */
export interface ResponseMeta {
  timestamp: string;
  count?: number;
  limit?: number;
  offset?: number;
  total?: number;
}

/**
 * Pagination parameters for list endpoints
 */
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

/**
 * SDK configuration options
 */
export interface FunChatConfig {
  /**
   * Your FunChat API key (required)
   * Format: fc_live_xxx or fc_test_xxx
   */
  apiKey: string;

  /**
   * Base URL for API requests
   * @default 'https://dgeadmmbkvcsgizsnbpi.supabase.co/functions/v1'
   */
  baseUrl?: string;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Global error handler callback
   */
  onError?: (error: Error) => void;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;

  /**
   * Custom fetch implementation (for Node.js environments)
   */
  fetch?: typeof fetch;
}

/**
 * HTTP request options
 */
export interface RequestOptions {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

/**
 * Rate limit information from response headers
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}
