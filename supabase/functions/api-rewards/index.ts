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
      scopes: scopesHeader ? scopesHeader.split(',').map(s => s.trim()) : ['rewards:read', 'rewards:write'],
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
  // Also accept broader scopes
  if (required.startsWith('rewards:')) {
    return scopes.some(s => s === required || s === 'rewards:read' || s === 'rewards:write');
  }
  return scopes.includes(required);
}

serve(async (req) => {
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

    // ========================================================================
    // REWARD TASKS
    // ========================================================================

    // Route: GET /api-rewards/tasks - List all reward tasks
    if (req.method === 'GET' && pathParts.includes('tasks')) {
      if (!hasScope(scopes, 'rewards:read')) {
        return errorResponse('FORBIDDEN', 'Requires rewards:read scope', 403);
      }

      const { data, error } = await supabase
        .from('reward_tasks')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      return successResponse(data || []);
    }

    // Route: GET /api-rewards/user-rewards - Get user's reward progress
    if (req.method === 'GET' && pathParts.includes('user-rewards')) {
      if (!hasScope(scopes, 'rewards:read')) {
        return errorResponse('FORBIDDEN', 'Requires rewards:read scope', 403);
      }

      const { data, error } = await supabase
        .from('user_rewards')
        .select(`
          *,
          task:reward_tasks(*)
        `)
        .eq('user_id', userId);

      if (error) {
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      return successResponse(data || []);
    }

    // Route: GET /api-rewards/summary - Get rewards summary
    if (req.method === 'GET' && pathParts.includes('summary')) {
      if (!hasScope(scopes, 'rewards:read')) {
        return errorResponse('FORBIDDEN', 'Requires rewards:read scope', 403);
      }

      // Get user rewards with task info
      const { data: userRewards, error: rewardsError } = await supabase
        .from('user_rewards')
        .select(`
          *,
          task:reward_tasks(reward_amount)
        `)
        .eq('user_id', userId);

      if (rewardsError) {
        return errorResponse('DATABASE_ERROR', rewardsError.message, 500);
      }

      // Get referral count
      const { data: referralCode } = await supabase
        .from('referral_codes')
        .select('uses_count')
        .eq('user_id', userId)
        .single();

      const totalEarned = (userRewards || [])
        .filter((r: any) => r.status === 'claimed' || r.status === 'paid')
        .reduce((sum: number, r: any) => sum + (r.task?.reward_amount || 0), 0);

      const pendingAmount = (userRewards || [])
        .filter((r: any) => r.status === 'completed')
        .reduce((sum: number, r: any) => sum + (r.task?.reward_amount || 0), 0);

      const tasksCompleted = (userRewards || [])
        .filter((r: any) => r.status === 'completed' || r.status === 'claimed' || r.status === 'paid')
        .length;

      return successResponse({
        total_earned: totalEarned,
        pending_amount: pendingAmount,
        referral_count: referralCode?.uses_count || 0,
        tasks_completed: tasksCompleted,
      });
    }

    // Route: POST /api-rewards/check-eligibility - Check eligibility for a task
    if (req.method === 'POST' && pathParts.includes('check-eligibility')) {
      if (!hasScope(scopes, 'rewards:read')) {
        return errorResponse('FORBIDDEN', 'Requires rewards:read scope', 403);
      }

      const body = await req.json();
      const { task_id } = body;

      if (!task_id) {
        return errorResponse('VALIDATION_ERROR', 'task_id is required', 400);
      }

      // Get task
      const { data: task, error: taskError } = await supabase
        .from('reward_tasks')
        .select('*')
        .eq('id', task_id)
        .single();

      if (taskError || !task) {
        return errorResponse('NOT_FOUND', 'Task not found', 404);
      }

      // Check if already claimed
      const { data: existingReward } = await supabase
        .from('user_rewards')
        .select('status')
        .eq('user_id', userId)
        .eq('task_id', task_id)
        .single();

      if (existingReward?.status === 'claimed' || existingReward?.status === 'paid') {
        return successResponse({ eligible: false, reason: 'Already claimed' });
      }

      // Check task-specific eligibility
      let eligible = true;
      let reason = 'Eligible';

      switch (task_id) {
        case 'register':
          // Always eligible after registration
          eligible = true;
          break;

        case 'complete_profile':
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('id', userId)
            .single();
          eligible = !!(profile?.display_name && profile?.avatar_url);
          reason = eligible ? 'Eligible' : 'Complete your profile first';
          break;

        case 'first_message':
          const { count: messageCount } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('sender_id', userId);
          eligible = (messageCount || 0) > 0;
          reason = eligible ? 'Eligible' : 'Send your first message';
          break;

        case 'invite_friends':
          const { data: referral } = await supabase
            .from('referral_codes')
            .select('uses_count')
            .eq('user_id', userId)
            .single();
          eligible = (referral?.uses_count || 0) >= 3;
          reason = eligible ? 'Eligible' : `Invite ${3 - (referral?.uses_count || 0)} more friends`;
          break;

        default:
          eligible = existingReward?.status === 'completed';
          reason = eligible ? 'Eligible' : 'Complete the task first';
      }

      return successResponse({ eligible, reason });
    }

    // Route: POST /api-rewards/claim - Claim a reward
    if (req.method === 'POST' && pathParts.includes('claim')) {
      if (!hasScope(scopes, 'rewards:write')) {
        return errorResponse('FORBIDDEN', 'Requires rewards:write scope', 403);
      }

      const body = await req.json();
      const { task_id } = body;

      if (!task_id) {
        return errorResponse('VALIDATION_ERROR', 'task_id is required', 400);
      }

      // Get task
      const { data: task, error: taskError } = await supabase
        .from('reward_tasks')
        .select('*')
        .eq('id', task_id)
        .single();

      if (taskError || !task) {
        return errorResponse('NOT_FOUND', 'Task not found', 404);
      }

      // Check existing reward
      const { data: existingReward } = await supabase
        .from('user_rewards')
        .select('*')
        .eq('user_id', userId)
        .eq('task_id', task_id)
        .single();

      if (existingReward?.status === 'claimed' || existingReward?.status === 'paid') {
        return errorResponse('CONFLICT', 'Reward already claimed', 409);
      }

      if (existingReward?.status !== 'completed') {
        return errorResponse('FORBIDDEN', 'Task not completed yet', 403);
      }

      // Update to claimed
      const { data, error } = await supabase
        .from('user_rewards')
        .update({
          status: 'claimed',
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('task_id', task_id)
        .select()
        .single();

      if (error) {
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      return successResponse(data);
    }

    // Route: GET /api-rewards/referral-code - Get user's referral code
    if (req.method === 'GET' && pathParts.includes('referral-code')) {
      if (!hasScope(scopes, 'rewards:read')) {
        return errorResponse('FORBIDDEN', 'Requires rewards:read scope', 403);
      }

      let { data: referralCode, error } = await supabase
        .from('referral_codes')
        .select('*')
        .eq('user_id', userId)
        .single();

      // Create if doesn't exist
      if (!referralCode) {
        const code = `FC${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const { data: newCode, error: createError } = await supabase
          .from('referral_codes')
          .insert({
            user_id: userId,
            code,
            is_active: true,
          })
          .select()
          .single();

        if (createError) {
          return errorResponse('DATABASE_ERROR', createError.message, 500);
        }

        referralCode = newCode;
      }

      return successResponse(referralCode);
    }

    // Route: POST /api-rewards/use-referral - Use a referral code
    if (req.method === 'POST' && pathParts.includes('use-referral')) {
      if (!hasScope(scopes, 'rewards:write')) {
        return errorResponse('FORBIDDEN', 'Requires rewards:write scope', 403);
      }

      const body = await req.json();
      const { code } = body;

      if (!code) {
        return errorResponse('VALIDATION_ERROR', 'code is required', 400);
      }

      // Check if user already used a referral
      const { data: profile } = await supabase
        .from('profiles')
        .select('referred_by')
        .eq('id', userId)
        .single();

      if (profile?.referred_by) {
        return errorResponse('CONFLICT', 'Already used a referral code', 409);
      }

      // Find referral code
      const { data: referralCode, error: codeError } = await supabase
        .from('referral_codes')
        .select('*')
        .eq('code', code.toUpperCase())
        .eq('is_active', true)
        .single();

      if (!referralCode) {
        return errorResponse('NOT_FOUND', 'Invalid referral code', 404);
      }

      // Can't use own code
      if (referralCode.user_id === userId) {
        return errorResponse('FORBIDDEN', 'Cannot use your own referral code', 403);
      }

      // Record referral use
      const { error: useError } = await supabase
        .from('referral_uses')
        .insert({
          referral_code_id: referralCode.id,
          referrer_user_id: referralCode.user_id,
          referred_user_id: userId,
        });

      if (useError) {
        return errorResponse('DATABASE_ERROR', useError.message, 500);
      }

      // Update profile
      await supabase
        .from('profiles')
        .update({ referred_by: referralCode.id })
        .eq('id', userId);

      return successResponse({ success: true, message: 'Referral code applied' });
    }

    return errorResponse('NOT_FOUND', 'Endpoint not found', 404);

  } catch (error) {
    console.error('Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', String(error), 500);
  }
});
