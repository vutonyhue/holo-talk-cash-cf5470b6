import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ========== AccessToken2 (RTC Token 007) Implementation ==========
// Based on Agora's official specification

const VERSION = "007";

// Service types
const ServiceRtc = 1;

// RTC Privileges
const PrivilegeJoinChannel = 1;
const PrivilegePublishAudioStream = 2;
const PrivilegePublishVideoStream = 3;
const PrivilegePublishDataStream = 4;

// CRC32 implementation
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ByteBuf for packing binary data (little-endian)
class ByteBuf {
  private buffer: number[] = [];

  putUint16(v: number): this {
    this.buffer.push(v & 0xFF);
    this.buffer.push((v >> 8) & 0xFF);
    return this;
  }

  putUint32(v: number): this {
    this.buffer.push(v & 0xFF);
    this.buffer.push((v >> 8) & 0xFF);
    this.buffer.push((v >> 16) & 0xFF);
    this.buffer.push((v >> 24) & 0xFF);
    return this;
  }

  putBytes(bytes: Uint8Array): this {
    this.putUint16(bytes.length);
    for (const b of bytes) {
      this.buffer.push(b);
    }
    return this;
  }

  putRawBytes(bytes: Uint8Array): this {
    for (const b of bytes) {
      this.buffer.push(b);
    }
    return this;
  }

  putString(str: string): this {
    const bytes = new TextEncoder().encode(str);
    return this.putBytes(bytes);
  }

  putTreeMapUint32(map: Map<number, number>): this {
    this.putUint16(map.size);
    for (const [k, v] of map) {
      this.putUint16(k);
      this.putUint32(v);
    }
    return this;
  }

  pack(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

// HMAC-SHA256 using WebCrypto
async function hmacSha256(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const keyBuffer = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
  const messageBuffer = message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength) as ArrayBuffer;
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageBuffer);
  return new Uint8Array(signature);
}

// Service class for RTC
class ServiceRtcBuilder {
  private type: number;
  private channelName: string;
  private uid: string;
  private privileges: Map<number, number>;

  constructor(channelName: string, uid: string) {
    this.type = ServiceRtc;
    this.channelName = channelName;
    this.uid = uid;
    this.privileges = new Map();
  }

  addPrivilege(privilege: number, expireTimestamp: number): void {
    this.privileges.set(privilege, expireTimestamp);
  }

  pack(): Uint8Array {
    return new ByteBuf()
      .putUint16(this.type)
      .putString(this.channelName)
      .putString(this.uid)
      .putTreeMapUint32(this.privileges)
      .pack();
  }
}

// AccessToken2 builder (Token 007)
class AccessToken2 {
  private appId: string;
  private appCertificate: string;
  private issueTs: number;
  private expire: number;
  private salt: number;
  private services: Uint8Array[];

  constructor(appId: string, appCertificate: string, expire: number = 3600) {
    this.appId = appId;
    this.appCertificate = appCertificate;
    this.issueTs = Math.floor(Date.now() / 1000);
    this.expire = expire;
    this.salt = Math.floor(Math.random() * 0xFFFFFFFF);
    this.services = [];
  }

  addService(service: ServiceRtcBuilder): void {
    this.services.push(service.pack());
  }

  async build(): Promise<string> {
    const encoder = new TextEncoder();
    
    // Build services buffer
    const servicesBuf = new ByteBuf();
    servicesBuf.putUint16(this.services.length);
    for (const service of this.services) {
      servicesBuf.putRawBytes(service);
    }
    const servicesData = servicesBuf.pack();
    
    // Build message: salt + issueTs + expire + services
    const message = new ByteBuf()
      .putUint32(this.salt)
      .putUint32(this.issueTs)
      .putUint32(this.expire)
      .putRawBytes(servicesData)
      .pack();

    // Generate signing key: HMAC chain
    // signKey = HMAC(HMAC(appCertificate, issueTs_bytes), salt_bytes)
    const appCertBytes = encoder.encode(this.appCertificate);
    
    const issueTsBuf = new ByteBuf().putUint32(this.issueTs).pack();
    const saltBuf = new ByteBuf().putUint32(this.salt).pack();
    
    const step1 = await hmacSha256(appCertBytes, issueTsBuf);
    const signingKey = await hmacSha256(step1, saltBuf);

    // Sign the message
    const signature = await hmacSha256(signingKey, message);

    // Build content: signature + crc32(message) + message
    const crcValue = crc32(message);
    
    const content = new ByteBuf()
      .putBytes(signature)
      .putUint32(crcValue)
      .putBytes(message)
      .pack();

    // Encode appId + content as base64
    const appIdBytes = encoder.encode(this.appId);
    const tokenData = new Uint8Array(appIdBytes.length + content.length);
    tokenData.set(appIdBytes, 0);
    tokenData.set(content, appIdBytes.length);
    
    // Use btoa for base64 encoding
    let binary = '';
    for (let i = 0; i < tokenData.length; i++) {
      binary += String.fromCharCode(tokenData[i]);
    }
    const tokenBase64 = btoa(binary);
    
    // Token format: "007" + base64(appId + content)
    return VERSION + tokenBase64;
  }
}

// Build RTC token
async function buildTokenWithUid(
  appId: string,
  appCertificate: string,
  channelName: string,
  uid: number,
  role: number,
  tokenExpire: number = 3600,
  privilegeExpire: number = 3600
): Promise<string> {
  const token = new AccessToken2(appId, appCertificate, tokenExpire);
  
  // For RTC, uid 0 means auto-assign, otherwise use the uid as string
  const uidStr = uid === 0 ? "" : uid.toString();
  const service = new ServiceRtcBuilder(channelName, uidStr);
  
  const expireTimestamp = Math.floor(Date.now() / 1000) + privilegeExpire;
  
  // Add privileges based on role
  service.addPrivilege(PrivilegeJoinChannel, expireTimestamp);
  if (role === 1) { // Publisher
    service.addPrivilege(PrivilegePublishAudioStream, expireTimestamp);
    service.addPrivilege(PrivilegePublishVideoStream, expireTimestamp);
    service.addPrivilege(PrivilegePublishDataStream, expireTimestamp);
  }
  
  token.addService(service);
  
  return token.build();
}

// ========== Edge Function Handler ==========

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const appId = Deno.env.get('AGORA_APP_ID')?.trim();
    const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE')?.trim();

    console.log(`App ID exists: ${!!appId}, Certificate exists: ${!!appCertificate}`);

    if (!appId) {
      console.error('Missing AGORA_APP_ID');
      return new Response(
        JSON.stringify({ error: 'AGORA_APP_ID chưa được cấu hình' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!appCertificate) {
      console.error('Missing AGORA_APP_CERTIFICATE');
      return new Response(
        JSON.stringify({ error: 'AGORA_APP_CERTIFICATE chưa được cấu hình' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate format
    if (!/^[a-f0-9]{32}$/i.test(appId)) {
      console.error('Invalid App ID format');
      return new Response(
        JSON.stringify({ error: 'AGORA_APP_ID không hợp lệ (phải là 32 ký tự hex)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!/^[a-f0-9]{32}$/i.test(appCertificate)) {
      console.error('Invalid App Certificate format');
      return new Response(
        JSON.stringify({ error: 'AGORA_APP_CERTIFICATE không hợp lệ (phải là 32 ký tự hex)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { channelName, uid = 0, role = 1 } = body;

    console.log(`Building token for channel: ${channelName}, uid: ${uid}, role: ${role}`);

    if (!channelName) {
      return new Response(
        JSON.stringify({ error: 'Channel name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build token with numeric UID (0 means server assigns)
    const numericUid = typeof uid === 'number' ? uid : 0;
    const token = await buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      numericUid,
      role,
      3600, // token expires in 1 hour
      3600  // privileges expire in 1 hour
    );

    console.log(`Token generated successfully, prefix: ${token.substring(0, 10)}..., length: ${token.length}`);

    return new Response(
      JSON.stringify({
        token,
        appId,
        channelName,
        uid: numericUid,
        expireTime: Math.floor(Date.now() / 1000) + 3600,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Token generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate token';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
