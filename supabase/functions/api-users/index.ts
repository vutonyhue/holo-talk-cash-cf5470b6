import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-funchat-api-key, x-funchat-api-key-id, x-funchat-app-id, x-funchat-user-id, x-funchat-scopes, x-auth-mode, x-request-id',
};

interface AuthContext {
  mode: 'jwt' | 'api_key';
  userId: string;
  keyId?: string;
  scopes: string[];
}

function errorResponse(code: string, message: string, status: number): Response {
  return new Response(
    JSON.stringify({ ok: false, error: { code, message } }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function successResponse<T>(data: T, status: number = 200, meta?: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({ ok: true, data, meta: { timestamp: new Date().toISOString(), ...meta } }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Dual auth: Support both JWT and API key authentication
function validateAuth(req: Request): AuthContext | null {
  const authMode = req.headers.get('x-auth-mode');
  const userId = req.headers.get('x-funchat-user-id');
  const scopesHeader = req.headers.get('x-funchat-scopes');

  if (!userId) {
    return null;
  }

  // JWT auth mode (from authenticated web users)
  if (authMode === 'jwt') {
    return {
      mode: 'jwt',
      userId,
      scopes: scopesHeader ? scopesHeader.split(',').map(s => s.trim()) : ['users:read', 'users:write'],
    };
  }

  // API key auth mode (from SDK/third-party apps)
  const keyId = req.headers.get('x-funchat-api-key-id');
  if (authMode === 'api_key' && keyId) {
    return {
      mode: 'api_key',
      userId,
      keyId,
      scopes: scopesHeader ? scopesHeader.split(',').map(s => s.trim()) : [],
    };
  }

  // Legacy: Check for old header format (backward compatibility)
  if (keyId) {
    return {
      mode: 'api_key',
      userId,
      keyId,
      scopes: scopesHeader ? scopesHeader.split(',').map(s => s.trim()) : [],
    };
  }

  return null;
}

function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required);
}

// Log API usage (only for API key auth)
async function logUsage(
  supabase: any, 
  auth: AuthContext, 
  endpoint: string, 
  method: string, 
  statusCode: number, 
  responseTimeMs: number, 
  ipAddress: string
): Promise<void> {
  if (auth.mode !== 'api_key' || !auth.keyId) return;
  
  try {
    await supabase.from('api_usage_logs').insert({
      api_key_id: auth.keyId,
      endpoint,
      method,
      status_code: statusCode,
      response_time_ms: responseTimeMs,
      ip_address: ipAddress
    });
  } catch (e) {
    console.error('Failed to log usage:', e);
  }
}

serve(async (req) => {
  const startTime = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate authentication (dual mode)
    const auth = validateAuth(req);
    if (!auth) {
      return errorResponse('UNAUTHORIZED', 'Invalid or missing authentication', 401);
    }

    const { userId, scopes } = auth;
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const ipAddress = req.headers.get('x-forwarded-for') || 'unknown';

    // Route: GET /api-users/me
    if (req.method === 'GET' && pathParts.includes('me')) {
      if (!hasScope(scopes, 'users:read')) {
        return errorResponse('FORBIDDEN', 'Requires users:read scope', 403);
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        await logUsage(supabase, auth, '/me', 'GET', 404, Date.now() - startTime, ipAddress);
        return errorResponse('NOT_FOUND', 'Profile not found', 404);
      }

      await logUsage(supabase, auth, '/me', 'GET', 200, Date.now() - startTime, ipAddress);
      return successResponse(data);
    }

    // Route: PUT /api-users/me
    if (req.method === 'PUT' && pathParts.includes('me')) {
      if (!hasScope(scopes, 'users:write')) {
        return errorResponse('FORBIDDEN', 'Requires users:write scope', 403);
      }

      const body = await req.json();
      const { display_name, avatar_url, status, phone_number, wallet_address } = body;

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (display_name !== undefined) updates.display_name = display_name;
      if (avatar_url !== undefined) updates.avatar_url = avatar_url;
      if (status !== undefined) updates.status = status;
      if (phone_number !== undefined) updates.phone_number = phone_number;
      if (wallet_address !== undefined) updates.wallet_address = wallet_address;

      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        await logUsage(supabase, auth, '/me', 'PUT', 500, Date.now() - startTime, ipAddress);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      await logUsage(supabase, auth, '/me', 'PUT', 200, Date.now() - startTime, ipAddress);
      return successResponse(data);
    }

    // Route: GET /api-users/search?q={query}
    if (req.method === 'GET' && pathParts.includes('search')) {
      if (!hasScope(scopes, 'users:read')) {
        return errorResponse('FORBIDDEN', 'Requires users:read scope', 403);
      }

      const query = url.searchParams.get('q');
      const limit = parseInt(url.searchParams.get('limit') || '20');

      if (!query || query.length < 2) {
        await logUsage(supabase, auth, '/search', 'GET', 400, Date.now() - startTime, ipAddress);
        return errorResponse('VALIDATION_ERROR', 'Query must be at least 2 characters', 400);
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, status')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .neq('id', userId)
        .limit(limit);

      await logUsage(supabase, auth, '/search', 'GET', 200, Date.now() - startTime, ipAddress);
      return successResponse({ users: data || [] }, 200, { count: data?.length || 0 });
    }

    // Route: GET /api-users/:id - Get specific user profile
    if (req.method === 'GET') {
      if (!hasScope(scopes, 'users:read')) {
        return errorResponse('FORBIDDEN', 'Requires users:read scope', 403);
      }

      const targetUserId = pathParts[pathParts.length - 1];
      
      if (targetUserId && targetUserId !== 'api-users') {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, status, last_seen')
          .eq('id', targetUserId)
          .single();

        if (error) {
          await logUsage(supabase, auth, `/${targetUserId}`, 'GET', 404, Date.now() - startTime, ipAddress);
          return errorResponse('NOT_FOUND', 'User not found', 404);
        }

        await logUsage(supabase, auth, `/${targetUserId}`, 'GET', 200, Date.now() - startTime, ipAddress);
        return successResponse(data);
      }
    }

    return errorResponse('NOT_FOUND', 'Endpoint not found', 404);

  } catch (error) {
    console.error('Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', String(error), 500);
  }
});
