import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ClaimRequest {
  task_id: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Get user from token
    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token)
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = claimsData.claims.sub

    // Parse request body
    const { task_id }: ClaimRequest = await req.json()

    if (!task_id) {
      return new Response(
        JSON.stringify({ error: 'task_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[claim-reward] User ${userId} claiming task ${task_id}`)

    // Check if task exists and is active
    const { data: task, error: taskError } = await supabase
      .from('reward_tasks')
      .select('*')
      .eq('id', task_id)
      .eq('is_active', true)
      .single()

    if (taskError || !task) {
      console.error('[claim-reward] Task not found:', taskError)
      return new Response(
        JSON.stringify({ error: 'Task not found or inactive' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check current user reward status
    const { data: existingReward } = await supabase
      .from('user_rewards')
      .select('*')
      .eq('user_id', userId)
      .eq('task_id', task_id)
      .single()

    // Already claimed or paid
    if (existingReward?.status === 'claimed' || existingReward?.status === 'paid') {
      return new Response(
        JSON.stringify({ error: 'Reward already claimed', status: existingReward.status }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Must be in 'completed' status to claim
    if (existingReward?.status !== 'completed') {
      return new Response(
        JSON.stringify({ error: 'Task not completed yet', status: existingReward?.status || 'locked' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update to claimed status
    const { data: updatedReward, error: updateError } = await supabase
      .from('user_rewards')
      .update({
        status: 'claimed',
        claimed_at: new Date().toISOString()
      })
      .eq('id', existingReward.id)
      .select()
      .single()

    if (updateError) {
      console.error('[claim-reward] Update error:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to claim reward' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[claim-reward] Successfully claimed ${task.reward_amount} CAMLY for task ${task_id}`)

    return new Response(
      JSON.stringify({
        success: true,
        reward_amount: task.reward_amount,
        task_name: task.name_vi,
        claimed_at: updatedReward.claimed_at
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[claim-reward] Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
