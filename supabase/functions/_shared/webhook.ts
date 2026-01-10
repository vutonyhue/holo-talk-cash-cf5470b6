// Shared webhook dispatch module for FunChat API
import { createHmacSignature } from './auth.ts';

export interface WebhookPayload {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
  api_key_id: string;
}

/**
 * Dispatch webhooks for an event
 * This function finds all active webhooks subscribed to the event and sends them
 */
export async function dispatchWebhooks(
  supabase: any,
  apiKeyId: string,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    // Get all active webhooks for this API key that subscribe to this event
    const { data: webhooks, error } = await supabase
      .from('webhooks')
      .select('*')
      .eq('api_key_id', apiKeyId)
      .eq('is_active', true)
      .contains('events', [event]);

    if (error || !webhooks || webhooks.length === 0) {
      console.log(`No webhooks found for event ${event} on API key ${apiKeyId}`);
      return;
    }

    const payload: WebhookPayload = {
      event,
      data,
      timestamp: new Date().toISOString(),
      api_key_id: apiKeyId,
    };

    const payloadString = JSON.stringify(payload);

    // Send to all webhooks in parallel
    await Promise.allSettled(
      webhooks.map(async (webhook: any) => {
        await sendWebhook(supabase, webhook, event, payload, payloadString);
      })
    );
  } catch (err) {
    console.error('Error dispatching webhooks:', err);
  }
}

/**
 * Send a single webhook
 */
async function sendWebhook(
  supabase: any,
  webhook: any,
  event: string,
  payload: WebhookPayload,
  payloadString: string
): Promise<void> {
  const signature = await createHmacSignature(payloadString, webhook.secret);
  const timestamp = Date.now().toString();

  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FunChat-Event': event,
        'X-FunChat-Signature': `sha256=${signature}`,
        'X-FunChat-Timestamp': timestamp,
        'X-FunChat-Delivery-ID': crypto.randomUUID(),
        'User-Agent': 'FunChat-Webhook/1.0',
      },
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    responseStatus = response.status;
    responseBody = await response.text().catch(() => null);

    if (response.ok) {
      // Success - reset failure count
      await supabase
        .from('webhooks')
        .update({
          last_triggered_at: new Date().toISOString(),
          last_success_at: new Date().toISOString(),
          failure_count: 0,
          last_error: null,
        })
        .eq('id', webhook.id);

      // Log successful delivery
      await logWebhookDelivery(supabase, webhook.id, event, payload, responseStatus, responseBody, null);
    } else {
      throw new Error(`HTTP ${response.status}: ${responseBody?.substring(0, 200)}`);
    }
  } catch (err: any) {
    errorMessage = err.message || 'Unknown error';
    console.error(`Webhook delivery failed for ${webhook.url}:`, errorMessage);

    // Increment failure count
    const newFailureCount = (webhook.failure_count || 0) + 1;
    const shouldDisable = newFailureCount >= (webhook.max_retries || 3);

    await supabase
      .from('webhooks')
      .update({
      last_triggered_at: new Date().toISOString(),
      last_failure_at: new Date().toISOString(),
      failure_count: newFailureCount,
      last_error: errorMessage ? errorMessage.substring(0, 500) : 'Unknown error',
      is_active: shouldDisable ? false : webhook.is_active,
    })
      .eq('id', webhook.id);

    // Log failed delivery
    await logWebhookDelivery(supabase, webhook.id, event, payload, responseStatus, responseBody, errorMessage);
  }
}

/**
 * Log webhook delivery attempt
 */
async function logWebhookDelivery(
  supabase: any,
  webhookId: string,
  event: string,
  payload: WebhookPayload,
  responseStatus: number | null,
  responseBody: string | null,
  errorMessage: string | null
): Promise<void> {
  try {
    await supabase.from('webhook_deliveries').insert({
      webhook_id: webhookId,
      event,
      payload,
      response_status: responseStatus,
      response_body: responseBody?.substring(0, 1000),
      delivered_at: responseStatus && responseStatus >= 200 && responseStatus < 300 
        ? new Date().toISOString() 
        : null,
      error_message: errorMessage,
    });
  } catch (err) {
    console.error('Failed to log webhook delivery:', err);
  }
}
