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
      scopes: scopesHeader ? scopesHeader.split(',').map(s => s.trim()) : ['calls:read', 'calls:write'],
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

  // Legacy: backward compatibility
  if (keyId) {
    return {
      mode: 'api_key',
      userId,
      keyId,
      scopes: scopesHeader ? scopesHeader.split(',').map(s => s.trim()) : [],
    };
  }

  // Default to JWT mode if userId exists
  return {
    mode: 'jwt',
    userId,
    scopes: scopesHeader ? scopesHeader.split(',').map(s => s.trim()) : ['calls:read', 'calls:write'],
  };
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

// Dispatch webhook for event
async function dispatchWebhook(
  supabase: any,
  auth: AuthContext,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  if (auth.mode !== 'api_key' || !auth.keyId) return;

  try {
    const { data: webhooks } = await supabase
      .from('webhooks')
      .select('*')
      .eq('api_key_id', auth.keyId)
      .eq('is_active', true)
      .contains('events', [event]);

    if (!webhooks || webhooks.length === 0) return;

    const payload = JSON.stringify({
      event,
      data,
      timestamp: new Date().toISOString(),
      api_key_id: auth.keyId,
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

    // Validate authentication (dual mode)
    const auth = validateAuth(req);
    if (!auth) {
      return errorResponse('UNAUTHORIZED', 'Invalid or missing authentication', 401);
    }

    const { userId, scopes } = auth;
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const ipAddress = req.headers.get('x-forwarded-for') || 'unknown';

    console.log(`[api-calls] ${req.method} ${url.pathname} - User: ${userId}`);

    // ========================================================================
    // CALL SESSIONS
    // ========================================================================

    // Route: POST /api-calls - Start a new call
    if (req.method === 'POST' && pathParts.length === 1 && pathParts[0] === 'api-calls') {
      if (!hasScope(scopes, 'calls:write')) {
        return errorResponse('FORBIDDEN', 'Requires calls:write scope', 403);
      }

      const body = await req.json();
      const { conversation_id, call_type } = body;

      if (!conversation_id) {
        await logUsage(supabase, auth, '/api-calls', 'POST', 400, Date.now() - startTime, ipAddress);
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
        await logUsage(supabase, auth, '/api-calls', 'POST', 403, Date.now() - startTime, ipAddress);
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
        .select(`
          *,
          caller:profiles!call_sessions_caller_id_fkey(id, username, display_name, avatar_url)
        `)
        .single();

      if (error) {
        console.error('Error creating call:', error);
        await logUsage(supabase, auth, '/api-calls', 'POST', 500, Date.now() - startTime, ipAddress);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      // Dispatch webhook
      await dispatchWebhook(supabase, auth, 'call.started', {
        call_id: data.id,
        conversation_id,
        caller_id: userId,
        call_type: call_type || 'video',
      });

      await logUsage(supabase, auth, '/api-calls', 'POST', 201, Date.now() - startTime, ipAddress);
      return successResponse(data, 201);
    }

    // Route: PATCH /api-calls/:id - Update call status (accept/reject/end)
    if (req.method === 'PATCH' && pathParts.length === 2 && pathParts[0] === 'api-calls') {
      if (!hasScope(scopes, 'calls:write')) {
        return errorResponse('FORBIDDEN', 'Requires calls:write scope', 403);
      }

      const callId = pathParts[1];
      const body = await req.json();
      const { status } = body;

      if (!['ringing', 'accepted', 'rejected', 'ended', 'missed'].includes(status)) {
        await logUsage(supabase, auth, `/api-calls/${callId}`, 'PATCH', 400, Date.now() - startTime, ipAddress);
        return errorResponse('VALIDATION_ERROR', 'Invalid status. Must be: ringing, accepted, rejected, ended, missed', 400);
      }

      // Build update object
      const updates: Record<string, unknown> = { status };
      if (status === 'accepted') {
        updates.started_at = new Date().toISOString();
      }
      if (['ended', 'rejected', 'missed'].includes(status)) {
        updates.ended_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('call_sessions')
        .update(updates)
        .eq('id', callId)
        .select(`
          *,
          caller:profiles!call_sessions_caller_id_fkey(id, username, display_name, avatar_url)
        `)
        .single();

      if (error) {
        console.error('Error updating call:', error);
        await logUsage(supabase, auth, `/api-calls/${callId}`, 'PATCH', 404, Date.now() - startTime, ipAddress);
        return errorResponse('NOT_FOUND', 'Call not found', 404);
      }

      // Dispatch webhook for ended/rejected/missed calls
      if (['ended', 'rejected', 'missed'].includes(status)) {
        await dispatchWebhook(supabase, auth, 'call.ended', {
          call_id: callId,
          conversation_id: data.conversation_id,
          status,
        });
      }

      await logUsage(supabase, auth, `/api-calls/${callId}`, 'PATCH', 200, Date.now() - startTime, ipAddress);
      return successResponse(data);
    }

    // Route: GET /api-calls/history - Get call history
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

      if (conversationIds.length === 0) {
        await logUsage(supabase, auth, '/api-calls/history', 'GET', 200, Date.now() - startTime, ipAddress);
        return successResponse({ calls: [], total: 0 });
      }

      const { data, error } = await supabase
        .from('call_sessions')
        .select(`
          *,
          conversation:conversations(id, name, is_group),
          caller:profiles!call_sessions_caller_id_fkey(id, username, display_name, avatar_url)
        `)
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      await logUsage(supabase, auth, '/api-calls/history', 'GET', 200, Date.now() - startTime, ipAddress);
      return successResponse({ calls: data || [], total: data?.length || 0 });
    }

    // Route: GET /api-calls/:id - Get single call
    if (req.method === 'GET' && pathParts.length === 2 && pathParts[0] === 'api-calls') {
      if (!hasScope(scopes, 'calls:read')) {
        return errorResponse('FORBIDDEN', 'Requires calls:read scope', 403);
      }

      const callId = pathParts[1];

      const { data, error } = await supabase
        .from('call_sessions')
        .select(`
          *,
          conversation:conversations(id, name, is_group),
          caller:profiles!call_sessions_caller_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('id', callId)
        .single();

      if (error) {
        await logUsage(supabase, auth, `/api-calls/${callId}`, 'GET', 404, Date.now() - startTime, ipAddress);
        return errorResponse('NOT_FOUND', 'Call not found', 404);
      }

      // Verify user has access (is in conversation)
      const { data: membership } = await supabase
        .from('conversation_members')
        .select('id')
        .eq('conversation_id', data.conversation_id)
        .eq('user_id', userId)
        .single();

      if (!membership) {
        await logUsage(supabase, auth, `/api-calls/${callId}`, 'GET', 403, Date.now() - startTime, ipAddress);
        return errorResponse('FORBIDDEN', 'Not a member of this conversation', 403);
      }

      await logUsage(supabase, auth, `/api-calls/${callId}`, 'GET', 200, Date.now() - startTime, ipAddress);
      return successResponse(data);
    }

    // Route: POST /api-calls/:id/message - Send call status message
    if (req.method === 'POST' && pathParts.length === 3 && pathParts[2] === 'message') {
      if (!hasScope(scopes, 'calls:write')) {
        return errorResponse('FORBIDDEN', 'Requires calls:write scope', 403);
      }

      const callId = pathParts[1];
      const body = await req.json();
      const { call_status, call_type, duration } = body;

      // Get call info
      const { data: call } = await supabase
        .from('call_sessions')
        .select('conversation_id, call_type')
        .eq('id', callId)
        .single();

      if (!call) {
        return errorResponse('NOT_FOUND', 'Call not found', 404);
      }

      // Build message content
      const statusMessages: Record<string, string> = {
        rejected: call_type === 'video' ? 'Cuộc gọi video bị từ chối' : 'Cuộc gọi thoại bị từ chối',
        ended: call_type === 'video' 
          ? `Cuộc gọi video đã kết thúc${duration ? ` (${Math.floor(duration / 60)} phút ${duration % 60} giây)` : ''}`
          : `Cuộc gọi thoại đã kết thúc${duration ? ` (${Math.floor(duration / 60)} phút ${duration % 60} giây)` : ''}`,
        missed: call_type === 'video' ? 'Cuộc gọi video nhỡ' : 'Cuộc gọi thoại nhỡ',
      };

      const content = statusMessages[call_status] || 'Cuộc gọi đã kết thúc';

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: call.conversation_id,
          sender_id: userId,
          content,
          message_type: 'call',
          metadata: {
            call_id: callId,
            call_type: call_type || call.call_type,
            call_status,
            duration: duration || null,
          },
        })
        .select()
        .single();

      if (error) {
        console.error('Error sending call message:', error);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      await logUsage(supabase, auth, `/api-calls/${callId}/message`, 'POST', 201, Date.now() - startTime, ipAddress);
      return successResponse(data, 201);
    }

    return errorResponse('NOT_FOUND', 'Endpoint not found', 404);

  } catch (error) {
    console.error('Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', String(error), 500);
  }
});
