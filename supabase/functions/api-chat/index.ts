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

    // Route: GET /api-chat/conversations
    if (req.method === 'GET' && pathParts.includes('conversations') && !pathParts.includes('messages')) {
      if (!hasScope(scopes, 'chat:read')) {
        return errorResponse('FORBIDDEN', 'Requires chat:read scope', 403);
      }

      const conversationId = pathParts[pathParts.indexOf('conversations') + 1];
      
      if (conversationId && conversationId !== 'conversations') {
        // Get single conversation
        const { data, error } = await supabase
          .from('conversations')
          .select(`
            *,
            members:conversation_members(
              user_id,
              role,
              profile:profiles(id, username, display_name, avatar_url)
            )
          `)
          .eq('id', conversationId)
          .single();

        if (error) {
          await logUsage(supabase, keyId, `/conversations/${conversationId}`, 'GET', 404, Date.now() - startTime, ipAddress);
          return errorResponse('NOT_FOUND', 'Conversation not found', 404);
        }

        // Check if user is member
        const isMember = data.members?.some((m: any) => m.user_id === userId);
        if (!isMember) {
          await logUsage(supabase, keyId, `/conversations/${conversationId}`, 'GET', 403, Date.now() - startTime, ipAddress);
          return errorResponse('FORBIDDEN', 'Not a member of this conversation', 403);
        }

        await logUsage(supabase, keyId, `/conversations/${conversationId}`, 'GET', 200, Date.now() - startTime, ipAddress);
        return successResponse(data);
      }

      // List all conversations
      const { data: memberData } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', userId);

      const conversationIds = memberData?.map((m: any) => m.conversation_id) || [];

      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          members:conversation_members(
            user_id,
            role,
            profile:profiles(id, username, display_name, avatar_url)
          )
        `)
        .in('id', conversationIds)
        .order('updated_at', { ascending: false });

      await logUsage(supabase, keyId, '/conversations', 'GET', 200, Date.now() - startTime, ipAddress);
      return successResponse(data || [], 200, { count: data?.length || 0 });
    }

    // Route: POST /api-chat/conversations
    if (req.method === 'POST' && pathParts.includes('conversations') && !pathParts.includes('messages')) {
      if (!hasScope(scopes, 'chat:write')) {
        return errorResponse('FORBIDDEN', 'Requires chat:write scope', 403);
      }

      const body = await req.json();
      const { name, is_group, member_ids } = body;

      // Create conversation
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          name: name || null,
          is_group: is_group || false,
          created_by: userId
        })
        .select()
        .single();

      if (convError) {
        await logUsage(supabase, keyId, '/conversations', 'POST', 500, Date.now() - startTime, ipAddress);
        return errorResponse('DATABASE_ERROR', convError.message, 500);
      }

      // Add creator as member
      await supabase.from('conversation_members').insert({
        conversation_id: conversation.id,
        user_id: userId,
        role: 'admin'
      });

      // Add other members
      if (member_ids && Array.isArray(member_ids)) {
        const members = member_ids.map((id: string) => ({
          conversation_id: conversation.id,
          user_id: id,
          role: 'member'
        }));
        await supabase.from('conversation_members').insert(members);
      }

      await logUsage(supabase, keyId, '/conversations', 'POST', 201, Date.now() - startTime, ipAddress);
      return successResponse(conversation, 201);
    }

    // Route: GET /api-chat/conversations/:id/messages
    if (req.method === 'GET' && pathParts.includes('messages')) {
      if (!hasScope(scopes, 'chat:read')) {
        return errorResponse('FORBIDDEN', 'Requires chat:read scope', 403);
      }

      const conversationId = pathParts[pathParts.indexOf('conversations') + 1];
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      // Check membership
      const { data: membership } = await supabase
        .from('conversation_members')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .single();

      if (!membership) {
        await logUsage(supabase, keyId, `/conversations/${conversationId}/messages`, 'GET', 403, Date.now() - startTime, ipAddress);
        return errorResponse('FORBIDDEN', 'Not a member of this conversation', 403);
      }

      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:profiles!messages_sender_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      await logUsage(supabase, keyId, `/conversations/${conversationId}/messages`, 'GET', 200, Date.now() - startTime, ipAddress);
      return successResponse(data || [], 200, { count: data?.length || 0, limit, offset });
    }

    // Route: POST /api-chat/conversations/:id/messages
    if (req.method === 'POST' && pathParts.includes('messages')) {
      if (!hasScope(scopes, 'chat:write')) {
        return errorResponse('FORBIDDEN', 'Requires chat:write scope', 403);
      }

      const conversationId = pathParts[pathParts.indexOf('conversations') + 1];
      const body = await req.json();
      const { content, message_type, metadata } = body;

      // Check membership
      const { data: membership } = await supabase
        .from('conversation_members')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .single();

      if (!membership) {
        await logUsage(supabase, keyId, `/conversations/${conversationId}/messages`, 'POST', 403, Date.now() - startTime, ipAddress);
        return errorResponse('FORBIDDEN', 'Not a member of this conversation', 403);
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content,
          message_type: message_type || 'text',
          metadata: metadata || {}
        })
        .select(`
          *,
          sender:profiles!messages_sender_id_fkey(id, username, display_name, avatar_url)
        `)
        .single();

      if (error) {
        await logUsage(supabase, keyId, `/conversations/${conversationId}/messages`, 'POST', 500, Date.now() - startTime, ipAddress);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      // Update conversation updated_at
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      // Dispatch webhook
      await dispatchWebhook(supabase, keyId, 'message.created', {
        message_id: data.id,
        conversation_id: conversationId,
        sender_id: userId,
        content_preview: content?.substring(0, 100),
      });

      await logUsage(supabase, keyId, `/conversations/${conversationId}/messages`, 'POST', 201, Date.now() - startTime, ipAddress);
      return successResponse(data, 201);
    }

    // Route: DELETE /api-chat/messages/:id
    if (req.method === 'DELETE' && pathParts.includes('messages')) {
      if (!hasScope(scopes, 'chat:write')) {
        return errorResponse('FORBIDDEN', 'Requires chat:write scope', 403);
      }

      const messageId = pathParts[pathParts.indexOf('messages') + 1];

      const { data, error } = await supabase
        .from('messages')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', messageId)
        .eq('sender_id', userId)
        .select()
        .single();

      if (error) {
        await logUsage(supabase, keyId, `/messages/${messageId}`, 'DELETE', 404, Date.now() - startTime, ipAddress);
        return errorResponse('NOT_FOUND', 'Message not found or not owned by user', 404);
      }

      // Dispatch webhook
      await dispatchWebhook(supabase, keyId, 'message.deleted', {
        message_id: messageId,
        conversation_id: data.conversation_id,
      });

      await logUsage(supabase, keyId, `/messages/${messageId}`, 'DELETE', 200, Date.now() - startTime, ipAddress);
      return successResponse({ deleted: true });
    }

    return errorResponse('NOT_FOUND', 'Endpoint not found', 404);

  } catch (error) {
    console.error('Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', String(error), 500);
  }
});
