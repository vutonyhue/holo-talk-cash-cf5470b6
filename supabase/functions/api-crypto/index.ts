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

    // Route: POST /api-crypto/transfer
    if (req.method === 'POST' && pathParts.includes('transfer')) {
      if (!hasScope(scopes, 'crypto:write')) {
        return errorResponse('FORBIDDEN', 'Requires crypto:write scope', 403);
      }

      const body = await req.json();
      const { to_user_id, amount, currency, tx_hash, message_id } = body;

      if (!to_user_id || !amount || !currency) {
        await logUsage(supabase, keyId, '/transfer', 'POST', 400, Date.now() - startTime, ipAddress);
        return errorResponse('VALIDATION_ERROR', 'to_user_id, amount, and currency are required', 400);
      }

      if (amount <= 0) {
        await logUsage(supabase, keyId, '/transfer', 'POST', 400, Date.now() - startTime, ipAddress);
        return errorResponse('VALIDATION_ERROR', 'Amount must be greater than 0', 400);
      }

      // Verify recipient exists
      const { data: recipient } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', to_user_id)
        .single();

      if (!recipient) {
        await logUsage(supabase, keyId, '/transfer', 'POST', 404, Date.now() - startTime, ipAddress);
        return errorResponse('NOT_FOUND', 'Recipient not found', 404);
      }

      const { data, error } = await supabase
        .from('crypto_transactions')
        .insert({
          from_user_id: userId,
          to_user_id,
          amount,
          currency,
          tx_hash: tx_hash || null,
          message_id: message_id || null,
          status: tx_hash ? 'completed' : 'pending'
        })
        .select()
        .single();

      if (error) {
        await logUsage(supabase, keyId, '/transfer', 'POST', 500, Date.now() - startTime, ipAddress);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      // Dispatch webhook
      await dispatchWebhook(supabase, keyId, 'crypto.transfer', {
        transaction_id: data.id,
        from_user_id: userId,
        to_user_id,
        amount,
        currency,
        status: data.status,
      });

      await logUsage(supabase, keyId, '/transfer', 'POST', 201, Date.now() - startTime, ipAddress);
      return successResponse(data, 201);
    }

    // Route: GET /api-crypto/history
    if (req.method === 'GET' && pathParts.includes('history')) {
      if (!hasScope(scopes, 'crypto:read')) {
        return errorResponse('FORBIDDEN', 'Requires crypto:read scope', 403);
      }

      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const type = url.searchParams.get('type'); // 'sent', 'received', or null for all

      let query = supabase
        .from('crypto_transactions')
        .select(`
          *,
          from_user:profiles!crypto_transactions_from_user_id_fkey(id, username, display_name, avatar_url),
          to_user:profiles!crypto_transactions_to_user_id_fkey(id, username, display_name, avatar_url)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (type === 'sent') {
        query = query.eq('from_user_id', userId);
      } else if (type === 'received') {
        query = query.eq('to_user_id', userId);
      } else {
        query = query.or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
      }

      const { data, error } = await query;

      if (error) {
        await logUsage(supabase, keyId, '/history', 'GET', 500, Date.now() - startTime, ipAddress);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      await logUsage(supabase, keyId, '/history', 'GET', 200, Date.now() - startTime, ipAddress);
      return successResponse(data || [], 200, { count: data?.length || 0, limit, offset });
    }

    // Route: GET /api-crypto/stats
    if (req.method === 'GET' && pathParts.includes('stats')) {
      if (!hasScope(scopes, 'crypto:read')) {
        return errorResponse('FORBIDDEN', 'Requires crypto:read scope', 403);
      }

      // Get aggregated stats
      const { data: sent } = await supabase
        .from('crypto_transactions')
        .select('amount, currency')
        .eq('from_user_id', userId)
        .eq('status', 'completed');

      const { data: received } = await supabase
        .from('crypto_transactions')
        .select('amount, currency')
        .eq('to_user_id', userId)
        .eq('status', 'completed');

      // Aggregate by currency
      const sentByCurrency: Record<string, number> = {};
      const receivedByCurrency: Record<string, number> = {};

      sent?.forEach((tx: any) => {
        sentByCurrency[tx.currency] = (sentByCurrency[tx.currency] || 0) + parseFloat(tx.amount);
      });

      received?.forEach((tx: any) => {
        receivedByCurrency[tx.currency] = (receivedByCurrency[tx.currency] || 0) + parseFloat(tx.amount);
      });

      await logUsage(supabase, keyId, '/stats', 'GET', 200, Date.now() - startTime, ipAddress);
      return successResponse({
        total_sent: sentByCurrency,
        total_received: receivedByCurrency,
        transaction_count: {
          sent: sent?.length || 0,
          received: received?.length || 0
        }
      });
    }

    return errorResponse('NOT_FOUND', 'Endpoint not found', 404);

  } catch (error) {
    console.error('Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', String(error), 500);
  }
});
