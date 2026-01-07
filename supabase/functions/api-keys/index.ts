import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate a random API key
function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'fc_live_';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

// Hash API key using SHA-256
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Get auth token from header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const action = pathParts[pathParts.length - 1];

    // POST - Create new API key
    if (req.method === 'POST') {
      const body = await req.json();
      const { name, permissions, rate_limit, expires_at } = body;

      if (!name) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Name is required' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate and hash the API key
      const rawApiKey = generateApiKey();
      const hashedApiKey = await hashApiKey(rawApiKey);
      const keyPrefix = rawApiKey.substring(0, 12);

      const { data, error } = await supabase
        .from('api_keys')
        .insert({
          user_id: user.id,
          api_key: hashedApiKey,
          key_prefix: keyPrefix,
          name,
          permissions: permissions || { chat: true, users: true, calls: true, crypto: true },
          rate_limit: rate_limit || 60,
          expires_at: expires_at || null
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating API key:', error);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'DATABASE_ERROR', message: error.message } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Return the raw key only once (user must save it)
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: data.id,
            name: data.name,
            api_key: rawApiKey, // Only shown once!
            key_prefix: data.key_prefix,
            permissions: data.permissions,
            rate_limit: data.rate_limit,
            created_at: data.created_at,
            expires_at: data.expires_at
          },
          meta: { timestamp: new Date().toISOString() }
        }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET - List API keys or usage
    if (req.method === 'GET') {
      if (action === 'usage') {
        // Get usage statistics
        const keyId = url.searchParams.get('key_id');
        
        let query = supabase
          .from('api_usage_logs')
          .select('*, api_keys!inner(user_id)')
          .eq('api_keys.user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100);

        if (keyId) {
          query = query.eq('api_key_id', keyId);
        }

        const { data, error } = await query;

        if (error) {
          console.error('Error fetching usage:', error);
          return new Response(
            JSON.stringify({ success: false, error: { code: 'DATABASE_ERROR', message: error.message } }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: data || [],
            meta: { timestamp: new Date().toISOString(), count: data?.length || 0 }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // List all API keys
      const { data, error } = await supabase
        .from('api_keys')
        .select('id, name, key_prefix, permissions, rate_limit, is_active, last_used_at, created_at, expires_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching API keys:', error);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'DATABASE_ERROR', message: error.message } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: data || [],
          meta: { timestamp: new Date().toISOString(), count: data?.length || 0 }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // DELETE - Remove API key
    if (req.method === 'DELETE') {
      const keyId = url.searchParams.get('id');
      
      if (!keyId) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: 'API key ID is required' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting API key:', error);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'DATABASE_ERROR', message: error.message } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: { deleted: true },
          meta: { timestamp: new Date().toISOString() }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PATCH - Update API key
    if (req.method === 'PATCH') {
      const body = await req.json();
      const { id, name, permissions, rate_limit, is_active } = body;

      if (!id) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: 'API key ID is required' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (permissions !== undefined) updates.permissions = permissions;
      if (rate_limit !== undefined) updates.rate_limit = rate_limit;
      if (is_active !== undefined) updates.is_active = is_active;

      const { data, error } = await supabase
        .from('api_keys')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating API key:', error);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'DATABASE_ERROR', message: error.message } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data,
          meta: { timestamp: new Date().toISOString() }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
