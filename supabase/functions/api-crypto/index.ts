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

  if (!keyData.permissions?.crypto) {
    return { error: 'API key does not have crypto permissions', status: 403 };
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

    // Route: POST /api-crypto/transfer
    if (req.method === 'POST' && pathParts.includes('transfer')) {
      const body = await req.json();
      const { to_user_id, amount, currency, tx_hash, message_id } = body;

      if (!to_user_id || !amount || !currency) {
        await logUsage(supabase, apiKeyData.id, '/transfer', 'POST', 400, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: 'to_user_id, amount, and currency are required' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (amount <= 0) {
        await logUsage(supabase, apiKeyData.id, '/transfer', 'POST', 400, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Amount must be greater than 0' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify recipient exists
      const { data: recipient } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', to_user_id)
        .single();

      if (!recipient) {
        await logUsage(supabase, apiKeyData.id, '/transfer', 'POST', 404, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Recipient not found' } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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
        await logUsage(supabase, apiKeyData.id, '/transfer', 'POST', 500, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'DATABASE_ERROR', message: error.message } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logUsage(supabase, apiKeyData.id, '/transfer', 'POST', 201, Date.now() - startTime, ipAddress);
      return new Response(
        JSON.stringify({ success: true, data, meta: { timestamp: new Date().toISOString() } }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: GET /api-crypto/history
    if (req.method === 'GET' && pathParts.includes('history')) {
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
        await logUsage(supabase, apiKeyData.id, '/history', 'GET', 500, Date.now() - startTime, ipAddress);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'DATABASE_ERROR', message: error.message } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logUsage(supabase, apiKeyData.id, '/history', 'GET', 200, Date.now() - startTime, ipAddress);
      return new Response(
        JSON.stringify({ success: true, data: data || [], meta: { timestamp: new Date().toISOString(), count: data?.length || 0, limit, offset } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: GET /api-crypto/stats
    if (req.method === 'GET' && pathParts.includes('stats')) {
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

      await logUsage(supabase, apiKeyData.id, '/stats', 'GET', 200, Date.now() - startTime, ipAddress);
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            total_sent: sentByCurrency,
            total_received: receivedByCurrency,
            transaction_count: {
              sent: sent?.length || 0,
              received: received?.length || 0
            }
          },
          meta: { timestamp: new Date().toISOString() }
        }),
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
