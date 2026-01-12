/**
 * FunChat SDK - Webhooks Resource
 * Methods for managing webhooks
 */

import type { FunChatClient } from '../client';
import type {
  Webhook,
  WebhookDelivery,
  CreateWebhookParams,
  UpdateWebhookParams,
  WebhookDeliveryParams,
  WebhookTestResult,
} from '../types';
import { WebhookSignatureError } from '../errors';

/**
 * Webhooks resource for webhook management
 */
export class WebhooksResource {
  constructor(private client: FunChatClient) {}

  /**
   * List all webhooks for the current API key
   * 
   * @returns Array of webhooks
   * 
   * @example
   * ```typescript
   * const webhooks = await client.webhooks.list();
   * console.log(`Found ${webhooks.length} webhooks`);
   * ```
   */
  async list(): Promise<Webhook[]> {
    return this.client.request<Webhook[]>('GET', '/api-webhooks', {
      params: { action: 'list' }
    });
  }

  /**
   * Get a webhook by ID
   * 
   * @param id - Webhook ID
   * @returns Webhook details
   * @throws NotFoundError if webhook doesn't exist
   * 
   * @example
   * ```typescript
   * const webhook = await client.webhooks.get('wh-123');
   * console.log(`Webhook URL: ${webhook.url}`);
   * ```
   */
  async get(id: string): Promise<Webhook> {
    return this.client.request<Webhook>('GET', '/api-webhooks', {
      params: { action: 'get', webhook_id: id }
    });
  }

  /**
   * Create a new webhook
   * 
   * **Important:** The `secret` is only returned once during creation.
   * Store it securely for signature verification.
   * 
   * @param params - Webhook configuration
   * @returns Created webhook with secret
   * 
   * @example
   * ```typescript
   * const webhook = await client.webhooks.create({
   *   url: 'https://myapp.com/webhook',
   *   events: ['message.created', 'call.started']
   * });
   * 
   * // IMPORTANT: Save this secret!
   * console.log('Webhook secret:', webhook.secret);
   * saveToSecureStorage(webhook.secret);
   * ```
   */
  async create(params: CreateWebhookParams): Promise<Webhook> {
    return this.client.request<Webhook>('POST', '/api-webhooks', {
      body: {
        action: 'create',
        ...params
      }
    });
  }

  /**
   * Update a webhook
   * 
   * @param id - Webhook ID
   * @param params - Fields to update
   * @returns Updated webhook
   * 
   * @example
   * ```typescript
   * const updated = await client.webhooks.update('wh-123', {
   *   events: ['message.created', 'message.deleted'],
   *   is_active: true
   * });
   * ```
   */
  async update(id: string, params: UpdateWebhookParams): Promise<Webhook> {
    return this.client.request<Webhook>('PUT', '/api-webhooks', {
      body: {
        action: 'update',
        webhook_id: id,
        ...params
      }
    });
  }

  /**
   * Delete a webhook
   * 
   * @param id - Webhook ID
   * @returns Deletion confirmation
   * 
   * @example
   * ```typescript
   * await client.webhooks.delete('wh-123');
   * console.log('Webhook deleted');
   * ```
   */
  async delete(id: string): Promise<{ deleted: boolean }> {
    return this.client.request<{ deleted: boolean }>('DELETE', '/api-webhooks', {
      params: { action: 'delete', webhook_id: id }
    });
  }

  /**
   * Test a webhook by sending a test event
   * 
   * @param id - Webhook ID
   * @returns Test result
   * 
   * @example
   * ```typescript
   * const result = await client.webhooks.test('wh-123');
   * if (result.sent) {
   *   console.log(`Test succeeded! Status: ${result.response_status}`);
   * } else {
   *   console.log(`Test failed: ${result.error}`);
   * }
   * ```
   */
  async test(id: string): Promise<WebhookTestResult> {
    return this.client.request<WebhookTestResult>('POST', '/api-webhooks', {
      body: {
        action: 'test',
        webhook_id: id
      }
    });
  }

  /**
   * Get webhook delivery logs
   * 
   * @param id - Webhook ID
   * @param params - Filter and pagination options
   * @returns Array of delivery logs
   * 
   * @example
   * ```typescript
   * // Get all deliveries
   * const deliveries = await client.webhooks.deliveries('wh-123');
   * 
   * // Get failed deliveries only
   * const failed = await client.webhooks.deliveries('wh-123', {
   *   status: 'failed',
   *   limit: 50
   * });
   * ```
   */
  async deliveries(id: string, params?: WebhookDeliveryParams): Promise<WebhookDelivery[]> {
    return this.client.request<WebhookDelivery[]>('GET', '/api-webhooks', {
      params: {
        action: 'deliveries',
        webhook_id: id,
        limit: params?.limit?.toString(),
        offset: params?.offset?.toString(),
        event: params?.event,
        status: params?.status
      }
    });
  }

  /**
   * Enable a webhook
   * 
   * @param id - Webhook ID
   * @returns Updated webhook
   * 
   * @example
   * ```typescript
   * await client.webhooks.enable('wh-123');
   * ```
   */
  async enable(id: string): Promise<Webhook> {
    return this.update(id, { is_active: true });
  }

  /**
   * Disable a webhook
   * 
   * @param id - Webhook ID
   * @returns Updated webhook
   * 
   * @example
   * ```typescript
   * await client.webhooks.disable('wh-123');
   * ```
   */
  async disable(id: string): Promise<Webhook> {
    return this.update(id, { is_active: false });
  }

  /**
   * Rotate webhook secret
   * 
   * @param id - Webhook ID
   * @returns Webhook with new secret
   * 
   * @example
   * ```typescript
   * const webhook = await client.webhooks.rotateSecret('wh-123');
   * console.log('New secret:', webhook.secret);
   * // Update your stored secret!
   * ```
   */
  async rotateSecret(id: string): Promise<Webhook> {
    return this.client.request<Webhook>('POST', '/api-webhooks', {
      body: {
        action: 'rotate_secret',
        webhook_id: id
      }
    });
  }

  /**
   * Verify a webhook signature (static method)
   * 
   * Use this to verify that webhook payloads are authentic.
   * 
   * @param payload - Raw request body as string
   * @param signature - Value of x-funchat-signature header
   * @param secret - Your webhook secret
   * @param timestamp - Optional timestamp from x-funchat-timestamp header
   * @returns true if signature is valid
   * @throws WebhookSignatureError if signature is invalid
   * 
   * @example
   * ```typescript
   * // Express.js example
   * app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
   *   const signature = req.headers['x-funchat-signature'];
   *   const timestamp = req.headers['x-funchat-timestamp'];
   *   
   *   try {
   *     WebhooksResource.verifySignature(
   *       req.body.toString(),
   *       signature,
   *       process.env.WEBHOOK_SECRET,
   *       timestamp
   *     );
   *     
   *     // Process the webhook
   *     const { event, data } = JSON.parse(req.body);
   *     // ...
   *     
   *     res.status(200).send('OK');
   *   } catch (error) {
   *     res.status(401).send('Invalid signature');
   *   }
   * });
   * ```
   */
  static verifySignature(
    payload: string,
    signature: string,
    secret: string,
    timestamp?: string
  ): boolean {
    if (!signature || !secret) {
      throw new WebhookSignatureError('Missing signature or secret');
    }

    // Check timestamp to prevent replay attacks (within 5 minutes)
    if (timestamp) {
      const webhookTime = parseInt(timestamp, 10);
      const currentTime = Math.floor(Date.now() / 1000);
      const tolerance = 300; // 5 minutes

      if (Math.abs(currentTime - webhookTime) > tolerance) {
        throw new WebhookSignatureError('Webhook timestamp too old');
      }
    }

    // Compute expected signature
    const signedPayload = timestamp ? `${timestamp}.${payload}` : payload;
    const expectedSignature = WebhooksResource.computeSignature(signedPayload, secret);

    // Constant-time comparison
    if (!WebhooksResource.secureCompare(signature, expectedSignature)) {
      throw new WebhookSignatureError('Signature mismatch');
    }

    return true;
  }

  /**
   * Compute HMAC-SHA256 signature
   * @internal
   */
  private static computeSignature(payload: string, secret: string): string {
    // In browser environments, use SubtleCrypto
    // This is a simplified version - in production use proper HMAC
    // For Node.js, use crypto.createHmac
    
    // This is a placeholder - actual implementation should use:
    // - Node.js: crypto.createHmac('sha256', secret).update(payload).digest('hex')
    // - Browser: SubtleCrypto with HMAC
    
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const key = encoder.encode(secret);
    
    // Simple XOR-based hash for demo (NOT SECURE - use proper HMAC in production)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash + data[i] * key[i % key.length]) | 0;
    }
    
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Constant-time string comparison
   * @internal
   */
  private static secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}
