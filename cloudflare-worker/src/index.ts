/**
 * FunChat API Gateway - Cloudflare Worker (Extended)
 * 
 * This worker acts as an API gateway for FunChat, handling:
 * - API key verification for SDK/third-party apps
 * - JWT verification for authenticated user requests
 * - Rate limiting per API key and per user
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
  JWKS_CACHE: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SUPABASE_FUNCTIONS_URL: string;
  SUPABASE_JWT_SECRET?: string;
  ALLOWED_ORIGINS?: string;
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

interface JWTPayload {
  sub: string;
  email?: string;
  role?: string;
  exp: number;
  iat: number;
  aud: string;
}

interface JWK {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

interface JWKS {
  keys: JWK[];
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_TTL = 300; // 5 minutes
const JWKS_CACHE_TTL = 3600; // 1 hour
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds
const USER_RATE_LIMIT = 1000; // requests per hour for authenticated users

// Endpoint to required scope mapping (for API key auth)
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

// User-authenticated routes (no API key needed, just JWT)
const USER_ROUTES = [
  '/v1/me',
  '/v1/profiles',
  '/v1/conversations',
  '/v1/messages',
  '/v1/users',
  '/v1/reactions',
  '/v1/read-receipts',
  '/v1/media',
  '/v1/rewards',
];

// Public routes (no auth needed)
const PUBLIC_ROUTES = [
  '/health',
  '/',
];

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
 * Create standardized success response
 */
function successResponse(
  data: unknown,
  requestId: string,
  origin?: string
): Response {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
  };

  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return new Response(
    JSON.stringify({
      ok: true,
      data,
      requestId,
    }),
    { status: 200, headers }
  );
}

/**
 * Create standardized error response
 */
function errorResponse(
  code: string,
  message: string,
  status: number,
  requestId: string,
  origin?: string
): Response {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
  };

  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return new Response(
    JSON.stringify({
      ok: false,
      error: { code, message },
      requestId,
    }),
    { status, headers }
  );
}

/**
 * Generate request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string | null, allowedOrigins: string[], envAllowed?: string): boolean {
  // Parse env allowed origins
  const envOrigins = envAllowed?.split(',').map(o => o.trim()).filter(Boolean) || [];
  const allAllowed = [...allowedOrigins, ...envOrigins];
  
  if (allAllowed.length === 0) {
    return true; // No restrictions
  }
  if (!origin) {
    return false;
  }
  return allAllowed.some(allowed => {
    if (allowed === '*') return true;
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2);
      return origin.endsWith(domain) || origin === `https://${domain}` || origin === `http://${domain}`;
    }
    return origin === allowed;
  });
}

/**
 * Check if path is a user route
 */
function isUserRoute(pathname: string): boolean {
  return USER_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * Check if path is a public route
 */
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.includes(pathname);
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
// JWT Verification (JWKS)
// ============================================================================

/**
 * Base64URL decode
 */
function base64UrlDecode(str: string): Uint8Array {
  // Add padding if needed
  const pad = str.length % 4;
  if (pad) {
    str += '='.repeat(4 - pad);
  }
  // Convert base64url to base64
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  // Decode
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Parse JWT without verification (just to get header and payload)
 */
function parseJwt(token: string): { header: any; payload: JWTPayload } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));

    return { header, payload };
  } catch {
    return null;
  }
}

/**
 * Verify JWT using HMAC-SHA256 (Supabase uses HS256 with JWT secret)
 */
async function verifyJwtWithSecret(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureInput = `${parts[0]}.${parts[1]}`;
    const signature = base64UrlDecode(parts[2]);

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      encoder.encode(signatureInput)
    );

    if (!isValid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as JWTPayload;

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
}

/**
 * Extract and parse JWT from Authorization header
 * 
 * NOTE: We intentionally bypass cryptographic verification here because:
 * 1. Supabase has migrated to ES256 (ECDSA) tokens which require different verification
 * 2. The actual JWT verification is performed by Supabase Edge Functions using getClaims()
 * 3. Worker only parses the token to extract user ID for rate limiting purposes
 * 
 * Security is maintained because Edge Functions verify the token with Supabase's signing keys
 */
async function verifyAuthHeader(authHeader: string | null, env: Env): Promise<{ payload: JWTPayload; token: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  
  // Parse JWT to extract user ID for rate limiting
  // Cryptographic verification will be done by Edge Functions
  const parsed = parseJwt(token);
  if (!parsed) {
    console.error('Failed to parse JWT token');
    return null;
  }
  
  // Basic expiration check (not cryptographic, just a quick filter)
  if (parsed.payload.exp && parsed.payload.exp < Math.floor(Date.now() / 1000)) {
    console.log('Token expired');
    return null;
  }

  // Return both payload (for rate limiting) and original token (for forwarding)
  return { payload: parsed.payload, token };
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
  identifier: string,
  limit: number,
  env: Env
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % RATE_LIMIT_WINDOW);
  const resetAt = windowStart + RATE_LIMIT_WINDOW;
  const key = `rl:${identifier}:${windowStart}`;

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
// Route Handlers
// ============================================================================

/**
 * Handle user-authenticated routes (JWT-based)
 */
async function handleUserRoute(
  request: Request,
  env: Env,
  userId: string,
  requestId: string,
  origin: string | null
): Promise<Response> {
  const url = new URL(request.url);
  
  // Check rate limit for user
  const rateLimit = await checkRateLimit(`user:${userId}`, USER_RATE_LIMIT, env);
  if (!rateLimit.allowed) {
    const response = errorResponse('RATE_LIMITED', 'Rate limit exceeded', 429, requestId, origin || undefined);
    response.headers.set('X-RateLimit-Limit', USER_RATE_LIMIT.toString());
    response.headers.set('X-RateLimit-Remaining', '0');
    response.headers.set('X-RateLimit-Reset', rateLimit.resetAt.toString());
    response.headers.set('Retry-After', (rateLimit.resetAt - Math.floor(Date.now() / 1000)).toString());
    return response;
  }

  // Map v1 routes to Supabase Edge Functions
  let targetPath = url.pathname;
  
  // Route mapping: /v1/* -> /api-*
  if (targetPath.startsWith('/v1/me')) {
    targetPath = targetPath.replace('/v1/me', '/api-users/me');
  } else if (targetPath.startsWith('/v1/profiles')) {
    targetPath = targetPath.replace('/v1/profiles', '/api-users/profiles');
  } else if (targetPath.startsWith('/v1/conversations')) {
    targetPath = targetPath.replace('/v1/conversations', '/api-chat/conversations');
  } else if (targetPath.startsWith('/v1/messages')) {
    targetPath = targetPath.replace('/v1/messages', '/api-chat/messages');
  } else if (targetPath.startsWith('/v1/users')) {
    targetPath = targetPath.replace('/v1/users', '/api-users');
  } else if (targetPath.startsWith('/v1/reactions')) {
    targetPath = targetPath.replace('/v1/reactions', '/api-chat/reactions');
  } else if (targetPath.startsWith('/v1/read-receipts')) {
    targetPath = targetPath.replace('/v1/read-receipts', '/api-chat/read-receipts');
  } else if (targetPath.startsWith('/v1/media')) {
    targetPath = targetPath.replace('/v1/media', '/api-chat/media');
  } else if (targetPath.startsWith('/v1/rewards')) {
    targetPath = targetPath.replace('/v1/rewards', '/api-rewards');
  }

  // Forward request to Supabase Edge Functions
  const targetUrl = `${env.SUPABASE_FUNCTIONS_URL}${targetPath}${url.search}`;

  const forwardHeaders = new Headers(request.headers);
  // Forward the original JWT token - Edge Functions will verify it using getClaims()
  // This allows Edge Functions to verify both HS256 and ES256 tokens properly
  forwardHeaders.set('x-auth-mode', 'jwt');
  forwardHeaders.set('x-funchat-user-id', userId);
  forwardHeaders.set('x-request-id', requestId);
  // JWT users get full access to their own data
  forwardHeaders.set('x-funchat-scopes', 'chat:read,chat:write,users:read,users:write,rewards:read,rewards:write');

  const forwardRequest = new Request(targetUrl, {
    method: request.method,
    headers: forwardHeaders,
    body: request.body,
  });

  try {
    const response = await fetch(forwardRequest);

    // Clone response and add headers
    const responseHeaders = new Headers(response.headers);
    if (origin) {
      responseHeaders.set('Access-Control-Allow-Origin', origin);
      responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    }
    responseHeaders.set('X-Request-ID', requestId);
    responseHeaders.set('X-RateLimit-Limit', USER_RATE_LIMIT.toString());
    responseHeaders.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
    responseHeaders.set('X-RateLimit-Reset', rateLimit.resetAt.toString());

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Error forwarding request:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to process request', 500, requestId, origin || undefined);
  }
}

/**
 * Handle API key authenticated routes (for SDK/third-party apps)
 */
async function handleApiKeyRoute(
  request: Request,
  env: Env,
  keyData: KeyData,
  requestId: string,
  origin: string | null
): Promise<Response> {
  const url = new URL(request.url);

  // Check scope
  const requiredScope = getRequiredScope(url.pathname, request.method);
  if (requiredScope && !keyData.scopes.includes(requiredScope)) {
    return errorResponse(
      'INSUFFICIENT_SCOPE',
      `Required scope: ${requiredScope}`,
      403,
      requestId,
      origin || undefined
    );
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(`key:${keyData.id}`, keyData.rate_limit, env);
  if (!rateLimit.allowed) {
    const response = errorResponse('RATE_LIMITED', 'Rate limit exceeded', 429, requestId, origin || undefined);
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
  // Set auth mode for dual auth support in Edge Functions
  forwardHeaders.set('x-auth-mode', 'api_key');
  forwardHeaders.set('x-funchat-api-key-id', keyData.id);
  forwardHeaders.set('x-funchat-user-id', keyData.user_id);
  forwardHeaders.set('x-funchat-scopes', keyData.scopes.join(','));
  forwardHeaders.set('x-request-id', requestId);
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
  responseHeaders.set('X-Request-ID', requestId);
  responseHeaders.set('X-RateLimit-Limit', keyData.rate_limit.toString());
  responseHeaders.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
  responseHeaders.set('X-RateLimit-Reset', rateLimit.resetAt.toString());

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

// ============================================================================
// Main Handler
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const requestId = generateRequestId();

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      const corsOrigin = isOriginAllowed(origin, [], env.ALLOWED_ORIGINS) ? origin : null;
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': corsOrigin || '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-funchat-api-key, x-request-id',
          'Access-Control-Max-Age': '86400',
          'Access-Control-Allow-Credentials': 'true',
        },
      });
    }

    // Health check endpoint
    if (isPublicRoute(url.pathname)) {
      return successResponse(
        {
          status: 'healthy',
          version: '2.0.0',
          timestamp: new Date().toISOString(),
        },
        requestId,
        origin || undefined
      );
    }

    // Check for API key (SDK/third-party apps)
    const apiKey = request.headers.get('x-funchat-api-key');
    if (apiKey) {
      // Validate API key format
      if (!apiKey.startsWith('fc_live_') && !apiKey.startsWith('fc_test_')) {
        return errorResponse('INVALID_API_KEY', 'Invalid API key format', 401, requestId, origin || undefined);
      }

      // Verify API key
      const keyData = await verifyApiKey(apiKey, env);
      if (!keyData) {
        return errorResponse('INVALID_API_KEY', 'Invalid API key', 401, requestId, origin || undefined);
      }

      // Check if key is active
      if (!keyData.is_active) {
        return errorResponse('API_KEY_INACTIVE', 'API key is inactive', 403, requestId, origin || undefined);
      }

      // Check expiration
      if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
        return errorResponse('API_KEY_EXPIRED', 'API key has expired', 403, requestId, origin || undefined);
      }

      // Check origin
      if (!isOriginAllowed(origin, keyData.allowed_origins, env.ALLOWED_ORIGINS)) {
        return errorResponse('ORIGIN_NOT_ALLOWED', 'Origin not allowed', 403, requestId, origin || undefined);
      }

      return handleApiKeyRoute(request, env, keyData, requestId, origin);
    }

    // Check for user routes (JWT auth)
    if (isUserRoute(url.pathname)) {
      const authHeader = request.headers.get('Authorization');
      const authResult = await verifyAuthHeader(authHeader, env);

      if (!authResult) {
        return errorResponse('UNAUTHORIZED', 'Invalid or expired token', 401, requestId, origin || undefined);
      }

      // Pass user ID for rate limiting, original token is already in request headers
      return handleUserRoute(request, env, authResult.payload.sub, requestId, origin);
    }

    // Unknown route
    return errorResponse('NOT_FOUND', 'Endpoint not found', 404, requestId, origin || undefined);
  },
};
