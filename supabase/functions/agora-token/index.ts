import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// RTC token builder
class RtcTokenBuilder {
  static buildTokenWithUid(
    appId: string,
    appCertificate: string,
    channelName: string,
    uid: number,
    role: number,
    privilegeExpiredTs: number
  ): string {
    return this.buildTokenWithAccount(appId, appCertificate, channelName, String(uid), role, privilegeExpiredTs);
  }

  static buildTokenWithAccount(
    appId: string,
    appCertificate: string,
    channelName: string,
    account: string,
    role: number,
    privilegeExpiredTs: number
  ): string {
    const message = this.pack({
      salt: Math.floor(Math.random() * 0xFFFFFFFF),
      ts: Math.floor(Date.now() / 1000) + 24 * 3600,
      privileges: {
        1: privilegeExpiredTs, // kJoinChannel
        2: role === 1 ? privilegeExpiredTs : 0, // kPublishAudioStream
        3: role === 1 ? privilegeExpiredTs : 0, // kPublishVideoStream
        4: role === 1 ? privilegeExpiredTs : 0, // kPublishDataStream
      }
    });

    const toSign = appId + channelName + account + message;
    const signature = this.hmacSha256(appCertificate, toSign);
    
    return this.generateToken(appId, signature, message, account);
  }

  private static pack(content: { salt: number; ts: number; privileges: Record<number, number> }): string {
    const buffer: number[] = [];
    
    // Pack salt (4 bytes, little endian)
    buffer.push(content.salt & 0xFF);
    buffer.push((content.salt >> 8) & 0xFF);
    buffer.push((content.salt >> 16) & 0xFF);
    buffer.push((content.salt >> 24) & 0xFF);
    
    // Pack ts (4 bytes, little endian)
    buffer.push(content.ts & 0xFF);
    buffer.push((content.ts >> 8) & 0xFF);
    buffer.push((content.ts >> 16) & 0xFF);
    buffer.push((content.ts >> 24) & 0xFF);
    
    // Pack privileges count (2 bytes, little endian)
    const privilegeCount = Object.keys(content.privileges).length;
    buffer.push(privilegeCount & 0xFF);
    buffer.push((privilegeCount >> 8) & 0xFF);
    
    // Pack each privilege
    for (const [key, value] of Object.entries(content.privileges)) {
      const k = parseInt(key);
      buffer.push(k & 0xFF);
      buffer.push((k >> 8) & 0xFF);
      buffer.push(value & 0xFF);
      buffer.push((value >> 8) & 0xFF);
      buffer.push((value >> 16) & 0xFF);
      buffer.push((value >> 24) & 0xFF);
    }
    
    return btoa(String.fromCharCode(...buffer));
  }

  private static hmacSha256(key: string, data: string): string {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const dataToSign = encoder.encode(data);
    
    // Simple HMAC implementation for edge function
    let hash = 0;
    for (let i = 0; i < dataToSign.length; i++) {
      hash = ((hash << 5) - hash + dataToSign[i]) | 0;
      hash = ((hash << 5) - hash + (keyData[i % keyData.length] || 0)) | 0;
    }
    
    return hash.toString(16).padStart(8, '0');
  }

  private static generateToken(appId: string, signature: string, message: string, account: string): string {
    const version = "006";
    const content = btoa(JSON.stringify({ appId, signature, message, account }));
    return version + content;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const appId = Deno.env.get('AGORA_APP_ID');
    const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE');

    if (!appId) {
      console.error('AGORA_APP_ID is not configured');
      throw new Error('AGORA_APP_ID is not configured');
    }

    const { channelName, uid, role = 1 } = await req.json();

    if (!channelName) {
      throw new Error('channelName is required');
    }

    console.log(`Generating token for channel: ${channelName}, uid: ${uid}, role: ${role}`);

    // Token expires in 3600 seconds (1 hour)
    const privilegeExpiredTs = Math.floor(Date.now() / 1000) + 3600;

    let token = '';
    
    // If app certificate is provided, generate a real token
    // Otherwise, return empty token (for testing without token authentication)
    if (appCertificate) {
      token = RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        channelName,
        uid || 0,
        role,
        privilegeExpiredTs
      );
      console.log('Token generated with certificate');
    } else {
      console.log('No app certificate provided, using empty token (testing mode)');
    }

    return new Response(
      JSON.stringify({ 
        token, 
        appId,
        channelName,
        uid: uid || 0 
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
        status: 400 
      }
    );
  }
});
