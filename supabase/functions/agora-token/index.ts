import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// ByteBuf for packing data
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
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC', 
    cryptoKey, 
    message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength) as ArrayBuffer
  );
  return new Uint8Array(signature);
}

// Access Token builder (compatible with Agora RTC tokens)
class AccessToken {
  private appId: string;
  private appCertificate: string;
  private channelName: string;
  private uid: string;
  private expireTimestamp: number;
  private salt: number;
  private ts: number;
  private privileges: Map<number, number> = new Map();

  constructor(appId: string, appCertificate: string, channelName: string, uid: string) {
    this.appId = appId;
    this.appCertificate = appCertificate;
    this.channelName = channelName;
    this.uid = uid;
    this.ts = Math.floor(Date.now() / 1000);
    this.salt = Math.floor(Math.random() * 0xFFFFFFFF);
    this.expireTimestamp = 0;
  }

  addPrivilege(privilege: number, expireTimestamp: number): void {
    this.privileges.set(privilege, expireTimestamp);
  }

  async build(): Promise<string> {
    const messageBytes = this.packMessage();
    const signKey = await this.generateSignKey();
    const signature = await hmacSha256(signKey, messageBytes);

    const contentBytes = new ByteBuf()
      .putBytes(signature)
      .putUint32(crc32(messageBytes))
      .putBytes(messageBytes)
      .pack();

    // Use btoa with manual conversion for reliable base64 encoding
    let binary = '';
    for (let i = 0; i < contentBytes.length; i++) {
      binary += String.fromCharCode(contentBytes[i]);
    }
    const base64Content = btoa(binary);

    return this.appId + base64Content;
  }

  private packMessage(): Uint8Array {
    return new ByteBuf()
      .putUint32(this.salt)
      .putUint32(this.ts)
      .putTreeMapUint32(this.privileges)
      .pack();
  }

  private async generateSignKey(): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const appCertBytes = encoder.encode(this.appCertificate);
    const channelBytes = encoder.encode(this.channelName);
    const uidBytes = encoder.encode(this.uid);
    const tsBytes = encoder.encode(String(this.ts));
    const saltBytes = encoder.encode(String(this.salt));

    let signKey = await hmacSha256(appCertBytes, channelBytes);
    signKey = await hmacSha256(signKey, uidBytes);
    signKey = await hmacSha256(signKey, tsBytes);
    signKey = await hmacSha256(signKey, saltBytes);

    return signKey;
  }
}

// Privilege types
const Privileges = {
  kJoinChannel: 1,
  kPublishAudioStream: 2,
  kPublishVideoStream: 3,
  kPublishDataStream: 4,
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const appId = Deno.env.get('AGORA_APP_ID')?.trim();
    const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE')?.trim();

    // Validate App ID
    if (!appId) {
      console.error('AGORA_APP_ID is not configured');
      return new Response(
        JSON.stringify({ error: 'AGORA_APP_ID chưa được cấu hình. Vui lòng thêm trong Supabase secrets.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!/^[a-f0-9]{32}$/i.test(appId)) {
      console.error('AGORA_APP_ID format invalid:', appId.substring(0, 6) + '...');
      return new Response(
        JSON.stringify({ error: 'AGORA_APP_ID không hợp lệ. Phải là 32 ký tự hex.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { channelName, uid, account, role = 1 } = await req.json();

    if (!channelName) {
      return new Response(
        JSON.stringify({ error: 'channelName là bắt buộc' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Use account (string) if provided, otherwise use uid (number converted to string)
    const userAccount = account || String(uid || 0);
    const userUid = uid || 0;

    console.log(`Generating token for channel: ${channelName}, account: ${userAccount}, hasCertificate: ${!!appCertificate}, appIdPrefix: ${appId.substring(0, 6)}...`);

    // Token expires in 3600 seconds (1 hour)
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    let token = '';
    
    // If app certificate is provided, generate a real token
    if (appCertificate) {
      if (appCertificate.length !== 32) {
        console.error('AGORA_APP_CERTIFICATE length invalid:', appCertificate.length);
        return new Response(
          JSON.stringify({ error: 'AGORA_APP_CERTIFICATE không hợp lệ. Phải là 32 ký tự.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      try {
        const accessToken = new AccessToken(appId, appCertificate, channelName, userAccount);
        
        // Add privileges
        accessToken.addPrivilege(Privileges.kJoinChannel, privilegeExpiredTs);
        if (role === 1) { // Publisher
          accessToken.addPrivilege(Privileges.kPublishAudioStream, privilegeExpiredTs);
          accessToken.addPrivilege(Privileges.kPublishVideoStream, privilegeExpiredTs);
          accessToken.addPrivilege(Privileges.kPublishDataStream, privilegeExpiredTs);
        }

        token = await accessToken.build();
        console.log('Token generated successfully, length:', token.length);
      } catch (tokenError) {
        console.error('Token generation error:', tokenError);
        return new Response(
          JSON.stringify({ error: 'Không thể tạo token. Vui lòng kiểm tra AGORA_APP_CERTIFICATE.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
    } else {
      console.log('No app certificate provided - returning null token (Agora project must have token disabled)');
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
