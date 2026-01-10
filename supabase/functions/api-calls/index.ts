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

function successResponse<T>(data: T, status: number = 200, meta?: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({ success: true, data, meta: { timestamp: new Date().toISOString(), ...meta } }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
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

function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required);
}

// Log API usage
async function logUsage(
  supabase: any, 
  apiKeyId: string, 
  endpoint: string, 
  method: string, 
  statusCode: number, 
  responseTimeMs: number, 
  ipAddress: string
): Promise<void> {
  try {
    await supabase.from('api_usage_logs').insert({
      api_key_id: apiKeyId,
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

// Dispatch webhook for event
async function dispatchWebhook(
  supabase: any,
  apiKeyId: string,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const { data: webhooks } = await supabase
      .from('webhooks')
      .select('*')
      .eq('api_key_id', apiKeyId)
      .eq('is_active', true)
      .contains('events', [event]);

    if (!webhooks || webhooks.length === 0) return;

    const payload = JSON.stringify({
      event,
      data,
      timestamp: new Date().toISOString(),
      api_key_id: apiKeyId,
    });

    for (const webhook of webhooks) {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(webhook.secret);
      const messageData = encoder.encode(payload);
      const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
      const signatureHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-FunChat-Event': event,
          'X-FunChat-Signature': `sha256=${signatureHex}`,
          'X-FunChat-Timestamp': Date.now().toString(),
        },
        body: payload,
      }).then(async (res) => {
        await supabase.from('webhooks').update({
          last_triggered_at: new Date().toISOString(),
          last_success_at: res.ok ? new Date().toISOString() : undefined,
          last_failure_at: res.ok ? undefined : new Date().toISOString(),
          failure_count: res.ok ? 0 : (webhook.failure_count || 0) + 1,
        }).eq('id', webhook.id);
      }).catch(() => {});
    }
  } catch (e) {
    console.error('Webhook dispatch error:', e);
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

    // Validate authentication
    const auth = validateAuth(req);
    if (!auth) {
      return errorResponse('UNAUTHORIZED', 'Invalid or missing authentication', 401);
    }

    const { keyId, userId, scopes } = auth;
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const ipAddress = req.headers.get('x-forwarded-for') || 'unknown';

    // Route: POST /api-calls/initiate
    if (req.method === 'POST' && pathParts.includes('initiate')) {
      if (!hasScope(scopes, 'calls:write')) {
        return errorResponse('FORBIDDEN', 'Requires calls:write scope', 403);
      }

      const body = await req.json();
      const { conversation_id, call_type } = body;

      if (!conversation_id) {
        await logUsage(supabase, keyId, '/initiate', 'POST', 400, Date.now() - startTime, ipAddress);
        return errorResponse('VALIDATION_ERROR', 'conversation_id is required', 400);
      }

      // Check if user is member of conversation
      const { data: membership } = await supabase
        .from('conversation_members')
        .select('id')
        .eq('conversation_id', conversation_id)
        .eq('user_id', userId)
        .single();

      if (!membership) {
        await logUsage(supabase, keyId, '/initiate', 'POST', 403, Date.now() - startTime, ipAddress);
        return errorResponse('FORBIDDEN', 'Not a member of this conversation', 403);
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
        await logUsage(supabase, keyId, '/initiate', 'POST', 500, Date.now() - startTime, ipAddress);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      // Dispatch webhook
      await dispatchWebhook(supabase, keyId, 'call.started', {
        call_id: data.id,
        conversation_id,
        caller_id: userId,
        call_type: call_type || 'video',
      });

      await logUsage(supabase, keyId, '/initiate', 'POST', 201, Date.now() - startTime, ipAddress);
      return successResponse(data, 201);
    }

    // Route: PUT /api-calls/:id/status
    if (req.method === 'PUT' && pathParts.includes('status')) {
      if (!hasScope(scopes, 'calls:write')) {
        return errorResponse('FORBIDDEN', 'Requires calls:write scope', 403);
      }

      const callId = pathParts[pathParts.indexOf('api-calls') + 1];
      const body = await req.json();
      const { status } = body;

      if (!['ringing', 'active', 'ended', 'missed', 'rejected'].includes(status)) {
        await logUsage(supabase, keyId, `/${callId}/status`, 'PUT', 400, Date.now() - startTime, ipAddress);
        return errorResponse('VALIDATION_ERROR', 'Invalid status', 400);
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
        await logUsage(supabase, keyId, `/${callId}/status`, 'PUT', 404, Date.now() - startTime, ipAddress);
        return errorResponse('NOT_FOUND', 'Call not found', 404);
      }

      // Dispatch webhook for ended calls
      if (['ended', 'missed', 'rejected'].includes(status)) {
        await dispatchWebhook(supabase, keyId, 'call.ended', {
          call_id: callId,
          conversation_id: data.conversation_id,
          status,
        });
      }

      await logUsage(supabase, keyId, `/${callId}/status`, 'PUT', 200, Date.now() - startTime, ipAddress);
      return successResponse(data);
    }

    // Route: GET /api-calls/history
    if (req.method === 'GET' && pathParts.includes('history')) {
      if (!hasScope(scopes, 'calls:read')) {
        return errorResponse('FORBIDDEN', 'Requires calls:read scope', 403);
      }

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

      await logUsage(supabase, keyId, '/history', 'GET', 200, Date.now() - startTime, ipAddress);
      return successResponse(data || [], 200, { count: data?.length || 0, limit, offset });
    }

    // Route: GET /api-calls/:id
    if (req.method === 'GET') {
      if (!hasScope(scopes, 'calls:read')) {
        return errorResponse('FORBIDDEN', 'Requires calls:read scope', 403);
      }

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
          await logUsage(supabase, keyId, `/${callId}`, 'GET', 404, Date.now() - startTime, ipAddress);
          return errorResponse('NOT_FOUND', 'Call not found', 404);
        }

        await logUsage(supabase, keyId, `/${callId}`, 'GET', 200, Date.now() - startTime, ipAddress);
        return successResponse(data);
      }
    }

    return errorResponse('NOT_FOUND', 'Endpoint not found', 404);

  } catch (error) {
    console.error('Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', String(error), 500);
  }
});
