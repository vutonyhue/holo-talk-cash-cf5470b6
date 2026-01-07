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

  if (!keyData.permissions?.calls) {
    return { error: 'API key does not have calls permissions', status: 403 };
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

    // Route: POST /api-calls/initiate
    if (req.method === 'POST' && pathParts.includes('initiate')) {
      const body = await req.json();
      const { conversation_id, call_type } = body;

      if (!conversation_id) {
        await logUsage(supabase, apiKeyData.id, '/initiate', 'POST', 400, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: 'conversation_id is required' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if user is member of conversation
      const { data: membership } = await supabase
        .from('conversation_members')
        .select('id')
        .eq('conversation_id', conversation_id)
        .eq('user_id', userId)
        .single();

      if (!membership) {
        await logUsage(supabase, apiKeyData.id, '/initiate', 'POST', 403, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'FORBIDDEN', message: 'Not a member of this conversation' } }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create call session
      const channelName = `call_${conversation_id}_${Date.now()}`;
      const { data, error } = await supabase
        .from('call_sessions')
        .insert({
          conversation_id,
          caller_id: userId,
          call_type: call_type || 'video',
          channel_name: channelName,
          status: 'ringing'
        })
        .select()
        .single();

      if (error) {
        await logUsage(supabase, apiKeyData.id, '/initiate', 'POST', 500, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'DATABASE_ERROR', message: error.message } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logUsage(supabase, apiKeyData.id, '/initiate', 'POST', 201, Date.now() - startTime, ipAddress);
      return new Response(
        JSON.stringify({ success: true, data, meta: { timestamp: new Date().toISOString() } }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: PUT /api-calls/:id/status
    if (req.method === 'PUT' && pathParts.includes('status')) {
      const callId = pathParts[pathParts.indexOf('api-calls') + 1];
      const body = await req.json();
      const { status } = body;

      if (!['ringing', 'active', 'ended', 'missed', 'rejected'].includes(status)) {
        await logUsage(supabase, apiKeyData.id, `/${callId}/status`, 'PUT', 400, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid status' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const updates: Record<string, unknown> = { status };
      if (status === 'active') updates.started_at = new Date().toISOString();
      if (['ended', 'missed', 'rejected'].includes(status)) updates.ended_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('call_sessions')
        .update(updates)
        .eq('id', callId)
        .select()
        .single();

      if (error) {
        await logUsage(supabase, apiKeyData.id, `/${callId}/status`, 'PUT', 404, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Call not found' } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logUsage(supabase, apiKeyData.id, `/${callId}/status`, 'PUT', 200, Date.now() - startTime, ipAddress);
      return new Response(
        JSON.stringify({ success: true, data, meta: { timestamp: new Date().toISOString() } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: GET /api-calls/history
    if (req.method === 'GET' && pathParts.includes('history')) {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      // Get user's conversations
      const { data: memberData } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', userId);

      const conversationIds = memberData?.map((m: any) => m.conversation_id) || [];

      const { data, error } = await supabase
        .from('call_sessions')
        .select(`
          *,
          conversation:conversations(id, name, is_group)
        `)
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      await logUsage(supabase, apiKeyData.id, '/history', 'GET', 200, Date.now() - startTime, ipAddress);
      return new Response(
        JSON.stringify({ success: true, data: data || [], meta: { timestamp: new Date().toISOString(), count: data?.length || 0, limit, offset } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: GET /api-calls/:id
    if (req.method === 'GET') {
      const callId = pathParts[pathParts.length - 1];

      if (callId && callId !== 'api-calls') {
        const { data, error } = await supabase
          .from('call_sessions')
          .select(`
            *,
            conversation:conversations(id, name, is_group)
          `)
          .eq('id', callId)
          .single();

        if (error) {
          await logUsage(supabase, apiKeyData.id, `/${callId}`, 'GET', 404, Date.now() - startTime, ipAddress);
          return new Response(
            JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Call not found' } }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await logUsage(supabase, apiKeyData.id, `/${callId}`, 'GET', 200, Date.now() - startTime, ipAddress);
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
