/**
 * FunChat SDK - Error Classes
 * Custom error types for better error handling
 */

/**
 * Base error class for all FunChat SDK errors
 */
export class FunChatError extends Error {
  /**
   * Error code for programmatic handling
   */
  public readonly code: string;

  /**
   * HTTP status code (if applicable)
   */
  public readonly status: number;

  /**
   * Additional error details
   */
  public readonly details?: Record<string, unknown>;

  /**
   * Original error that caused this error
   */
  public readonly cause?: Error;

  constructor(
    code: string,
    message: string,
    status: number = 500,
    details?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message);
    this.name = 'FunChatError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.cause = cause;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.status,
      details: this.details,
    };
  }

  /**
   * Create a human-readable string representation
   */
  toString(): string {
    return `[${this.code}] ${this.message}`;
  }
}

/**
 * Thrown when API key is missing or invalid
 */
export class UnauthorizedError extends FunChatError {
  constructor(message: string = 'Invalid or missing API key') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Thrown when the API key doesn't have required permissions/scopes
 */
export class ForbiddenError extends FunChatError {
  /**
   * Required scope that was missing
   */
  public readonly requiredScope?: string;

  constructor(message: string = 'Insufficient permissions', requiredScope?: string) {
    super('FORBIDDEN', message, 403, requiredScope ? { requiredScope } : undefined);
    this.name = 'ForbiddenError';
    this.requiredScope = requiredScope;
  }
}

/**
 * Thrown when the requested resource doesn't exist
 */
export class NotFoundError extends FunChatError {
  /**
   * Type of resource that wasn't found
   */
  public readonly resource?: string;

  /**
   * ID of the resource that wasn't found
   */
  public readonly resourceId?: string;

  constructor(resource: string = 'Resource', resourceId?: string) {
    const message = resourceId
      ? `${resource} with ID '${resourceId}' not found`
      : `${resource} not found`;
    super('NOT_FOUND', message, 404, { resource, resourceId });
    this.name = 'NotFoundError';
    this.resource = resource;
    this.resourceId = resourceId;
  }
}

/**
 * Thrown when request validation fails
 */
export class ValidationError extends FunChatError {
  /**
   * Validation errors by field
   */
  public readonly errors?: Record<string, string[]>;

  constructor(message: string, errors?: Record<string, string[]>) {
    super('VALIDATION_ERROR', message, 400, errors ? { errors } : undefined);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/**
 * Thrown when rate limit is exceeded
 */
export class RateLimitError extends FunChatError {
  /**
   * Seconds until rate limit resets
   */
  public readonly retryAfter: number;

  /**
   * Maximum requests allowed in the window
   */
  public readonly limit: number;

  /**
   * Remaining requests in current window
   */
  public readonly remaining: number;

  /**
   * Timestamp when rate limit resets (Unix epoch)
   */
  public readonly resetAt: number;

  constructor(retryAfter: number, limit: number, remaining: number, resetAt?: number) {
    super(
      'RATE_LIMITED',
      `Rate limit exceeded. Retry after ${retryAfter} seconds`,
      429,
      { retryAfter, limit, remaining, resetAt }
    );
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.limit = limit;
    this.remaining = remaining;
    this.resetAt = resetAt || Date.now() + retryAfter * 1000;
  }
}

/**
 * Thrown when a network error occurs
 */
export class NetworkError extends FunChatError {
  constructor(message: string = 'Network error occurred', cause?: Error) {
    super('NETWORK_ERROR', message, 0, undefined, cause);
    this.name = 'NetworkError';
  }
}

/**
 * Thrown when a request times out
 */
export class TimeoutError extends FunChatError {
  /**
   * Timeout duration in milliseconds
   */
  public readonly timeoutMs: number;

  constructor(timeoutMs: number = 30000) {
    super('TIMEOUT', `Request timed out after ${timeoutMs}ms`, 408, { timeoutMs });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Thrown when server returns an error
 */
export class ServerError extends FunChatError {
  constructor(message: string = 'Internal server error', status: number = 500) {
    super('SERVER_ERROR', message, status);
    this.name = 'ServerError';
  }
}

/**
 * Thrown when the request conflicts with current state
 */
export class ConflictError extends FunChatError {
  constructor(message: string = 'Request conflicts with current state') {
    super('CONFLICT', message, 409);
    this.name = 'ConflictError';
  }
}

/**
 * Thrown when webhook signature verification fails
 */
export class WebhookSignatureError extends FunChatError {
  constructor(message: string = 'Invalid webhook signature') {
    super('INVALID_SIGNATURE', message, 401);
    this.name = 'WebhookSignatureError';
  }
}

/**
 * Type guard to check if an error is a FunChatError
 */
export function isFunChatError(error: unknown): error is FunChatError {
  return error instanceof FunChatError;
}

/**
 * Type guard to check if error is a specific type
 */
export function isErrorCode(error: unknown, code: string): boolean {
  return isFunChatError(error) && error.code === code;
}

/**
 * Create appropriate error from API response
 */
export function createErrorFromResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>
): FunChatError {
  switch (code) {
    case 'UNAUTHORIZED':
      return new UnauthorizedError(message);
    case 'FORBIDDEN':
      return new ForbiddenError(message, details?.requiredScope as string);
    case 'NOT_FOUND':
      return new NotFoundError(message);
    case 'VALIDATION_ERROR':
      return new ValidationError(message, details?.errors as Record<string, string[]>);
    case 'RATE_LIMITED':
      return new RateLimitError(
        (details?.retryAfter as number) || 60,
        (details?.limit as number) || 0,
        (details?.remaining as number) || 0
      );
    case 'CONFLICT':
      return new ConflictError(message);
    default:
      if (status >= 500) {
        return new ServerError(message, status);
      }
      return new FunChatError(code, message, status, details);
  }
}
