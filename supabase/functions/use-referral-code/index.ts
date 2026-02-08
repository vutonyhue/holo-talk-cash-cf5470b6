import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[use-referral-code] Missing authorization header');
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
      console.error('[use-referral-code] Auth error:', {
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

    const userId = user.id;

    // Use service role for database operations (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get code from request body
    const body = await req.json();
    const code = body.code?.toUpperCase()?.trim();

    if (!code) {
      return new Response(
        JSON.stringify({ error: 'Missing referral code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[use-referral-code] Using code:', code, 'by user:', userId);

    // Check if user already used a referral code
    const { data: existingUse } = await supabase
      .from('referral_uses')
      .select('id')
      .eq('referred_user_id', userId)
      .single();

    if (existingUse) {
      return new Response(
        JSON.stringify({ error: 'Bạn đã sử dụng mã giới thiệu trước đó' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find the referral code
    const { data: referralCode, error: codeError } = await supabase
      .from('referral_codes')
      .select('*')
      .eq('code', code)
      .single();

    if (codeError || !referralCode) {
      return new Response(
        JSON.stringify({ error: 'Mã giới thiệu không tồn tại' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if code is active
    if (!referralCode.is_active) {
      return new Response(
        JSON.stringify({ error: 'Mã giới thiệu đã hết hiệu lực' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is trying to use their own code
    if (referralCode.user_id === userId) {
      return new Response(
        JSON.stringify({ error: 'Bạn không thể sử dụng mã giới thiệu của chính mình' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check max uses
    if (referralCode.uses_count >= referralCode.max_uses) {
      return new Response(
        JSON.stringify({ error: 'Mã giới thiệu này đã đạt giới hạn sử dụng' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert referral use (trigger will handle the rest)
    const { error: insertError } = await supabase
      .from('referral_uses')
      .insert({
        referral_code_id: referralCode.id,
        referred_user_id: userId,
        referrer_user_id: referralCode.user_id
      });

    if (insertError) {
      console.error('[use-referral-code] Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Không thể sử dụng mã giới thiệu' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update profile with referred_by
    await supabase
      .from('profiles')
      .update({ referred_by: referralCode.id })
      .eq('id', userId);

    // Get referrer's username
    const { data: referrerProfile } = await supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', referralCode.user_id)
      .single();

    console.log('[use-referral-code] Referral code used successfully');

    return new Response(
      JSON.stringify({
        success: true,
        referrer_username: referrerProfile?.display_name || referrerProfile?.username || 'Unknown'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[use-referral-code] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
