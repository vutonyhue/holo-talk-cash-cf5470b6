import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Agora Token Builder implementation
// Reference: https://github.com/AgoraIO/Tools/blob/master/DynamicKey/AgoraDynamicKey/nodejs/src/RtcTokenBuilder2.js

const VERSION = "007";
const VERSION_LENGTH = 3;

// Privileges
const PRIVILEGE_JOIN_CHANNEL = 1;
const PRIVILEGE_PUBLISH_AUDIO_STREAM = 2;
const PRIVILEGE_PUBLISH_VIDEO_STREAM = 3;
const PRIVILEGE_PUBLISH_DATA_STREAM = 4;

function getVersion(): string {
  return VERSION;
}

function packUint16(val: number): Uint8Array {
  const buf = new Uint8Array(2);
  buf[0] = val & 0xff;
  buf[1] = (val >> 8) & 0xff;
  return buf;
}

function packUint32(val: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = val & 0xff;
  buf[1] = (val >> 8) & 0xff;
  buf[2] = (val >> 16) & 0xff;
  buf[3] = (val >> 24) & 0xff;
  return buf;
}

function packString(str: string): Uint8Array {
  const encoder = new TextEncoder();
  const strBytes = encoder.encode(str);
  const buf = new Uint8Array(2 + strBytes.length);
  buf.set(packUint16(strBytes.length), 0);
  buf.set(strBytes, 2);
  return buf;
}

function packMapUint32(map: Map<number, number>): Uint8Array {
  const parts: Uint8Array[] = [];
  parts.push(packUint16(map.size));
  map.forEach((value, key) => {
    parts.push(packUint16(key));
    parts.push(packUint32(value));
  });
  return concatUint8Arrays(parts);
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

async function hmacSha256(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, message.buffer as ArrayBuffer);
  return new Uint8Array(signature);
}

function base64Encode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

class AccessToken {
  appId: string;
  appCertificate: string;
  channelName: string;
  uid: string;
  expireTimestamp: number;
  salt: number;
  ts: number;
  privileges: Map<number, number>;

  constructor(appId: string, appCertificate: string, channelName: string, uid: string) {
    this.appId = appId;
    this.appCertificate = appCertificate;
    this.channelName = channelName;
    this.uid = uid;
    this.expireTimestamp = 0;
    this.salt = Math.floor(Math.random() * 0xffffffff);
    this.ts = Math.floor(Date.now() / 1000);
    this.privileges = new Map();
  }

  addPrivilege(privilege: number, expireTimestamp: number): void {
    this.privileges.set(privilege, expireTimestamp);
  }

  async build(): Promise<string> {
    const encoder = new TextEncoder();
    
    // Build message
    const message = concatUint8Arrays([
      packUint32(this.salt),
      packUint32(this.ts),
      packMapUint32(this.privileges),
    ]);

    // Build signature content
    const toSign = concatUint8Arrays([
      encoder.encode(this.appId),
      encoder.encode(this.channelName),
      encoder.encode(this.uid),
      message,
    ]);

    // Calculate signature
    const signature = await hmacSha256(encoder.encode(this.appCertificate), toSign);

    // Pack content
    const content = concatUint8Arrays([
      packString(base64Encode(signature)),
      packUint32(0), // crc_channel_name placeholder
      packUint32(0), // crc_uid placeholder
      packString(base64Encode(message)),
    ]);

    // Build final token
    return getVersion() + this.appId + base64Encode(content);
  }
}

async function buildTokenWithUid(
  appId: string,
  appCertificate: string,
  channelName: string,
  uid: number,
  role: number,
  privilegeExpiredTs: number
): Promise<string> {
  const token = new AccessToken(appId, appCertificate, channelName, uid.toString());
  
  // Add privileges based on role
  // Role 1 = Publisher, Role 2 = Subscriber
  token.addPrivilege(PRIVILEGE_JOIN_CHANNEL, privilegeExpiredTs);
  
  if (role === 1) {
    token.addPrivilege(PRIVILEGE_PUBLISH_AUDIO_STREAM, privilegeExpiredTs);
    token.addPrivilege(PRIVILEGE_PUBLISH_VIDEO_STREAM, privilegeExpiredTs);
    token.addPrivilege(PRIVILEGE_PUBLISH_DATA_STREAM, privilegeExpiredTs);
  }

  return await token.build();
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const APP_ID = Deno.env.get('AGORA_APP_ID');
    const APP_CERTIFICATE = Deno.env.get('AGORA_APP_CERTIFICATE');

    if (!APP_ID || !APP_CERTIFICATE) {
      console.error('Missing Agora credentials');
      return new Response(
        JSON.stringify({ error: 'Agora credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate JWT with Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://dgeadmmbkvcsgizsnbpi.supabase.co';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');

    const supabase = createClient(supabaseUrl, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { channelName, uid, role = 1 } = await req.json();

    if (!channelName) {
      return new Response(
        JSON.stringify({ error: 'channelName is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (typeof uid !== 'number' || uid < 0) {
      return new Response(
        JSON.stringify({ error: 'uid must be a non-negative number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating Agora token:', { channelName, uid, role, userId: user.id });

    // Token expires in 1 hour
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const token = await buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uid,
      role,
      privilegeExpiredTs
    );

    console.log('Token generated successfully:', {
      channelName,
      uid,
      tokenLength: token.length,
      expiresAt: new Date(privilegeExpiredTs * 1000).toISOString(),
    });

    return new Response(
      JSON.stringify({ 
        token, 
        appId: APP_ID, 
        uid,
        expiresAt: privilegeExpiredTs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error generating Agora token:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
