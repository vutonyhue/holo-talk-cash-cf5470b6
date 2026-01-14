import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-funchat-api-key, x-funchat-api-key-id, x-funchat-app-id, x-funchat-user-id, x-funchat-scopes',
};

// Available webhook events
const VALID_EVENTS = [
  'message.created',
  'message.deleted',
  'call.started',
  'call.ended',
  'crypto.transfer',
  'user.updated',
];

function errorResponse(code: string, message: string, status: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function successResponse<T>(data: T, status: number = 200, meta?: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({ success: true, data, meta: { timestamp: new Date().toISOString(), ...meta } }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Generate random secret for webhooks
function generateWebhookSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return 'whsec_' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Validate API key from Worker headers
function validateAuth(req: Request): { keyId: string; userId: string; scopes: string[] } | null {
  const keyId = req.headers.get('x-funchat-api-key-id');
  const userId = req.headers.get('x-funchat-user-id');
  const scopesHeader = req.headers.get('x-funchat-scopes');

  if (!keyId || !userId) {
    return null;
  }

  return {
    keyId,
    userId,
    scopes: scopesHeader ? scopesHeader.split(',').map(s => s.trim()) : [],
  };
}

function hasScope(scopes: string[], required: string): boolean {
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

    // Validate authentication
    const auth = validateAuth(req);
    if (!auth) {
      return errorResponse('UNAUTHORIZED', 'Invalid or missing authentication', 401);
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const webhookId = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;

    // GET /api-webhooks - List webhooks
    if (req.method === 'GET' && (!webhookId || webhookId === 'api-webhooks')) {
      if (!hasScope(auth.scopes, 'webhooks:read')) {
        return errorResponse('FORBIDDEN', 'Requires webhooks:read scope', 403);
      }

      const { data, error } = await supabase
        .from('webhooks')
        .select('id, url, events, is_active, failure_count, last_triggered_at, last_success_at, created_at')
        .eq('api_key_id', auth.keyId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching webhooks:', error);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      return successResponse(data || [], 200, { count: data?.length || 0 });
    }

    // GET /api-webhooks/:id - Get single webhook
    if (req.method === 'GET' && webhookId && webhookId !== 'api-webhooks') {
      if (!hasScope(auth.scopes, 'webhooks:read')) {
        return errorResponse('FORBIDDEN', 'Requires webhooks:read scope', 403);
      }

      const { data, error } = await supabase
        .from('webhooks')
        .select('id, url, events, is_active, failure_count, max_retries, last_triggered_at, last_success_at, last_failure_at, last_error, created_at, updated_at')
        .eq('id', webhookId)
        .eq('api_key_id', auth.keyId)
        .single();

      if (error || !data) {
        return errorResponse('NOT_FOUND', 'Webhook not found', 404);
      }

      return successResponse(data);
    }

    // POST /api-webhooks - Create webhook
    if (req.method === 'POST' && (!webhookId || webhookId === 'api-webhooks')) {
      if (!hasScope(auth.scopes, 'webhooks:write')) {
        return errorResponse('FORBIDDEN', 'Requires webhooks:write scope', 403);
      }

      const body = await req.json();
      const { url: webhookUrl, events } = body;

      if (!webhookUrl) {
        return errorResponse('VALIDATION_ERROR', 'URL is required', 400);
      }

      // Validate URL
      try {
        new URL(webhookUrl);
      } catch {
        return errorResponse('VALIDATION_ERROR', 'Invalid URL format', 400);
      }

      // Must be HTTPS
      if (!webhookUrl.startsWith('https://')) {
        return errorResponse('VALIDATION_ERROR', 'Webhook URL must use HTTPS', 400);
      }

      // Validate events
      const validatedEvents = (events && Array.isArray(events))
        ? events.filter((e: string) => VALID_EVENTS.includes(e))
        : ['message.created'];

      if (validatedEvents.length === 0) {
        return errorResponse('VALIDATION_ERROR', `Invalid events. Valid events: ${VALID_EVENTS.join(', ')}`, 400);
      }

      // Generate secret
      const secret = generateWebhookSecret();

      const { data, error } = await supabase
        .from('webhooks')
        .insert({
          api_key_id: auth.keyId,
          url: webhookUrl,
          secret,
          events: validatedEvents,
        })
        .select('id, url, events, is_active, created_at')
        .single();

      if (error) {
        console.error('Error creating webhook:', error);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      // Return secret only on creation (one-time)
      return successResponse(
        { ...data, secret },
        201,
        { warning: 'Save the secret now. It will not be shown again.' }
      );
    }

    // PATCH /api-webhooks/:id - Update webhook
    if (req.method === 'PATCH' && webhookId && webhookId !== 'api-webhooks') {
      if (!hasScope(auth.scopes, 'webhooks:write')) {
        return errorResponse('FORBIDDEN', 'Requires webhooks:write scope', 403);
      }

      const body = await req.json();
      const updates: Record<string, unknown> = {};

      if (body.url !== undefined) {
        try {
          new URL(body.url);
          if (!body.url.startsWith('https://')) {
            return errorResponse('VALIDATION_ERROR', 'Webhook URL must use HTTPS', 400);
          }
          updates.url = body.url;
        } catch {
          return errorResponse('VALIDATION_ERROR', 'Invalid URL format', 400);
        }
      }

      if (body.events !== undefined) {
        const validatedEvents = Array.isArray(body.events)
          ? body.events.filter((e: string) => VALID_EVENTS.includes(e))
          : [];
        if (validatedEvents.length === 0) {
          return errorResponse('VALIDATION_ERROR', `Invalid events. Valid events: ${VALID_EVENTS.join(', ')}`, 400);
        }
        updates.events = validatedEvents;
      }

      if (body.is_active !== undefined) {
        updates.is_active = Boolean(body.is_active);
        // Reset failure count when re-enabling
        if (body.is_active) {
          updates.failure_count = 0;
          updates.last_error = null;
        }
      }

      if (Object.keys(updates).length === 0) {
        return errorResponse('VALIDATION_ERROR', 'No valid fields to update', 400);
      }

      const { data, error } = await supabase
        .from('webhooks')
        .update(updates)
        .eq('id', webhookId)
        .eq('api_key_id', auth.keyId)
        .select('id, url, events, is_active, failure_count, updated_at')
        .single();

      if (error) {
        console.error('Error updating webhook:', error);
        return errorResponse('NOT_FOUND', 'Webhook not found or update failed', 404);
      }

      return successResponse(data);
    }

    // DELETE /api-webhooks/:id - Delete webhook
    if (req.method === 'DELETE' && webhookId && webhookId !== 'api-webhooks') {
      if (!hasScope(auth.scopes, 'webhooks:write')) {
        return errorResponse('FORBIDDEN', 'Requires webhooks:write scope', 403);
      }

      const { error } = await supabase
        .from('webhooks')
        .delete()
        .eq('id', webhookId)
        .eq('api_key_id', auth.keyId);

      if (error) {
        console.error('Error deleting webhook:', error);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      return successResponse({ deleted: true });
    }

    // POST /api-webhooks/:id/test - Test webhook with custom payload
    if (req.method === 'POST' && pathParts.includes('test')) {
      const testWebhookId = pathParts[pathParts.indexOf('api-webhooks') + 1];
      
      if (!hasScope(auth.scopes, 'webhooks:write')) {
        return errorResponse('FORBIDDEN', 'Requires webhooks:write scope', 403);
      }

      // Get webhook
      const { data: webhook, error } = await supabase
        .from('webhooks')
        .select('*')
        .eq('id', testWebhookId)
        .eq('api_key_id', auth.keyId)
        .single();

      if (error || !webhook) {
        return errorResponse('NOT_FOUND', 'Webhook not found', 404);
      }

      // Parse request body for custom event and payload
      let customEvent = 'test';
      let customData: Record<string, unknown> = { message: 'This is a test webhook from FunChat' };
      
      try {
        const body = await req.json();
        if (body.event) customEvent = body.event;
        if (body.payload) customData = body.payload;
      } catch {
        // Use defaults if no body
      }

      // Build test payload
      const testPayload = {
        event: customEvent,
        data: customData,
        timestamp: new Date().toISOString(),
        api_key_id: auth.keyId,
        delivery_id: `test_${crypto.randomUUID()}`,
      };

      const payloadString = JSON.stringify(testPayload);
      const timestamp = Date.now().toString();
      
      // Create signature
      const encoder = new TextEncoder();
      const keyData = encoder.encode(webhook.secret);
      const signaturePayload = `${timestamp}.${payloadString}`;
      const messageData = encoder.encode(signaturePayload);
      const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
      const signatureHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      const startTime = Date.now();

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-FunChat-Event': customEvent,
            'X-FunChat-Signature': `sha256=${signatureHex}`,
            'X-FunChat-Timestamp': timestamp,
            'X-FunChat-Delivery-ID': testPayload.delivery_id,
            'User-Agent': 'FunChat-Webhook/1.0',
          },
          body: payloadString,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const duration_ms = Date.now() - startTime;
        
        // Get response body
        let responseBody = '';
        try {
          responseBody = await response.text();
        } catch {
          // Ignore body read errors
        }

        // Get response headers
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        return successResponse({
          sent: true,
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: responseBody,
          duration_ms,
        });
      } catch (err: any) {
        const duration_ms = Date.now() - startTime;
        return successResponse({
          sent: false,
          error: err.name === 'AbortError' ? 'Request timeout (30s)' : err.message,
          duration_ms,
        });
      }
    }

    // POST /api-webhooks/:id/rotate-secret - Rotate webhook secret
    if (req.method === 'POST' && pathParts.includes('rotate-secret')) {
      const rotateWebhookId = pathParts[pathParts.indexOf('api-webhooks') + 1];
      
      if (!hasScope(auth.scopes, 'webhooks:write')) {
        return errorResponse('FORBIDDEN', 'Requires webhooks:write scope', 403);
      }

      const newSecret = generateWebhookSecret();

      const { data, error } = await supabase
        .from('webhooks')
        .update({ secret: newSecret })
        .eq('id', rotateWebhookId)
        .eq('api_key_id', auth.keyId)
        .select('id')
        .single();

      if (error || !data) {
        return errorResponse('NOT_FOUND', 'Webhook not found', 404);
      }

      return successResponse({ 
        id: data.id, 
        secret: newSecret 
      }, 200, { 
        warning: 'Save the new secret now. It will not be shown again.' 
      });
    }

    // GET /api-webhooks/:id/deliveries - Get delivery logs
    if (req.method === 'GET' && pathParts.includes('deliveries')) {
      const deliveryWebhookId = pathParts[pathParts.indexOf('api-webhooks') + 1];
      
      if (!hasScope(auth.scopes, 'webhooks:read')) {
        return errorResponse('FORBIDDEN', 'Requires webhooks:read scope', 403);
      }

      // Verify webhook ownership
      const { data: webhook } = await supabase
        .from('webhooks')
        .select('id')
        .eq('id', deliveryWebhookId)
        .eq('api_key_id', auth.keyId)
        .single();

      if (!webhook) {
        return errorResponse('NOT_FOUND', 'Webhook not found', 404);
      }

      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      const { data, error } = await supabase
        .from('webhook_deliveries')
        .select('id, event, response_status, delivered_at, error_message, created_at')
        .eq('webhook_id', deliveryWebhookId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Error fetching deliveries:', error);
        return errorResponse('DATABASE_ERROR', error.message, 500);
      }

      return successResponse(data || [], 200, { count: data?.length || 0, limit, offset });
    }

    return errorResponse('NOT_FOUND', 'Endpoint not found', 404);

  } catch (error) {
    console.error('Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', String(error), 500);
  }
});
