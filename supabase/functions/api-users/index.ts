import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function validateApiKey(req: Request, supabase: any) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header', status: 401 };
  }

  const apiKey = authHeader.replace('Bearer ', '');
  if (apiKey.startsWith('eyJ')) {
    return { error: 'Use API key, not JWT token', status: 401 };
  }

  const hashedKey = await hashApiKey(apiKey);

  const { data: keyData, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('api_key', hashedKey)
    .eq('is_active', true)
    .single();

  if (error || !keyData) {
    return { error: 'Invalid API key', status: 401 };
  }

  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return { error: 'API key has expired', status: 401 };
  }

  if (!keyData.permissions?.users) {
    return { error: 'API key does not have users permissions', status: 403 };
  }

  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyData.id);

  return { data: keyData };
}

async function logUsage(supabase: any, apiKeyId: string, endpoint: string, method: string, statusCode: number, responseTimeMs: number, ipAddress: string) {
  await supabase.from('api_usage_logs').insert({
    api_key_id: apiKeyId,
    endpoint,
    method,
    status_code: statusCode,
    response_time_ms: responseTimeMs,
    ip_address: ipAddress
  });
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

    const authResult = await validateApiKey(req, supabase);
    if (authResult.error) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED', message: authResult.error } }),
        { status: authResult.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKeyData = authResult.data;
    const userId = apiKeyData.user_id;
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const ipAddress = req.headers.get('x-forwarded-for') || 'unknown';

    // Route: GET /api-users/me
    if (req.method === 'GET' && pathParts.includes('me')) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        await logUsage(supabase, apiKeyData.id, '/me', 'GET', 404, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Profile not found' } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logUsage(supabase, apiKeyData.id, '/me', 'GET', 200, Date.now() - startTime, ipAddress);
      return new Response(
        JSON.stringify({ success: true, data, meta: { timestamp: new Date().toISOString() } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: PUT /api-users/me
    if (req.method === 'PUT' && pathParts.includes('me')) {
      const body = await req.json();
      const { display_name, avatar_url, status } = body;

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (display_name !== undefined) updates.display_name = display_name;
      if (avatar_url !== undefined) updates.avatar_url = avatar_url;
      if (status !== undefined) updates.status = status;

      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        await logUsage(supabase, apiKeyData.id, '/me', 'PUT', 500, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'DATABASE_ERROR', message: error.message } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logUsage(supabase, apiKeyData.id, '/me', 'PUT', 200, Date.now() - startTime, ipAddress);
      return new Response(
        JSON.stringify({ success: true, data, meta: { timestamp: new Date().toISOString() } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: GET /api-users/search?q={query}
    if (req.method === 'GET' && pathParts.includes('search')) {
      const query = url.searchParams.get('q');
      const limit = parseInt(url.searchParams.get('limit') || '20');

      if (!query || query.length < 2) {
        await logUsage(supabase, apiKeyData.id, '/search', 'GET', 400, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Query must be at least 2 characters' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, status')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .neq('id', userId)
        .limit(limit);

      await logUsage(supabase, apiKeyData.id, '/search', 'GET', 200, Date.now() - startTime, ipAddress);
      return new Response(
        JSON.stringify({ success: true, data: data || [], meta: { timestamp: new Date().toISOString(), count: data?.length || 0 } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: GET /api-users/:id
    if (req.method === 'GET') {
      const targetUserId = pathParts[pathParts.length - 1];
      
      if (targetUserId && targetUserId !== 'api-users') {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, status, last_seen')
          .eq('id', targetUserId)
          .single();

        if (error) {
          await logUsage(supabase, apiKeyData.id, `/${targetUserId}`, 'GET', 404, Date.now() - startTime, ipAddress);
          return new Response(
            JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await logUsage(supabase, apiKeyData.id, `/${targetUserId}`, 'GET', 200, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: true, data, meta: { timestamp: new Date().toISOString() } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: String(error) } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
    );
  }
});
