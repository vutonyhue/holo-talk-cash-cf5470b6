/**
 * FunChat API Gateway - Cloudflare Worker
 * 
 * This worker acts as an API gateway for FunChat, handling:
 * - API key verification with KV caching
 * - Rate limiting per API key
 * - Scope-based access control
 * - Origin validation
 * - Request forwarding to Supabase Edge Functions
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

interface Env {
  API_KEY_CACHE: KVNamespace;
  RATE_LIMIT: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SUPABASE_FUNCTIONS_URL: string;
}

interface KeyData {
  id: string;
  user_id: string;
  app_id: string | null;
  scopes: string[];
  allowed_origins: string[];
  rate_limit: number;
  is_active: boolean;
  expires_at: string | null;
  key_salt: string;
}

interface RateLimitData {
  count: number;
  resetAt: number;
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_TTL = 300; // 5 minutes
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds

// Endpoint to required scope mapping
const ENDPOINT_SCOPES: Record<string, Record<string, string>> = {
  '/api-chat': {
    GET: 'chat:read',
    POST: 'chat:write',
    PUT: 'chat:write',
    PATCH: 'chat:write',
    DELETE: 'chat:write',
  },
  '/api-users': {
    GET: 'users:read',
    POST: 'users:write',
    PUT: 'users:write',
    PATCH: 'users:write',
  },
  '/api-calls': {
    GET: 'calls:read',
    POST: 'calls:write',
    PUT: 'calls:write',
    PATCH: 'calls:write',
  },
  '/api-crypto': {
    GET: 'crypto:read',
    POST: 'crypto:write',
  },
  '/api-webhooks': {
    GET: 'webhooks:read',
    POST: 'webhooks:write',
    PUT: 'webhooks:write',
    PATCH: 'webhooks:write',
    DELETE: 'webhooks:write',
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Hash API key using SHA-256
 */
async function hashApiKey(key: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create standardized error response
 */
function errorResponse(
  code: string,
  message: string,
  status: number,
  origin?: string
): Response {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: { code, message },
    }),
    { status, headers }
  );
}

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!allowedOrigins || allowedOrigins.length === 0) {
    return true; // No restrictions
  }
  if (!origin) {
    return false;
  }
  return allowedOrigins.some(allowed => {
    if (allowed === '*') return true;
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2);
      return origin.endsWith(domain) || origin === `https://${domain}` || origin === `http://${domain}`;
    }
    return origin === allowed;
  });
}

/**
 * Get required scope for endpoint
 */
function getRequiredScope(pathname: string, method: string): string | null {
  for (const [endpoint, methods] of Object.entries(ENDPOINT_SCOPES)) {
    if (pathname.startsWith(endpoint)) {
      return methods[method] || null;
    }
  }
  return null;
}

// ============================================================================
// API Key Verification
// ============================================================================

/**
 * Verify API key and return key data
 */
async function verifyApiKey(apiKey: string, env: Env): Promise<KeyData | null> {
  // Extract prefix (first 12 chars)
  const keyPrefix = apiKey.substring(0, 12);

  // Check cache first
  const cached = await env.API_KEY_CACHE.get(`key:${keyPrefix}`, 'json');
  if (cached) {
    const keyData = cached as KeyData & { key_hash: string };
    // Verify hash
    const hash = await hashApiKey(apiKey, keyData.key_salt);
    if (hash === keyData.key_hash) {
      return keyData;
    }
    return null;
  }

  // Query Supabase for key data
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/verify_api_key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({
      p_key_prefix: keyPrefix,
      p_key_hash: '', // We'll verify after getting salt
    }),
  });

  if (!response.ok) {
    console.error('Failed to verify API key:', await response.text());
    return null;
  }

  const results = await response.json();
  if (!results || results.length === 0) {
    return null;
  }

  const keyRecord = results[0];

  // Now hash with the salt and verify
  const hash = await hashApiKey(apiKey, keyRecord.key_salt);

  // Get the actual key hash from database
  const keyResponse = await fetch(
    `${env.SUPABASE_URL}/rest/v1/api_keys?key_prefix=eq.${keyPrefix}&select=key_hash`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );

  if (!keyResponse.ok) {
    return null;
  }

  const keyRecords = await keyResponse.json();
  if (!keyRecords || keyRecords.length === 0) {
    return null;
  }

  if (hash !== keyRecords[0].key_hash) {
    return null;
  }

  // Cache the key data
  const keyData: KeyData = {
    id: keyRecord.id,
    user_id: keyRecord.user_id,
    app_id: keyRecord.app_id,
    scopes: keyRecord.scopes || [],
    allowed_origins: keyRecord.allowed_origins || [],
    rate_limit: keyRecord.rate_limit || 1000,
    is_active: keyRecord.is_active,
    expires_at: keyRecord.expires_at,
    key_salt: keyRecord.key_salt,
  };

  await env.API_KEY_CACHE.put(
    `key:${keyPrefix}`,
    JSON.stringify({ ...keyData, key_hash: hash }),
    { expirationTtl: CACHE_TTL }
  );

  return keyData;
}

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Check and update rate limit
 */
async function checkRateLimit(
  keyId: string,
  limit: number,
  env: Env
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % RATE_LIMIT_WINDOW);
  const resetAt = windowStart + RATE_LIMIT_WINDOW;
  const key = `rl:${keyId}:${windowStart}`;

  // Get current count
  const data = await env.RATE_LIMIT.get(key, 'json') as RateLimitData | null;
  const count = data?.count || 0;

  if (count >= limit) {
    return { allowed: false, remaining: 0, resetAt };
  }

  // Increment count
  await env.RATE_LIMIT.put(
    key,
    JSON.stringify({ count: count + 1, resetAt }),
    { expirationTtl: RATE_LIMIT_WINDOW }
  );

  return { allowed: true, remaining: limit - count - 1, resetAt };
}

// ============================================================================
// Main Handler
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-funchat-api-key',
          'Access-Control-Max-Age': '86400',
          'Access-Control-Allow-Credentials': 'true',
        },
      });
    }

    // Health check endpoint
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            status: 'healthy',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': origin || '*',
          },
        }
      );
    }

    // Get API key from header
    const apiKey = request.headers.get('x-funchat-api-key');
    if (!apiKey) {
      return errorResponse('UNAUTHORIZED', 'Missing API key', 401, origin || undefined);
    }

    // Validate API key format
    if (!apiKey.startsWith('fc_live_') && !apiKey.startsWith('fc_test_')) {
      return errorResponse('INVALID_API_KEY', 'Invalid API key format', 401, origin || undefined);
    }

    // Verify API key
    const keyData = await verifyApiKey(apiKey, env);
    if (!keyData) {
      return errorResponse('INVALID_API_KEY', 'Invalid API key', 401, origin || undefined);
    }

    // Check if key is active
    if (!keyData.is_active) {
      return errorResponse('API_KEY_INACTIVE', 'API key is inactive', 403, origin || undefined);
    }

    // Check expiration
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return errorResponse('API_KEY_EXPIRED', 'API key has expired', 403, origin || undefined);
    }

    // Check origin
    if (!isOriginAllowed(origin, keyData.allowed_origins)) {
      return errorResponse('ORIGIN_NOT_ALLOWED', 'Origin not allowed', 403, origin || undefined);
    }

    // Check scope
    const requiredScope = getRequiredScope(url.pathname, request.method);
    if (requiredScope && !keyData.scopes.includes(requiredScope)) {
      return errorResponse(
        'INSUFFICIENT_SCOPE',
        `Required scope: ${requiredScope}`,
        403,
        origin || undefined
      );
    }

    // Check rate limit
    const rateLimit = await checkRateLimit(keyData.id, keyData.rate_limit, env);
    if (!rateLimit.allowed) {
      const response = errorResponse('RATE_LIMITED', 'Rate limit exceeded', 429, origin || undefined);
      response.headers.set('X-RateLimit-Limit', keyData.rate_limit.toString());
      response.headers.set('X-RateLimit-Remaining', '0');
      response.headers.set('X-RateLimit-Reset', rateLimit.resetAt.toString());
      response.headers.set('Retry-After', (rateLimit.resetAt - Math.floor(Date.now() / 1000)).toString());
      return response;
    }

    // Forward request to Supabase Edge Functions
    const targetUrl = `${env.SUPABASE_FUNCTIONS_URL}${url.pathname}${url.search}`;

    const forwardHeaders = new Headers(request.headers);
    forwardHeaders.set('Authorization', `Bearer ${env.SUPABASE_SERVICE_KEY}`);
    forwardHeaders.set('x-funchat-key-id', keyData.id);
    forwardHeaders.set('x-funchat-user-id', keyData.user_id);
    if (keyData.app_id) {
      forwardHeaders.set('x-funchat-app-id', keyData.app_id);
    }
    forwardHeaders.delete('x-funchat-api-key');

    const forwardRequest = new Request(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: request.body,
    });

    const response = await fetch(forwardRequest);

    // Clone response and add headers
    const responseHeaders = new Headers(response.headers);
    if (origin) {
      responseHeaders.set('Access-Control-Allow-Origin', origin);
      responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    }
    responseHeaders.set('X-RateLimit-Limit', keyData.rate_limit.toString());
    responseHeaders.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
    responseHeaders.set('X-RateLimit-Reset', rateLimit.resetAt.toString());

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  },
};
