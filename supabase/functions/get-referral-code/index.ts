import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate random 8-character alphanumeric code
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Get auth token from header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[get-referral-code] Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use anon key with Authorization header to verify user (standard pattern)
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user - DO NOT pass token, let client use header
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    
    if (authError || !user) {
      console.error('[get-referral-code] Auth error:', {
        message: authError?.message,
        status: authError?.status,
        hasHeader: !!authHeader
      });
      return new Response(
        JSON.stringify({ 
          error: 'Invalid token',
          detail: authError?.message || 'Authentication failed'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role for database operations (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const userId = user.id;
    console.log('[get-referral-code] Getting referral code for user:', userId);

    // Check if user already has a referral code
    const { data: existingCode, error: fetchError } = await supabase
      .from('referral_codes')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (existingCode) {
      console.log('[get-referral-code] Found existing code:', existingCode.code);
      return new Response(
        JSON.stringify({
          code: existingCode.code,
          uses_count: existingCode.uses_count,
          max_uses: existingCode.max_uses,
          is_active: existingCode.is_active,
          share_url: `${req.headers.get('origin') || 'https://funchat.app'}/auth?ref=${existingCode.code}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate a new unique code
    let code = generateCode();
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const { data: existing } = await supabase
        .from('referral_codes')
        .select('id')
        .eq('code', code)
        .single();

      if (!existing) break;
      
      code = generateCode();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.error('[get-referral-code] Failed to generate unique code after', maxAttempts, 'attempts');
      return new Response(
        JSON.stringify({ error: 'Failed to generate unique code' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert new referral code
    const { data: newCode, error: insertError } = await supabase
      .from('referral_codes')
      .insert({
        user_id: userId,
        code: code
      })
      .select()
      .single();

    if (insertError) {
      console.error('[get-referral-code] Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create referral code' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[get-referral-code] Created new code:', code);

    return new Response(
      JSON.stringify({
        code: newCode.code,
        uses_count: newCode.uses_count,
        max_uses: newCode.max_uses,
        is_active: newCode.is_active,
        share_url: `${req.headers.get('origin') || 'https://funchat.app'}/auth?ref=${newCode.code}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[get-referral-code] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
