import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { RtcTokenBuilder, RtcRole } from "https://esm.sh/agora-token@2.0.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const appId = Deno.env.get('AGORA_APP_ID')?.trim();
    const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE')?.trim();

    // Validate App ID format (should be 32 hex characters)
    if (!appId) {
      console.error('AGORA_APP_ID is not configured');
      return new Response(
        JSON.stringify({ error: 'AGORA_APP_ID is not configured. Please add it in Supabase secrets.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!/^[a-f0-9]{32}$/i.test(appId)) {
      console.error('AGORA_APP_ID format invalid:', appId.substring(0, 6) + '...');
      return new Response(
        JSON.stringify({ error: 'AGORA_APP_ID format is invalid. It should be 32 hexadecimal characters.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { channelName, uid, account, role = 1 } = await req.json();

    if (!channelName) {
      return new Response(
        JSON.stringify({ error: 'channelName is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Use account (string) if provided, otherwise use uid (number)
    const userAccount = account || String(uid || 0);
    const userUid = uid || 0;

    console.log(`Generating token for channel: ${channelName}, account: ${userAccount}, uid: ${userUid}, appId prefix: ${appId.substring(0, 6)}...`);

    // Token expires in 3600 seconds (1 hour)
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    let token = '';
    
    // If app certificate is provided, generate a real token using official library
    if (appCertificate) {
      try {
        // Use account-based token for string user IDs
        if (account) {
          token = RtcTokenBuilder.buildTokenWithUserAccount(
            appId,
            appCertificate,
            channelName,
            userAccount,
            role === 1 ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER,
            privilegeExpiredTs,
            privilegeExpiredTs
          );
        } else {
          // Use UID-based token for numeric user IDs
          token = RtcTokenBuilder.buildTokenWithUid(
            appId,
            appCertificate,
            channelName,
            userUid,
            role === 1 ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER,
            privilegeExpiredTs,
            privilegeExpiredTs
          );
        }
        console.log('Token generated successfully with official library');
      } catch (tokenError) {
        console.error('Token generation error:', tokenError);
        return new Response(
          JSON.stringify({ error: 'Failed to generate token. Check AGORA_APP_CERTIFICATE.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
    } else {
      console.log('No app certificate provided - using null token (Agora project must have token disabled)');
    }

    return new Response(
      JSON.stringify({ 
        token: token || null, 
        appId,
        channelName,
        uid: userUid,
        account: userAccount,
        expireAt: privilegeExpiredTs
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error: unknown) {
    console.error('Error generating Agora token:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
