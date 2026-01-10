import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-funchat-api-key, x-funchat-api-key-id, x-funchat-app-id, x-funchat-user-id, x-funchat-scopes',
};

function errorResponse(code: string, message: string, status: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function successResponse<T>(data: T, status: number = 200): Response {
  return new Response(
    JSON.stringify({ success: true, data, meta: { timestamp: new Date().toISOString() } }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Generate random token
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return 'wt_' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Hash token for storage
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Validate API key from Worker headers
function validateAuth(req: Request): { keyId: string; userId: string; scopes: string[] } | null {
  const keyId = req.headers.get('x-funchat-api-key-id');
  const userId = req.headers.get('x-funchat-user-id');
  const scopesHeader = req.headers.get('x-funchat-scopes');

  if (!keyId || !userId) {
    return null;
  }

  return {
    keyId,
    userId,
    scopes: scopesHeader ? scopesHeader.split(',').map(s => s.trim()) : [],
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // POST /widget-token - Create widget token
    if (req.method === 'POST') {
      // Validate authentication
      const auth = validateAuth(req);
      if (!auth) {
        return errorResponse('UNAUTHORIZED', 'Invalid or missing authentication', 401);
      }

      // Must have chat:read scope at minimum
      if (!auth.scopes.includes('chat:read')) {
        return errorResponse('FORBIDDEN', 'Requires chat:read scope', 403);
      }

      const body = await req.json();
      const { conversation_id, expires_in_minutes } = body;

      // Validate conversation if provided
      if (conversation_id) {
        // Check if user is member of conversation
        const { data: membership } = await supabase
          .from('conversation_members')
          .select('id')
          .eq('conversation_id', conversation_id)
          .eq('user_id', auth.userId)
          .single();

        if (!membership) {
          return errorResponse('FORBIDDEN', 'Not a member of this conversation', 403);
        }
      }

      // Calculate expiration (default 15 minutes, max 60 minutes)
      const expiresMinutes = Math.min(Math.max(expires_in_minutes || 15, 5), 60);
      const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

      // Generate token
      const token = generateToken();
      const tokenHash = await hashToken(token);

      // Widget tokens have limited scopes
      const widgetScopes = ['chat:read'];
      if (auth.scopes.includes('chat:write')) {
        widgetScopes.push('chat:write');
      }

      // Store token
      const { error } = await supabase.from('widget_tokens').insert({
        api_key_id: auth.keyId,
        conversation_id: conversation_id || null,
        scopes: widgetScopes,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      });

      if (error) {
        console.error('Error creating widget token:', error);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      return successResponse({
        widget_token: token,
        expires_at: expiresAt.toISOString(),
        scopes: widgetScopes,
        conversation_id: conversation_id || null,
      }, 201);
    }

    // POST /widget-token/validate - Validate widget token (for widget use)
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname.includes('validate')) {
      const body = await req.json();
      const { token } = body;

      if (!token) {
        return errorResponse('VALIDATION_ERROR', 'Token is required', 400);
      }

      const tokenHash = await hashToken(token);

      // Find valid token
      const { data: widgetToken, error } = await supabase
        .from('widget_tokens')
        .select(`
          id,
          api_key_id,
          conversation_id,
          scopes,
          expires_at,
          api_keys!inner(user_id, app_id, is_active)
        `)
        .eq('token_hash', tokenHash)
        .single();

      if (error || !widgetToken) {
        return errorResponse('UNAUTHORIZED', 'Invalid token', 401);
      }

      // Check expiration
      if (new Date(widgetToken.expires_at) < new Date()) {
        // Delete expired token
        await supabase.from('widget_tokens').delete().eq('id', widgetToken.id);
        return errorResponse('UNAUTHORIZED', 'Token has expired', 401);
      }

      // Check if API key is still active
      const apiKey = (widgetToken as any).api_keys;
      if (!apiKey.is_active) {
        return errorResponse('UNAUTHORIZED', 'API key is disabled', 401);
      }

      // Update used_at
      await supabase
        .from('widget_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', widgetToken.id);

      return successResponse({
        valid: true,
        user_id: apiKey.user_id,
        app_id: apiKey.app_id,
        conversation_id: widgetToken.conversation_id,
        scopes: widgetToken.scopes,
        expires_at: widgetToken.expires_at,
      });
    }

    return errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);

  } catch (error) {
    console.error('Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', String(error), 500);
  }
});
