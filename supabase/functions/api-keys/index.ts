import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-funchat-api-key, x-funchat-api-key-id, x-funchat-app-id, x-funchat-user-id, x-funchat-scopes',
};

// Generate a random API key
function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'fc_live_';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

// Generate random salt
function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Hash API key with salt using SHA-256
async function hashApiKey(key: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate unique app_id
function generateAppId(): string {
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  return 'app_' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Available scopes
const VALID_SCOPES = [
  'chat:read', 'chat:write',
  'users:read', 'users:write',
  'calls:read', 'calls:write',
  'crypto:read', 'crypto:write',
  'webhooks:read', 'webhooks:write',
];

function errorResponse(code: string, message: string, status: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function successResponse<T>(data: T, status: number = 200, meta?: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({ success: true, data, meta: { timestamp: new Date().toISOString(), ...meta } }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Get auth token from header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('UNAUTHORIZED', 'Missing authorization header', 401);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse('UNAUTHORIZED', 'Invalid token', 401);
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const action = pathParts[pathParts.length - 1];

    // POST - Create new API key
    if (req.method === 'POST') {
      const body = await req.json();
      const { name, scopes, allowed_origins, rate_limit, expires_at } = body;

      if (!name) {
        return errorResponse('VALIDATION_ERROR', 'Name is required', 400);
      }

      // Validate scopes
      const validatedScopes = (scopes && Array.isArray(scopes))
        ? scopes.filter((s: string) => VALID_SCOPES.includes(s))
        : ['chat:read', 'users:read'];

      // Validate origins
      const validatedOrigins = (allowed_origins && Array.isArray(allowed_origins))
        ? allowed_origins.filter((o: string) => {
            try {
              new URL(o);
              return true;
            } catch {
              return false;
            }
          })
        : [];

      // Generate key components
      const rawApiKey = generateApiKey();
      const salt = generateSalt();
      const hashedApiKey = await hashApiKey(rawApiKey, salt);
      const keyPrefix = rawApiKey.substring(0, 12);
      const appId = generateAppId();

      const { data, error } = await supabase
        .from('api_keys')
        .insert({
          user_id: user.id,
          key_hash: hashedApiKey,
          key_salt: salt,
          key_prefix: keyPrefix,
          app_id: appId,
          name,
          scopes: validatedScopes,
          allowed_origins: validatedOrigins,
          permissions: { chat: true, users: true, calls: true, crypto: true }, // Legacy
          rate_limit: rate_limit || 60,
          expires_at: expires_at || null
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating API key:', error);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      // Return the raw key only once (user must save it)
      return successResponse({
        id: data.id,
        name: data.name,
        api_key: rawApiKey, // Only shown once!
        key_prefix: data.key_prefix,
        app_id: data.app_id,
        scopes: data.scopes,
        allowed_origins: data.allowed_origins,
        rate_limit: data.rate_limit,
        created_at: data.created_at,
        expires_at: data.expires_at
      }, 201, { warning: 'Save the API key now. It will not be shown again.' });
    }

    // GET - List API keys or usage
    if (req.method === 'GET') {
      if (action === 'usage') {
        // Get usage statistics
        const keyId = url.searchParams.get('key_id');
        
        let query = supabase
          .from('api_usage_logs')
          .select('*, api_keys!inner(user_id)')
          .eq('api_keys.user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100);

        if (keyId) {
          query = query.eq('api_key_id', keyId);
        }

        const { data, error } = await query;

        if (error) {
          console.error('Error fetching usage:', error);
          return errorResponse('DATABASE_ERROR', error.message, 500);
        }

        return successResponse(data || [], 200, { count: data?.length || 0 });
      }

      // List all API keys
      const { data, error } = await supabase
        .from('api_keys')
        .select('id, name, key_prefix, app_id, scopes, allowed_origins, rate_limit, is_active, last_used_at, created_at, expires_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching API keys:', error);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      return successResponse(data || [], 200, { count: data?.length || 0 });
    }

    // DELETE - Remove API key
    if (req.method === 'DELETE') {
      const keyId = url.searchParams.get('id');
      
      if (!keyId) {
        return errorResponse('VALIDATION_ERROR', 'API key ID is required', 400);
      }

      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting API key:', error);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      return successResponse({ deleted: true });
    }

    // PATCH - Update API key
    if (req.method === 'PATCH') {
      const body = await req.json();
      const { id, name, scopes, allowed_origins, rate_limit, is_active } = body;

      if (!id) {
        return errorResponse('VALIDATION_ERROR', 'API key ID is required', 400);
      }

      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (rate_limit !== undefined) updates.rate_limit = rate_limit;
      if (is_active !== undefined) updates.is_active = is_active;
      
      if (scopes !== undefined) {
        updates.scopes = Array.isArray(scopes)
          ? scopes.filter((s: string) => VALID_SCOPES.includes(s))
          : [];
      }
      
      if (allowed_origins !== undefined) {
        updates.allowed_origins = Array.isArray(allowed_origins)
          ? allowed_origins.filter((o: string) => {
              try {
                new URL(o);
                return true;
              } catch {
                return false;
              }
            })
          : [];
      }

      const { data, error } = await supabase
        .from('api_keys')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id, name, key_prefix, app_id, scopes, allowed_origins, rate_limit, is_active, last_used_at, created_at, expires_at')
        .single();

      if (error) {
        console.error('Error updating API key:', error);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      return successResponse(data);
    }

    return errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);

  } catch (error) {
    console.error('Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', String(error), 500);
  }
});
