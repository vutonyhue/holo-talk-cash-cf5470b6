import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CheckRequest {
  task_ids?: string[]
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

    // Parse request body (optional)
    let taskIds: string[] | undefined
    try {
      const body: CheckRequest = await req.json()
      taskIds = body.task_ids
    } catch {
      // Empty body is fine
    }

    console.log(`[check-eligibility] Checking eligibility for user ${userId}`)

    const updatedTasks: string[] = []

    // Check complete_profile
    if (!taskIds || taskIds.includes('complete_profile')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url, display_name')
        .eq('id', userId)
        .single()

      if (profile?.avatar_url && profile?.display_name) {
        const { data: existing } = await supabase
          .from('user_rewards')
          .select('status')
          .eq('user_id', userId)
          .eq('task_id', 'complete_profile')
          .single()

        if (!existing || existing.status === 'pending') {
          const { error } = await supabase
            .from('user_rewards')
            .upsert({
              user_id: userId,
              task_id: 'complete_profile',
              status: 'completed',
              completed_at: new Date().toISOString()
            }, { onConflict: 'user_id,task_id' })

          if (!error) {
            updatedTasks.push('complete_profile')
            console.log('[check-eligibility] complete_profile marked as completed')
          }
        }
      }
    }

    // Check first_message
    if (!taskIds || taskIds.includes('first_message')) {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('sender_id', userId)

      if (count && count > 0) {
        const { data: existing } = await supabase
          .from('user_rewards')
          .select('status')
          .eq('user_id', userId)
          .eq('task_id', 'first_message')
          .single()

        if (!existing || existing.status === 'pending') {
          const { error } = await supabase
            .from('user_rewards')
            .upsert({
              user_id: userId,
              task_id: 'first_message',
              status: 'completed',
              completed_at: new Date().toISOString()
            }, { onConflict: 'user_id,task_id' })

          if (!error) {
            updatedTasks.push('first_message')
            console.log('[check-eligibility] first_message marked as completed')
          }
        }
      }
    }

    // Check invite_friends (progress tracking)
    if (!taskIds || taskIds.includes('invite_friends')) {
      // This will be implemented in Phase 3 with referral codes
      // For now, just check if there's existing progress
      const { data: existing } = await supabase
        .from('user_rewards')
        .select('progress, status')
        .eq('user_id', userId)
        .eq('task_id', 'invite_friends')
        .single()

      if (existing && existing.progress?.invited >= 3 && existing.status !== 'completed' && existing.status !== 'claimed' && existing.status !== 'paid') {
        const { error } = await supabase
          .from('user_rewards')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('task_id', 'invite_friends')

        if (!error) {
          updatedTasks.push('invite_friends')
          console.log('[check-eligibility] invite_friends marked as completed')
        }
      }
    }

    console.log(`[check-eligibility] Updated tasks:`, updatedTasks)

    return new Response(
      JSON.stringify({
        success: true,
        updated_tasks: updatedTasks,
        checked_at: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[check-eligibility] Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
