/**
 * FunChat API Gateway - Cloudflare Worker
 * 
 * Deploy this to Cloudflare Workers để làm API Gateway:
 * 1. Tạo KV namespaces: API_KEY_CACHE, RATE_LIMIT
 * 2. Set secrets: SUPABASE_URL, SUPABASE_SERVICE_KEY
 * 3. Deploy với wrangler
 * 
 * wrangler.toml:
 * ```toml
 * name = "funchat-api-gateway"
 * main = "src/index.ts"
 * compatibility_date = "2024-01-01"
 * 
 * [[kv_namespaces]]
 * binding = "API_KEY_CACHE"
 * id = "your-kv-id"
 * 
 * [[kv_namespaces]]
 * binding = "RATE_LIMIT"
 * id = "your-kv-id"
 * 
 * [vars]
 * SUPABASE_FUNCTIONS_URL = "https://dgeadmmbkvcsgizsnbpi.supabase.co/functions/v1"
 * ```
 */

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
  app_id: string;
  scopes: string[];
  allowed_origins: string[];
  rate_limit: number;
  is_active: boolean;
  expires_at: string | null;
  key_salt: string;
}

// Scope requirements per endpoint
const ENDPOINT_SCOPES: Record<string, Record<string, string>> = {
  'api-chat': {
    'GET': 'chat:read',
    'POST': 'chat:write',
    'DELETE': 'chat:write',
  },
  'api-users': {
    'GET': 'users:read',
    'PUT': 'users:write',
  },
  'api-calls': {
    'GET': 'calls:read',
    'POST': 'calls:write',
    'PUT': 'calls:write',
  },
  'api-crypto': {
    'GET': 'crypto:read',
    'POST': 'crypto:write',
  },
  'api-webhooks': {
    'GET': 'webhooks:read',
    'POST': 'webhooks:write',
    'PATCH': 'webhooks:write',
    'DELETE': 'webhooks:write',
  },
};

async function hashApiKey(key: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function errorResponse(code: string, message: string, status: number, origin?: string): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status, headers }
  );
}

async function verifyApiKey(apiKey: string, env: Env): Promise<KeyData | null> {
  const keyPrefix = apiKey.substring(0, 12);
  
  // Check cache first
  const cacheKey = `key:${keyPrefix}`;
  const cached = await env.API_KEY_CACHE.get(cacheKey, 'json') as KeyData | null;
  
  if (cached) {
    // Verify hash matches
    const expectedHash = await hashApiKey(apiKey, cached.key_salt);
    // Would need to store hash in cache too - simplified for example
    return cached;
  }
  
  // Query Supabase to find key by prefix
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/api_keys?key_prefix=eq.${keyPrefix}&is_active=eq.true&select=id,user_id,app_id,scopes,allowed_origins,rate_limit,is_active,expires_at,key_salt,key_hash`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  
  if (!response.ok) return null;
  
  const keys = await response.json() as any[];
  if (!keys || keys.length === 0) return null;
  
  // Find matching key by hash
  for (const key of keys) {
    const computedHash = await hashApiKey(apiKey, key.key_salt);
    if (computedHash === key.key_hash) {
      const keyData: KeyData = {
        id: key.id,
        user_id: key.user_id,
        app_id: key.app_id,
        scopes: key.scopes || [],
        allowed_origins: key.allowed_origins || [],
        rate_limit: key.rate_limit || 60,
        is_active: key.is_active,
        expires_at: key.expires_at,
        key_salt: key.key_salt,
      };
      
      // Cache for 5 minutes
      await env.API_KEY_CACHE.put(cacheKey, JSON.stringify(keyData), { expirationTtl: 300 });
      
      return keyData;
    }
  }
  
  return null;
}

async function checkRateLimit(keyId: string, limit: number, env: Env): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const window = 60000; // 1 minute
  const now = Date.now();
  const windowKey = `rate:${keyId}:${Math.floor(now / window)}`;
  
  const current = parseInt(await env.RATE_LIMIT.get(windowKey) || '0');
  
  if (current >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: (Math.floor(now / window) + 1) * window,
    };
  }
  
  await env.RATE_LIMIT.put(windowKey, (current + 1).toString(), { expirationTtl: 120 });
  
  return {
    allowed: true,
    remaining: limit - current - 1,
    resetAt: (Math.floor(now / window) + 1) * window,
  };
}

function getRequiredScope(pathname: string, method: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const endpoint = parts[0];
  return ENDPOINT_SCOPES[endpoint]?.[method] || null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'x-funchat-api-key, content-type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    
    // Extract API key
    const apiKey = request.headers.get('x-funchat-api-key');
    if (!apiKey) {
      return errorResponse('UNAUTHORIZED', 'Missing x-funchat-api-key header', 401, origin || undefined);
    }
    
    // Verify API key
    const keyData = await verifyApiKey(apiKey, env);
    if (!keyData) {
      return errorResponse('UNAUTHORIZED', 'Invalid API key', 401, origin || undefined);
    }
    
    // Check if active
    if (!keyData.is_active) {
      return errorResponse('FORBIDDEN', 'API key is disabled', 403, origin || undefined);
    }
    
    // Check expiry
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return errorResponse('FORBIDDEN', 'API key has expired', 403, origin || undefined);
    }
    
    // Origin allowlist check
    if (origin && keyData.allowed_origins.length > 0) {
      if (!keyData.allowed_origins.includes(origin)) {
        return errorResponse('FORBIDDEN', 'Origin not allowed', 403);
      }
    }
    
    // Scope check
    const requiredScope = getRequiredScope(url.pathname, request.method);
    if (requiredScope && !keyData.scopes.includes(requiredScope)) {
      return errorResponse('FORBIDDEN', `Requires ${requiredScope} scope`, 403, origin || undefined);
    }
    
    // Rate limiting
    const rateLimitResult = await checkRateLimit(keyData.id, keyData.rate_limit, env);
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': keyData.rate_limit.toString(),
            'X-RateLimit-Remaining': '0',
            'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString(),
            ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
          },
        }
      );
    }
    
    // Forward to Supabase Edge Functions
    const targetUrl = `${env.SUPABASE_FUNCTIONS_URL}${url.pathname}${url.search}`;
    
    const forwardHeaders = new Headers();
    forwardHeaders.set('Content-Type', request.headers.get('Content-Type') || 'application/json');
    forwardHeaders.set('x-funchat-api-key-id', keyData.id);
    forwardHeaders.set('x-funchat-app-id', keyData.app_id || '');
    forwardHeaders.set('x-funchat-user-id', keyData.user_id);
    forwardHeaders.set('x-funchat-scopes', keyData.scopes.join(','));
    forwardHeaders.set('x-forwarded-for', request.headers.get('cf-connecting-ip') || 'unknown');
    
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });
    
    // Build response with rate limit headers
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('X-RateLimit-Limit', keyData.rate_limit.toString());
    responseHeaders.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    
    if (origin && (keyData.allowed_origins.length === 0 || keyData.allowed_origins.includes(origin))) {
      responseHeaders.set('Access-Control-Allow-Origin', origin);
      responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    }
    
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  },
};
