/**
 * FunChat SDK - Client
 * Main client class for interacting with FunChat API
 */

import type { FunChatConfig, RequestOptions, ApiResponse, RateLimitInfo } from './types';
import {
  FunChatError,
  ValidationError,
  NetworkError,
  TimeoutError,
  RateLimitError,
  createErrorFromResponse,
} from './errors';
import { ChatResource } from './resources/chat';
import { UsersResource } from './resources/users';
import { CallsResource } from './resources/calls';
import { CryptoResource } from './resources/crypto';
import { WebhooksResource } from './resources/webhooks';

/**
 * Default API base URL
 */
const DEFAULT_BASE_URL = 'https://dgeadmmbkvcsgizsnbpi.supabase.co/functions/v1';

/**
 * Default request timeout (30 seconds)
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * FunChat API Client
 * 
 * Main entry point for interacting with the FunChat API.
 * 
 * @example
 * ```typescript
 * import { FunChatClient } from 'funchat-sdk';
 * 
 * const client = new FunChatClient({
 *   apiKey: 'fc_live_your_api_key',
 *   debug: true
 * });
 * 
 * // Use resources
 * const conversations = await client.chat.listConversations();
 * const me = await client.users.me();
 * ```
 */
export class FunChatClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly onError?: (error: FunChatError) => void;
  private readonly debug: boolean;
  private readonly fetchFn: typeof fetch;

  /**
   * Chat resource for conversations and messages
   */
  public readonly chat: ChatResource;

  /**
   * Users resource for profile management
   */
  public readonly users: UsersResource;

  /**
   * Calls resource for voice/video calls
   */
  public readonly calls: CallsResource;

  /**
   * Crypto resource for cryptocurrency operations
   */
  public readonly crypto: CryptoResource;

  /**
   * Webhooks resource for webhook management
   */
  public readonly webhooks: WebhooksResource;

  /**
   * Last rate limit info from API response
   */
  private lastRateLimit?: RateLimitInfo;

  /**
   * Create a new FunChat client
   * 
   * @param config - Client configuration
   * @throws ValidationError if API key is missing
   * 
   * @example
   * ```typescript
   * const client = new FunChatClient({
   *   apiKey: 'fc_live_xxx',
   *   baseUrl: 'https://api.funchat.app', // optional
   *   timeout: 30000, // optional
   *   debug: true, // optional
   *   onError: (error) => console.error(error) // optional
   * });
   * ```
   */
  constructor(config: FunChatConfig) {
    // Validate required config
    if (!config.apiKey) {
      throw new ValidationError('API key is required');
    }

    if (!config.apiKey.startsWith('fc_')) {
      throw new ValidationError('Invalid API key format. Expected format: fc_live_xxx or fc_test_xxx');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
    this.onError = config.onError;
    this.debug = config.debug || false;
    this.fetchFn = config.fetch || fetch;

    // Initialize resources
    this.chat = new ChatResource(this);
    this.users = new UsersResource(this);
    this.calls = new CallsResource(this);
    this.crypto = new CryptoResource(this);
    this.webhooks = new WebhooksResource(this);

    if (this.debug) {
      console.log('[FunChat] Client initialized', {
        baseUrl: this.baseUrl,
        timeout: this.timeout,
      });
    }
  }

  /**
   * Get the last rate limit info
   * 
   * @returns Rate limit info from last request
   * 
   * @example
   * ```typescript
   * await client.chat.listConversations();
   * const rateLimit = client.getRateLimit();
   * console.log(`Remaining: ${rateLimit?.remaining}/${rateLimit?.limit}`);
   * ```
   */
  getRateLimit(): RateLimitInfo | undefined {
    return this.lastRateLimit;
  }

  /**
   * Make an API request
   * 
   * This method is used internally by resources but can also be used
   * for custom API calls.
   * 
   * @param method - HTTP method
   * @param path - API path (relative to base URL)
   * @param options - Request options
   * @returns Parsed response data
   * @throws FunChatError on API errors
   * 
   * @example
   * ```typescript
   * // Custom API call
   * const data = await client.request('GET', '/custom-endpoint', {
   *   params: { foo: 'bar' }
   * });
   * ```
   */
  async request<T>(
    method: string,
    path: string,
    options?: RequestOptions
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    // Add query parameters
    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      });
    }

    // Prepare headers
    const headers: Record<string, string> = {
      'x-funchat-api-key': this.apiKey,
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    // Setup timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    if (this.debug) {
      console.log(`[FunChat] ${method} ${url.toString()}`, {
        body: options?.body,
      });
    }

    try {
      const response = await this.fetchFn(url.toString(), {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Parse rate limit headers
      this.lastRateLimit = {
        limit: parseInt(response.headers.get('X-RateLimit-Limit') || '0', 10),
        remaining: parseInt(response.headers.get('X-RateLimit-Remaining') || '0', 10),
        reset: parseInt(response.headers.get('X-RateLimit-Reset') || '0', 10),
      };

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
        const error = new RateLimitError(
          retryAfter,
          this.lastRateLimit.limit,
          this.lastRateLimit.remaining,
          this.lastRateLimit.reset
        );
        this.handleError(error);
        throw error;
      }

      // Parse response body
      let data: ApiResponse<T>;
      try {
        data = await response.json() as ApiResponse<T>;
      } catch {
        throw new FunChatError(
          'PARSE_ERROR',
          'Failed to parse API response',
          response.status
        );
      }

      if (this.debug) {
        console.log(`[FunChat] Response:`, {
          status: response.status,
          success: data.success,
          data: data.data,
        });
      }

      // Handle API errors
      if (!data.success && data.error) {
        const error = createErrorFromResponse(
          data.error.code,
          data.error.message,
          response.status,
          data.error.details as Record<string, unknown>
        );
        this.handleError(error);
        throw error;
      }

      // Handle unexpected error status without proper error body
      if (!response.ok && !data.success) {
        const error = new FunChatError(
          'API_ERROR',
          `API request failed with status ${response.status}`,
          response.status
        );
        this.handleError(error);
        throw error;
      }

      return data.data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      // Re-throw FunChat errors
      if (error instanceof FunChatError) {
        throw error;
      }

      // Handle abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new TimeoutError(this.timeout);
        this.handleError(timeoutError);
        throw timeoutError;
      }

      // Handle network errors
      const networkError = new NetworkError(
        (error as Error).message || 'Network request failed',
        error as Error
      );
      this.handleError(networkError);
      throw networkError;
    }
  }

  /**
   * Handle error through callback
   * @internal
   */
  private handleError(error: FunChatError): void {
    if (this.onError) {
      try {
        this.onError(error);
      } catch (callbackError) {
        if (this.debug) {
          console.error('[FunChat] Error in onError callback:', callbackError);
        }
      }
    }

    if (this.debug) {
      console.error(`[FunChat] Error:`, error.toJSON());
    }
  }

  /**
   * Check if client is configured for production
   */
  isProduction(): boolean {
    return this.apiKey.startsWith('fc_live_');
  }

  /**
   * Check if client is configured for test mode
   */
  isTestMode(): boolean {
    return this.apiKey.startsWith('fc_test_');
  }

  /**
   * Get SDK version
   */
  static get version(): string {
    return '1.0.0';
  }
}

/**
 * Alias for FunChatClient
 */
export const FunChat = FunChatClient;
