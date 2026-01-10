// Shared authentication module for FunChat API
// This module handles API key validation from Cloudflare Worker headers

export interface ApiKeyValidation {
  keyId: string;
  appId: string;
  userId: string;
  scopes: string[];
}

export interface AuthResult {
  data?: ApiKeyValidation;
  error?: string;
  status?: number;
}

// Available scopes
export const SCOPES = {
  CHAT_READ: 'chat:read',
  CHAT_WRITE: 'chat:write',
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  CALLS_READ: 'calls:read',
  CALLS_WRITE: 'calls:write',
  CRYPTO_READ: 'crypto:read',
  CRYPTO_WRITE: 'crypto:write',
  WEBHOOKS_READ: 'webhooks:read',
  WEBHOOKS_WRITE: 'webhooks:write',
} as const;

// Webhook events
export const WEBHOOK_EVENTS = {
  MESSAGE_CREATED: 'message.created',
  MESSAGE_DELETED: 'message.deleted',
  CALL_STARTED: 'call.started',
  CALL_ENDED: 'call.ended',
  CRYPTO_TRANSFER: 'crypto.transfer',
  USER_UPDATED: 'user.updated',
} as const;

/**
 * Validate API key from headers set by Cloudflare Worker
 * The Worker has already verified the API key, we just need to read the headers
 */
export function validateApiKeyFromWorker(req: Request): AuthResult {
  const keyId = req.headers.get('x-funchat-api-key-id');
  const appId = req.headers.get('x-funchat-app-id');
  const userId = req.headers.get('x-funchat-user-id');
  const scopesHeader = req.headers.get('x-funchat-scopes');

  // If no worker headers, check for direct API key (legacy/internal)
  if (!keyId && !userId) {
    const apiKey = req.headers.get('x-funchat-api-key');
    if (!apiKey) {
      return { error: 'Missing authentication', status: 401 };
    }
    // For direct calls without Worker, return error - must go through Worker
    return { error: 'Direct API access not allowed. Use API Gateway.', status: 401 };
  }

  if (!keyId || !userId) {
    return { error: 'Invalid authentication headers', status: 401 };
  }

  const scopes = scopesHeader ? scopesHeader.split(',').map(s => s.trim()) : [];

  return {
    data: {
      keyId,
      appId: appId || '',
      userId,
      scopes,
    },
  };
}

/**
 * Check if the authenticated key has a specific scope
 */
export function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required);
}

/**
 * Check if the authenticated key has any of the required scopes
 */
export function hasAnyScope(scopes: string[], required: string[]): boolean {
  return required.some(s => scopes.includes(s));
}

/**
 * Check if the authenticated key has all of the required scopes
 */
export function hasAllScopes(scopes: string[], required: string[]): boolean {
  return required.every(s => scopes.includes(s));
}

/**
 * Create a standardized error response
 */
export function errorResponse(
  code: string,
  message: string,
  status: number,
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: { code, message },
    }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Create a standardized success response
 */
export function successResponse<T>(
  data: T,
  corsHeaders: Record<string, string>,
  status: number = 200,
  meta?: Record<string, unknown>
): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), ...meta },
    }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Hash string using SHA-256
 */
export async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate random hex string
 */
export function generateRandomHex(bytes: number = 16): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create HMAC SHA-256 signature
 */
export async function createHmacSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
