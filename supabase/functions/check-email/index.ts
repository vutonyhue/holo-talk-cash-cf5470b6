import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Email validation regex (practical)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Rate limit: 30 requests per minute per IP
const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 60;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ success: false, error: 'METHOD_NOT_ALLOWED' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('e');

    if (!email) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'VALIDATION_ERROR',
          message: 'Email is required' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize email
    const normalized = email.trim().toLowerCase();

    // Validate format
    if (!EMAIL_REGEX.test(normalized)) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          valid: false,
          normalized,
          available: null,
          error: 'INVALID_FORMAT',
          message: 'Invalid email format'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get client IP for rate limiting
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('cf-connecting-ip') || 
                     'unknown';

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check rate limit using RPC function
    const { data: allowed, error: rlError } = await supabase.rpc('rl_increment', {
      p_identifier: clientIP,
      p_action_type: 'email_check',
      p_limit: RATE_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS
    });

    if (rlError) {
      console.error('Rate limit check error:', rlError);
    }

    if (allowed === false) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'RATE_LIMITED',
          message: 'Too many requests, please try again later'
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if email exists in auth.users (using admin API)
    const { data: users, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('Auth query error:', authError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'SERVER_ERROR',
          message: 'Unable to check email availability'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if any user has this email
    const emailTaken = users?.users?.some(
      (user) => user.email?.toLowerCase() === normalized
    ) ?? false;

    console.log(`Email check: ${normalized.substring(0, 3)}***@***.*** - Available: ${!emailTaken}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        valid: true,
        normalized,
        available: !emailTaken,
        ...(emailTaken && { error: 'EMAIL_TAKEN', message: 'This email is already registered' })
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'SERVER_ERROR',
        message: 'An unexpected error occurred'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
