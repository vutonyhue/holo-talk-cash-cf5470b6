import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Hash API key using SHA-256
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Validate API key and return user info
async function validateApiKey(req: Request, supabase: any) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header', status: 401 };
  }

  const apiKey = authHeader.replace('Bearer ', '');
  
  // Check if it's a Supabase JWT token (not an API key)
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

  // Check expiry
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return { error: 'API key has expired', status: 401 };
  }

  // Check permissions
  if (!keyData.permissions?.chat) {
    return { error: 'API key does not have chat permissions', status: 403 };
  }

  // Update last_used_at
  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyData.id);

  return { data: keyData };
}

// Log API usage
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

    // Validate API key
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

    // Route: GET /api-chat/conversations
    if (req.method === 'GET' && pathParts.includes('conversations') && !pathParts.includes('messages')) {
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
          await logUsage(supabase, apiKeyData.id, `/conversations/${conversationId}`, 'GET', 404, Date.now() - startTime, ipAddress);
          return new Response(
            JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if user is member
        const isMember = data.members?.some((m: any) => m.user_id === userId);
        if (!isMember) {
          await logUsage(supabase, apiKeyData.id, `/conversations/${conversationId}`, 'GET', 403, Date.now() - startTime, ipAddress);
          return new Response(
            JSON.stringify({ success: false, error: { code: 'FORBIDDEN', message: 'Not a member of this conversation' } }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await logUsage(supabase, apiKeyData.id, `/conversations/${conversationId}`, 'GET', 200, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: true, data, meta: { timestamp: new Date().toISOString() } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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

      await logUsage(supabase, apiKeyData.id, '/conversations', 'GET', 200, Date.now() - startTime, ipAddress);
      return new Response(
        JSON.stringify({ success: true, data: data || [], meta: { timestamp: new Date().toISOString(), count: data?.length || 0 } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: POST /api-chat/conversations
    if (req.method === 'POST' && pathParts.includes('conversations') && !pathParts.includes('messages')) {
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
        await logUsage(supabase, apiKeyData.id, '/conversations', 'POST', 500, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'DATABASE_ERROR', message: convError.message } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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

      await logUsage(supabase, apiKeyData.id, '/conversations', 'POST', 201, Date.now() - startTime, ipAddress);
      return new Response(
        JSON.stringify({ success: true, data: conversation, meta: { timestamp: new Date().toISOString() } }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: GET /api-chat/conversations/:id/messages
    if (req.method === 'GET' && pathParts.includes('messages')) {
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
        await logUsage(supabase, apiKeyData.id, `/conversations/${conversationId}/messages`, 'GET', 403, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'FORBIDDEN', message: 'Not a member of this conversation' } }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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

      await logUsage(supabase, apiKeyData.id, `/conversations/${conversationId}/messages`, 'GET', 200, Date.now() - startTime, ipAddress);
      return new Response(
        JSON.stringify({ success: true, data: data || [], meta: { timestamp: new Date().toISOString(), count: data?.length || 0, limit, offset } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: POST /api-chat/conversations/:id/messages
    if (req.method === 'POST' && pathParts.includes('messages')) {
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
        await logUsage(supabase, apiKeyData.id, `/conversations/${conversationId}/messages`, 'POST', 403, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'FORBIDDEN', message: 'Not a member of this conversation' } }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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
        await logUsage(supabase, apiKeyData.id, `/conversations/${conversationId}/messages`, 'POST', 500, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'DATABASE_ERROR', message: error.message } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update conversation updated_at
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      await logUsage(supabase, apiKeyData.id, `/conversations/${conversationId}/messages`, 'POST', 201, Date.now() - startTime, ipAddress);
      return new Response(
        JSON.stringify({ success: true, data, meta: { timestamp: new Date().toISOString() } }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: DELETE /api-chat/messages/:id
    if (req.method === 'DELETE' && pathParts.includes('messages')) {
      const messageId = pathParts[pathParts.indexOf('messages') + 1];

      const { data, error } = await supabase
        .from('messages')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', messageId)
        .eq('sender_id', userId)
        .select()
        .single();

      if (error) {
        await logUsage(supabase, apiKeyData.id, `/messages/${messageId}`, 'DELETE', 404, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Message not found or not owned by user' } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logUsage(supabase, apiKeyData.id, `/messages/${messageId}`, 'DELETE', 200, Date.now() - startTime, ipAddress);
      return new Response(
        JSON.stringify({ success: true, data: { deleted: true }, meta: { timestamp: new Date().toISOString() } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
