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
      scopes: scopesHeader ? scopesHeader.split(',').map(s => s.trim()) : ['chat:read', 'chat:write'],
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

// Dispatch webhook for event (only for API key auth)
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

    // ========================================================================
    // CONVERSATIONS
    // ========================================================================

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
          await logUsage(supabase, auth, `/conversations/${conversationId}`, 'GET', 404, Date.now() - startTime, ipAddress);
          return errorResponse('NOT_FOUND', 'Conversation not found', 404);
        }

        // Check if user is member
        const isMember = data.members?.some((m: any) => m.user_id === userId);
        if (!isMember) {
          await logUsage(supabase, auth, `/conversations/${conversationId}`, 'GET', 403, Date.now() - startTime, ipAddress);
          return errorResponse('FORBIDDEN', 'Not a member of this conversation', 403);
        }

        await logUsage(supabase, auth, `/conversations/${conversationId}`, 'GET', 200, Date.now() - startTime, ipAddress);
        return successResponse(data);
      }

      // List all conversations
      const { data: memberData } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', userId);

      const conversationIds = memberData?.map((m: any) => m.conversation_id) || [];

      if (conversationIds.length === 0) {
        await logUsage(supabase, auth, '/conversations', 'GET', 200, Date.now() - startTime, ipAddress);
        return successResponse([], 200, { count: 0 });
      }

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

      await logUsage(supabase, auth, '/conversations', 'GET', 200, Date.now() - startTime, ipAddress);
      return successResponse(data || [], 200, { count: data?.length || 0 });
    }

    // Route: POST /api-chat/conversations
    if (req.method === 'POST' && pathParts.includes('conversations') && !pathParts.includes('messages') && !pathParts.includes('leave')) {
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
        await logUsage(supabase, auth, '/conversations', 'POST', 500, Date.now() - startTime, ipAddress);
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

      await logUsage(supabase, auth, '/conversations', 'POST', 201, Date.now() - startTime, ipAddress);
      return successResponse(conversation, 201);
    }

    // Route: POST /api-chat/conversations/:id/leave
    if (req.method === 'POST' && pathParts.includes('conversations') && pathParts.includes('leave')) {
      if (!hasScope(scopes, 'chat:write')) {
        return errorResponse('FORBIDDEN', 'Requires chat:write scope', 403);
      }

      const conversationId = pathParts[pathParts.indexOf('conversations') + 1];

      const { error } = await supabase
        .from('conversation_members')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);

      if (error) {
        await logUsage(supabase, auth, `/conversations/${conversationId}/leave`, 'POST', 500, Date.now() - startTime, ipAddress);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      await logUsage(supabase, auth, `/conversations/${conversationId}/leave`, 'POST', 200, Date.now() - startTime, ipAddress);
      return successResponse({ success: true });
    }

    // ========================================================================
    // MESSAGES
    // ========================================================================

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
        await logUsage(supabase, auth, `/conversations/${conversationId}/messages`, 'GET', 403, Date.now() - startTime, ipAddress);
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

      await logUsage(supabase, auth, `/conversations/${conversationId}/messages`, 'GET', 200, Date.now() - startTime, ipAddress);
      return successResponse(data || [], 200, { count: data?.length || 0, limit, offset });
    }

    // Route: POST /api-chat/conversations/:id/messages
    if (req.method === 'POST' && pathParts.includes('messages') && pathParts.includes('conversations')) {
      if (!hasScope(scopes, 'chat:write')) {
        return errorResponse('FORBIDDEN', 'Requires chat:write scope', 403);
      }

      const conversationId = pathParts[pathParts.indexOf('conversations') + 1];
      const body = await req.json();
      const { content, message_type, metadata, reply_to_id } = body;

      // Check membership
      const { data: membership } = await supabase
        .from('conversation_members')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .single();

      if (!membership) {
        await logUsage(supabase, auth, `/conversations/${conversationId}/messages`, 'POST', 403, Date.now() - startTime, ipAddress);
        return errorResponse('FORBIDDEN', 'Not a member of this conversation', 403);
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content,
          message_type: message_type || 'text',
          metadata: metadata || {},
          reply_to_id: reply_to_id || null
        })
        .select(`
          *,
          sender:profiles!messages_sender_id_fkey(id, username, display_name, avatar_url)
        `)
        .single();

      if (error) {
        await logUsage(supabase, auth, `/conversations/${conversationId}/messages`, 'POST', 500, Date.now() - startTime, ipAddress);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      // Update conversation updated_at
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      // Dispatch webhook
      await dispatchWebhook(supabase, auth, 'message.created', {
        message_id: data.id,
        conversation_id: conversationId,
        sender_id: userId,
        content_preview: content?.substring(0, 100),
      });

      await logUsage(supabase, auth, `/conversations/${conversationId}/messages`, 'POST', 201, Date.now() - startTime, ipAddress);
      return successResponse(data, 201);
    }

    // Route: DELETE /api-chat/messages/:id
    if (req.method === 'DELETE' && pathParts.includes('messages') && !pathParts.includes('conversations')) {
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
        await logUsage(supabase, auth, `/messages/${messageId}`, 'DELETE', 404, Date.now() - startTime, ipAddress);
        return errorResponse('NOT_FOUND', 'Message not found or not owned by user', 404);
      }

      // Dispatch webhook
      await dispatchWebhook(supabase, auth, 'message.deleted', {
        message_id: messageId,
        conversation_id: data.conversation_id,
      });

      await logUsage(supabase, auth, `/messages/${messageId}`, 'DELETE', 200, Date.now() - startTime, ipAddress);
      return successResponse({ deleted: true });
    }

    // ========================================================================
    // REACTIONS
    // ========================================================================

    // Route: POST /api-chat/reactions/batch - Get reactions for multiple messages
    if (req.method === 'POST' && pathParts.includes('reactions') && pathParts.includes('batch')) {
      if (!hasScope(scopes, 'chat:read')) {
        return errorResponse('FORBIDDEN', 'Requires chat:read scope', 403);
      }

      const body = await req.json();
      const { message_ids } = body;

      if (!message_ids || !Array.isArray(message_ids) || message_ids.length === 0) {
        return errorResponse('VALIDATION_ERROR', 'message_ids is required', 400);
      }

      const { data, error } = await supabase
        .from('message_reactions')
        .select('id, message_id, user_id, emoji, created_at')
        .in('message_id', message_ids);

      if (error) {
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      await logUsage(supabase, auth, '/reactions/batch', 'POST', 200, Date.now() - startTime, ipAddress);
      return successResponse(data || []);
    }

    // Route: POST /api-chat/reactions - Add reaction
    if (req.method === 'POST' && pathParts.includes('reactions') && !pathParts.includes('batch') && !pathParts.includes('toggle')) {
      if (!hasScope(scopes, 'chat:write')) {
        return errorResponse('FORBIDDEN', 'Requires chat:write scope', 403);
      }

      const body = await req.json();
      const { message_id, emoji } = body;

      if (!message_id || !emoji) {
        return errorResponse('VALIDATION_ERROR', 'message_id and emoji are required', 400);
      }

      // Verify user has access to the message's conversation
      const { data: message } = await supabase
        .from('messages')
        .select('conversation_id')
        .eq('id', message_id)
        .single();

      if (!message) {
        return errorResponse('NOT_FOUND', 'Message not found', 404);
      }

      const { data: membership } = await supabase
        .from('conversation_members')
        .select('id')
        .eq('conversation_id', message.conversation_id)
        .eq('user_id', userId)
        .single();

      if (!membership) {
        return errorResponse('FORBIDDEN', 'Not a member of this conversation', 403);
      }

      const { data, error } = await supabase
        .from('message_reactions')
        .insert({ message_id, user_id: userId, emoji })
        .select()
        .single();

      if (error) {
        // Might be a duplicate
        if (error.code === '23505') {
          return errorResponse('CONFLICT', 'Reaction already exists', 409);
        }
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      await logUsage(supabase, auth, '/reactions', 'POST', 201, Date.now() - startTime, ipAddress);
      return successResponse(data, 201);
    }

    // Route: DELETE /api-chat/reactions/:id - Remove reaction
    if (req.method === 'DELETE' && pathParts.includes('reactions')) {
      if (!hasScope(scopes, 'chat:write')) {
        return errorResponse('FORBIDDEN', 'Requires chat:write scope', 403);
      }

      const reactionId = pathParts[pathParts.indexOf('reactions') + 1];

      const { data, error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('id', reactionId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        return errorResponse('NOT_FOUND', 'Reaction not found or not owned by user', 404);
      }

      await logUsage(supabase, auth, `/reactions/${reactionId}`, 'DELETE', 200, Date.now() - startTime, ipAddress);
      return successResponse({ deleted: true });
    }

    // ========================================================================
    // READ RECEIPTS
    // ========================================================================

    // Route: POST /api-chat/read-receipts/batch - Get read receipts for messages
    if (req.method === 'POST' && pathParts.includes('read-receipts') && pathParts.includes('batch')) {
      if (!hasScope(scopes, 'chat:read')) {
        return errorResponse('FORBIDDEN', 'Requires chat:read scope', 403);
      }

      const body = await req.json();
      const { message_ids } = body;

      if (!message_ids || !Array.isArray(message_ids) || message_ids.length === 0) {
        return errorResponse('VALIDATION_ERROR', 'message_ids is required', 400);
      }

      const { data, error } = await supabase
        .from('message_reads')
        .select('id, message_id, user_id, read_at')
        .in('message_id', message_ids);

      if (error) {
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      await logUsage(supabase, auth, '/read-receipts/batch', 'POST', 200, Date.now() - startTime, ipAddress);
      return successResponse(data || []);
    }

    // Route: POST /api-chat/read-receipts - Mark messages as read
    if (req.method === 'POST' && pathParts.includes('read-receipts') && !pathParts.includes('batch')) {
      if (!hasScope(scopes, 'chat:write')) {
        return errorResponse('FORBIDDEN', 'Requires chat:write scope', 403);
      }

      const body = await req.json();
      const { message_ids } = body;

      if (!message_ids || !Array.isArray(message_ids) || message_ids.length === 0) {
        return errorResponse('VALIDATION_ERROR', 'message_ids is required', 400);
      }

      // Insert read receipts (ignore duplicates)
      const readReceipts = message_ids.map((messageId: string) => ({
        message_id: messageId,
        user_id: userId,
        read_at: new Date().toISOString()
      }));

      const { data, error } = await supabase
        .from('message_reads')
        .upsert(readReceipts, { onConflict: 'message_id,user_id', ignoreDuplicates: true })
        .select();

      if (error) {
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      await logUsage(supabase, auth, '/read-receipts', 'POST', 201, Date.now() - startTime, ipAddress);
      return successResponse({ marked: message_ids.length });
    }

    // ========================================================================
    // MEDIA PRESIGN
    // ========================================================================

    // Route: POST /api-chat/media/presign - Generate presigned upload URL
    if (req.method === 'POST' && pathParts.includes('media') && pathParts.includes('presign')) {
      if (!hasScope(scopes, 'chat:write')) {
        return errorResponse('FORBIDDEN', 'Requires chat:write scope', 403);
      }

      const body = await req.json();
      const { filename, contentType, bucket = 'chat-attachments', path: customPath } = body;

      if (!filename || !contentType) {
        return errorResponse('VALIDATION_ERROR', 'filename and contentType are required', 400);
      }

      // Generate unique path
      const ext = filename.split('.').pop() || 'bin';
      const uniqueFilename = customPath || `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      // Create signed upload URL
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUploadUrl(uniqueFilename);

      if (error) {
        console.error('Presign error:', error);
        return errorResponse('STORAGE_ERROR', error.message, 500);
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(uniqueFilename);

      await logUsage(supabase, auth, '/media/presign', 'POST', 200, Date.now() - startTime, ipAddress);
      return successResponse({
        uploadUrl: data.signedUrl,
        publicUrl: publicUrlData.publicUrl,
        path: uniqueFilename,
      });
    }

    return errorResponse('NOT_FOUND', 'Endpoint not found', 404);

  } catch (error) {
    console.error('Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', String(error), 500);
  }
});
