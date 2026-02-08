/**
 * FunChat API Client
 * 
 * Core client for making authenticated requests through the Cloudflare Worker API Gateway.
 * Features:
 * - Auto-attach Authorization: Bearer <supabase_access_token>
 * - Retry logic with exponential backoff
 * - Timeout handling
 * - Standardized response format
 */

import { ApiResponse, ApiError, ApiClientConfig, RequestConfig } from './types';

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

type Envelope = { ok: boolean; data?: unknown; error?: unknown; message?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasDataKey(value: unknown): value is { data: unknown } {
  return isRecord(value) && 'data' in value;
}

function getApiErrorShape(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const err = value['error'];
  return isRecord(err) ? err : null;
}

function isEnvelope(value: unknown): value is Envelope {
  if (!isRecord(value)) return false;
  if (!('ok' in value)) return false;
  return typeof value.ok === 'boolean';
}

function unwrapEnvelope(
  input: unknown,
  maxDepth = 3
): { ok: true; data: unknown } | { ok: false; error: unknown } {
  let cur: unknown = input;

  for (let i = 0; i < maxDepth; i++) {
    if (!isEnvelope(cur)) return { ok: true, data: cur };

    // HTTP 200 can still carry { ok: false, ... } as the body.
    if (cur.ok === false) {
      const errObj = isRecord(cur) ? cur : { message: 'Unknown error' };
      const e = (errObj as { error?: unknown; message?: unknown }).error ?? (errObj as { message?: unknown }).message ?? errObj;
      return { ok: false, error: e };
    }

    // ok === true:
    // If it has a `data` key (even null), unwrap that. Otherwise, treat the envelope as payload.
    const next = hasDataKey(cur) ? cur.data : cur;
    cur = next;
  }

  // max depth reached; return current payload as-is (can be null or an inner envelope)
  return { ok: true, data: cur };
}

function normalizeApiError(err: unknown, fallbackStatusText: string, status: number): ApiError {
  if (typeof err === 'string') {
    return { code: `HTTP_${status}`, message: err };
  }

  if (isRecord(err)) {
    const code = typeof err.code === 'string' ? err.code : `HTTP_${status}`;
    const message =
      typeof err.message === 'string'
        ? err.message
        : typeof err.error === 'string'
          ? err.error
          : fallbackStatusText || `HTTP_${status}`;

    const details = isRecord(err.details) ? (err.details as Record<string, unknown>) : undefined;
    return { code, message, details };
  }

  return { code: `HTTP_${status}`, message: fallbackStatusText || `HTTP_${status}` };
}

class ApiClient {
  private config: ApiClientConfig;

  constructor(config: ApiClientConfig) {
    this.config = config;
  }

  private log(level: 'info' | 'warn' | 'error', message: string, data?: unknown) {
    if (this.config.debug) {
      const prefix = `[API ${level.toUpperCase()}]`;
      if (data) {
        console.log(prefix, message, data);
      } else {
        console.log(prefix, message);
      }
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    const requestId = this.generateRequestId();
    const timeout = config?.timeout ?? DEFAULT_TIMEOUT;
    const maxRetries = config?.retries ?? DEFAULT_RETRIES;

    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const accessToken = await this.config.getAccessToken();
        
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
          ...config?.headers,
        };

        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
        }

        const url = `${this.config.baseUrl}${path}`;
        
        this.log('info', `${method} ${path}`, { attempt: attempt + 1, requestId });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          // Parse response
          const responseData: unknown = await response.json().catch(() => ({}));
          const responseRecord: Record<string, unknown> = isRecord(responseData) ? responseData : {};
          const errorShape = getApiErrorShape(responseRecord);
          const unwrapped = unwrapEnvelope(responseData);

          // Handle unauthorized
          if (response.status === 401) {
            this.log('warn', 'Unauthorized request', { path, requestId });
            if (this.config.onUnauthorized) {
              this.config.onUnauthorized();
            }
            return {
              ok: false,
              error: {
                code: 'UNAUTHORIZED',
                message: (typeof errorShape?.message === 'string' && errorShape.message) || 'Unauthorized',
              },
              requestId,
            };
          }

          // Handle rate limiting
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
            this.log('warn', `Rate limited, retry after ${retryAfter}s`, { requestId });
            
            if (attempt < maxRetries - 1) {
              await this.sleep(retryAfter * 1000);
              continue;
            }

            return {
              ok: false,
              error: {
                code: 'RATE_LIMITED',
                message: 'Too many requests. Please try again later.',
              },
              requestId,
            };
          }

          // Handle server errors with retry
          if (response.status >= 500 && attempt < maxRetries - 1) {
            this.log('warn', `Server error ${response.status}, retrying...`, { requestId });
            await this.sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
            continue;
          }

          // Handle successful response
          if (response.ok) {
            if (unwrapped.ok === false) {
              const error = normalizeApiError(unwrapped.error, response.statusText, response.status);
              this.log('error', `Request failed: ${error.message}`, { requestId, error });
              if (this.config.onError) this.config.onError(error);
              return { ok: false, error, requestId };
            }

            this.log('info', `Success ${method} ${path}`, { requestId });
            return {
              ok: true,
              data: unwrapped.data as T,
              requestId,
            };
          }

          // Handle other errors
          // Prefer envelope error if present.
          if (unwrapped.ok === false) {
            const error = normalizeApiError(unwrapped.error, response.statusText, response.status);
            this.log('error', `Request failed: ${error.message}`, { requestId, error });
            if (this.config.onError) this.config.onError(error);
            return { ok: false, error, requestId };
          }

          const error: ApiError = {
            code: (typeof errorShape?.code === 'string' && errorShape.code) || `HTTP_${response.status}`,
            message: (typeof errorShape?.message === 'string' && errorShape.message) || response.statusText,
            details: (isRecord(errorShape?.details) && (errorShape.details as Record<string, unknown>)) || undefined,
          };

          this.log('error', `Request failed: ${error.message}`, { requestId, error });
          
          if (this.config.onError) {
            this.config.onError(error);
          }

          return {
            ok: false,
            error,
            requestId,
          };
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
      } catch (error) {
        // Handle abort/timeout
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = {
            code: 'TIMEOUT',
            message: `Request timeout after ${timeout}ms`,
          };
          this.log('error', 'Request timeout', { requestId, path });
        } 
        // Handle network errors
        else if (error instanceof TypeError) {
          lastError = {
            code: 'NETWORK_ERROR',
            message: 'Network error. Please check your connection.',
          };
          this.log('error', 'Network error', { requestId, error });
        }
        // Handle other errors
        else {
          lastError = {
            code: 'UNKNOWN_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error occurred',
          };
          this.log('error', 'Unknown error', { requestId, error });
        }

        // Retry on network errors
        if (attempt < maxRetries - 1) {
          this.log('info', `Retrying (${attempt + 2}/${maxRetries})...`, { requestId });
          await this.sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
          continue;
        }
      }
    }

    // All retries exhausted
    return {
      ok: false,
      error: lastError || { code: 'UNKNOWN_ERROR', message: 'Request failed after retries' },
      requestId,
    };
  }

  // Convenience methods
  async get<T>(path: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, undefined, config);
  }

  async post<T>(path: string, body?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body, config);
  }

  async put<T>(path: string, body?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body, config);
  }

  async patch<T>(path: string, body?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', path, body, config);
  }

  async delete<T>(path: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, undefined, config);
  }
}

export { ApiClient };
export type { ApiClientConfig };
