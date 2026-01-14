/**
 * Agora Token Worker
 * Cloudflare Worker for generating Agora RTC tokens
 * 
 * API Endpoints:
 * - GET /  : Health check
 * - POST / : Generate token
 * 
 * Request body for POST:
 * {
 *   "channel": string,    // Channel name (required)
 *   "uid": number,        // User ID (required)
 *   "role": "publisher" | "subscriber",  // Optional, defaults to publisher
 *   "expireTime": number  // Optional, seconds until expiry, defaults to 3600
 * }
 */

interface Env {
  AGORA_APP_ID: string;
  AGORA_APP_CERTIFICATE: string;
}

interface TokenRequest {
  channel: string;
  uid: number;
  role?: 'publisher' | 'subscriber';
  expireTime?: number;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const RtcRole = {
  PUBLISHER: 1,
  SUBSCRIBER: 2,
} as const;

const Privileges = {
  JOIN_CHANNEL: 1,
  PUBLISH_AUDIO_STREAM: 2,
  PUBLISH_VIDEO_STREAM: 3,
  PUBLISH_DATA_STREAM: 4,
} as const;

// ============================================================================
// Binary Packing Utilities
// ============================================================================

function packString(value: string): Uint8Array {
  const encoder = new TextEncoder();
  const strBytes = encoder.encode(value);
  const result = new Uint8Array(2 + strBytes.length);
  result[0] = strBytes.length & 0xff;
  result[1] = (strBytes.length >> 8) & 0xff;
  for (let i = 0; i < strBytes.length; i++) {
    result[2 + i] = strBytes[i];
  }
  return result;
}

function packUint16(value: number): Uint8Array {
  const result = new Uint8Array(2);
  result[0] = value & 0xff;
  result[1] = (value >> 8) & 0xff;
  return result;
}

function packUint32(value: number): Uint8Array {
  const result = new Uint8Array(4);
  result[0] = value & 0xff;
  result[1] = (value >> 8) & 0xff;
  result[2] = (value >> 16) & 0xff;
  result[3] = (value >> 24) & 0xff;
  return result;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// ============================================================================
// Crypto Utilities
// ============================================================================

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function hmacSign(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const keyBuffer = new Uint8Array(key).buffer;
  const dataBuffer = new Uint8Array(data).buffer;
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
  return new Uint8Array(signature);
}

function base64Encode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

// ============================================================================
// Token Builder
// ============================================================================

async function buildToken(
  appId: string,
  appCertificate: string,
  channelName: string,
  uid: number,
  role: number,
  expireTimestamp: number
): Promise<string> {
  const encoder = new TextEncoder();
  const issueTs = Math.floor(Date.now() / 1000);
  const expire = expireTimestamp - issueTs;
  
  // Generate random salt
  const saltBytes = randomBytes(4);
  const salt = new DataView(saltBytes.buffer).getUint32(0, true);
  
  // Build privileges map based on role
  const privileges = new Map<number, number>();
  privileges.set(Privileges.JOIN_CHANNEL, expireTimestamp);
  
  if (role === RtcRole.PUBLISHER) {
    privileges.set(Privileges.PUBLISH_AUDIO_STREAM, expireTimestamp);
    privileges.set(Privileges.PUBLISH_VIDEO_STREAM, expireTimestamp);
    privileges.set(Privileges.PUBLISH_DATA_STREAM, expireTimestamp);
  }
  
  // Pack privileges
  const privilegeBytes: Uint8Array[] = [packUint16(privileges.size)];
  privileges.forEach((value, key) => {
    privilegeBytes.push(packUint16(key));
    privilegeBytes.push(packUint32(value));
  });
  const packedPrivileges = concatBytes(...privilegeBytes);
  
  // Build services (RTC service type = 1)
  const serviceType = 1;
  const services = [
    packUint16(1), // number of services
    packUint16(serviceType),
    packedPrivileges,
  ];
  const packedServices = concatBytes(...services);
  
  // Build message
  const message = concatBytes(
    packUint32(salt),
    packUint32(issueTs),
    packUint32(expire),
    packedServices
  );
  
  // Sign the message
  const toSign = concatBytes(
    encoder.encode(appId),
    encoder.encode(channelName),
    packUint32(uid),
    message
  );
  
  const signature = await hmacSign(encoder.encode(appCertificate), toSign);
  
  // Build final token content
  const tokenContent = concatBytes(
    packString(appId),
    packUint32(issueTs),
    packUint32(expire),
    packUint32(salt),
    packUint16(1), // service count
    packUint16(serviceType),
    packString(channelName),
    packUint32(uid),
    packUint16(privileges.size),
    ...Array.from(privileges.entries()).flatMap(([k, v]) => [packUint16(k), packUint32(v)]),
    packUint16(signature.length),
    signature
  );
  
  // Version 007 prefix
  const version = '007';
  return version + base64Encode(tokenContent);
}

// ============================================================================
// Request Handler
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    
    // Health check endpoint
    if (request.method === 'GET') {
      return new Response(
        JSON.stringify({ 
          status: 'ok', 
          service: 'agora-token-worker',
          timestamp: new Date().toISOString()
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // Only accept POST for token generation
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    try {
      const body = await request.json() as TokenRequest;
      
      // Validate channel name
      if (!body.channel || typeof body.channel !== 'string') {
        return new Response(
          JSON.stringify({ error: 'Missing or invalid channel name' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Validate uid
      if (body.uid === undefined || typeof body.uid !== 'number') {
        return new Response(
          JSON.stringify({ error: 'Missing or invalid uid' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Determine role (default to publisher)
      const role = body.role === 'subscriber' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;
      
      // Calculate expiration (default 1 hour)
      const expireTime = body.expireTime || 3600;
      const expireTimestamp = Math.floor(Date.now() / 1000) + expireTime;
      
      // Validate environment
      if (!env.AGORA_APP_ID || !env.AGORA_APP_CERTIFICATE) {
        console.error('Missing Agora credentials in environment');
        return new Response(
          JSON.stringify({ error: 'Server configuration error' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Generate token
      const token = await buildToken(
        env.AGORA_APP_ID,
        env.AGORA_APP_CERTIFICATE,
        body.channel,
        body.uid,
        role,
        expireTimestamp
      );
      
      console.log(`Token generated for channel: ${body.channel}, uid: ${body.uid}, role: ${body.role || 'publisher'}`);
      
      return new Response(
        JSON.stringify({
          appId: env.AGORA_APP_ID,
          token,
          channel: body.channel,
          uid: body.uid,
          expireTime,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate token';
      console.error('Token generation error:', error);
      
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  },
};
