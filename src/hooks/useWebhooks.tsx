import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  is_active: boolean | null;
  failure_count: number | null;
  max_retries?: number | null;
  last_triggered_at: string | null;
  last_success_at: string | null;
  last_failure_at?: string | null;
  last_error?: string | null;
  created_at: string | null;
  updated_at?: string | null;
  secret?: string;
  api_key_id?: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  payload?: Record<string, unknown>;
  response_status: number | null;
  response_body?: string | null;
  delivered_at: string | null;
  error_message: string | null;
  created_at: string | null;
  attempt_count?: number | null;
}

export interface TestResult {
  sent: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
  duration_ms?: number;
  error?: string;
}

export const WEBHOOK_EVENTS = [
  { id: 'message.created', label: 'Message Created', description: 'When a new message is sent' },
  { id: 'message.deleted', label: 'Message Deleted', description: 'When a message is deleted' },
  { id: 'call.started', label: 'Call Started', description: 'When a call begins' },
  { id: 'call.ended', label: 'Call Ended', description: 'When a call ends' },
  { id: 'crypto.transfer', label: 'Crypto Transfer', description: 'When crypto is transferred' },
  { id: 'user.updated', label: 'User Updated', description: 'When user profile changes' },
];

export const SAMPLE_PAYLOADS: Record<string, Record<string, unknown>> = {
  'message.created': {
    id: 'msg_test_123',
    conversation_id: 'conv_test_456',
    sender_id: 'user_test_789',
    content: 'Hello, this is a test message!',
    message_type: 'text',
    created_at: new Date().toISOString(),
  },
  'message.deleted': {
    id: 'msg_test_123',
    conversation_id: 'conv_test_456',
    deleted_by: 'user_test_789',
    deleted_at: new Date().toISOString(),
  },
  'call.started': {
    id: 'call_test_123',
    conversation_id: 'conv_test_456',
    initiator_id: 'user_test_789',
    call_type: 'video',
    started_at: new Date().toISOString(),
  },
  'call.ended': {
    id: 'call_test_123',
    conversation_id: 'conv_test_456',
    duration_seconds: 120,
    ended_at: new Date().toISOString(),
  },
  'crypto.transfer': {
    id: 'tx_test_123',
    from_user_id: 'user_test_123',
    to_user_id: 'user_test_456',
    amount: 100,
    currency: 'CAMLY',
    status: 'completed',
    created_at: new Date().toISOString(),
  },
  'user.updated': {
    id: 'user_test_123',
    display_name: 'Updated Name',
    avatar_url: 'https://example.com/avatar.jpg',
    updated_at: new Date().toISOString(),
  },
  'test': {
    message: 'This is a test webhook from FunChat',
    timestamp: new Date().toISOString(),
  },
};

export function useWebhooks(apiKeyId?: string, userId?: string, scopes?: string[]) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);

  const getHeaders = useCallback(() => ({
    'x-funchat-api-key-id': apiKeyId || '',
    'x-funchat-user-id': userId || '',
    'x-funchat-scopes': scopes?.join(',') || '',
  }), [apiKeyId, userId, scopes]);

  const fetchWebhooks = useCallback(async () => {
    if (!apiKeyId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('api-webhooks', {
        method: 'GET',
        headers: getHeaders(),
      });

      if (error) throw error;
      if (data?.success) {
        setWebhooks(data.data || []);
      }
    } catch (err: any) {
      console.error('Error fetching webhooks:', err);
      toast.error('Lỗi tải webhooks');
    } finally {
      setLoading(false);
    }
  }, [apiKeyId, getHeaders]);

  const createWebhook = useCallback(async (url: string, events: string[]): Promise<Webhook | null> => {
    if (!apiKeyId) return null;

    try {
      const { data, error } = await supabase.functions.invoke('api-webhooks', {
        method: 'POST',
        headers: getHeaders(),
        body: { url, events },
      });

      if (error) throw error;
      if (data?.success) {
        toast.success('Webhook đã được tạo!');
        await fetchWebhooks();
        return data.data;
      }
      throw new Error(data?.error?.message || 'Failed to create webhook');
    } catch (err: any) {
      console.error('Error creating webhook:', err);
      toast.error(err.message || 'Lỗi tạo webhook');
      return null;
    }
  }, [apiKeyId, getHeaders, fetchWebhooks]);

  const updateWebhook = useCallback(async (
    id: string, 
    updates: { url?: string; events?: string[]; is_active?: boolean }
  ): Promise<boolean> => {
    if (!apiKeyId) return false;

    try {
      const { data, error } = await supabase.functions.invoke(`api-webhooks/${id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: updates,
      });

      if (error) throw error;
      if (data?.success) {
        toast.success('Webhook đã được cập nhật!');
        await fetchWebhooks();
        return true;
      }
      throw new Error(data?.error?.message || 'Failed to update webhook');
    } catch (err: any) {
      console.error('Error updating webhook:', err);
      toast.error(err.message || 'Lỗi cập nhật webhook');
      return false;
    }
  }, [apiKeyId, getHeaders, fetchWebhooks]);

  const deleteWebhook = useCallback(async (id: string): Promise<boolean> => {
    if (!apiKeyId) return false;

    try {
      const { data, error } = await supabase.functions.invoke(`api-webhooks/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });

      if (error) throw error;
      if (data?.success) {
        toast.success('Webhook đã được xóa!');
        await fetchWebhooks();
        return true;
      }
      throw new Error(data?.error?.message || 'Failed to delete webhook');
    } catch (err: any) {
      console.error('Error deleting webhook:', err);
      toast.error(err.message || 'Lỗi xóa webhook');
      return false;
    }
  }, [apiKeyId, getHeaders, fetchWebhooks]);

  const testWebhook = useCallback(async (
    id: string, 
    event?: string, 
    customPayload?: Record<string, unknown>
  ): Promise<TestResult> => {
    if (!apiKeyId) return { sent: false, error: 'No API key' };

    setTestLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(`api-webhooks/${id}/test`, {
        method: 'POST',
        headers: getHeaders(),
        body: { event, payload: customPayload },
      });

      if (error) throw error;
      return data?.data || { sent: false, error: 'Unknown error' };
    } catch (err: any) {
      console.error('Error testing webhook:', err);
      return { sent: false, error: err.message };
    } finally {
      setTestLoading(false);
    }
  }, [apiKeyId, getHeaders]);

  const fetchDeliveries = useCallback(async (
    webhookId: string,
    options?: { limit?: number; offset?: number; status?: 'success' | 'failed' | 'all' }
  ): Promise<WebhookDelivery[]> => {
    if (!apiKeyId) return [];

    try {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', options.limit.toString());
      if (options?.offset) params.set('offset', options.offset.toString());
      if (options?.status && options.status !== 'all') params.set('status', options.status);

      const { data, error } = await supabase.functions.invoke(
        `api-webhooks/${webhookId}/deliveries?${params.toString()}`,
        {
          method: 'GET',
          headers: getHeaders(),
        }
      );

      if (error) throw error;
      const deliveryData = data?.data || [];
      setDeliveries(deliveryData);
      return deliveryData;
    } catch (err: any) {
      console.error('Error fetching deliveries:', err);
      toast.error('Lỗi tải delivery logs');
      return [];
    }
  }, [apiKeyId, getHeaders]);

  const rotateSecret = useCallback(async (id: string): Promise<string | null> => {
    if (!apiKeyId) return null;

    try {
      const { data, error } = await supabase.functions.invoke(`api-webhooks/${id}/rotate-secret`, {
        method: 'POST',
        headers: getHeaders(),
      });

      if (error) throw error;
      if (data?.success) {
        toast.success('Secret đã được rotate!');
        return data.data.secret;
      }
      throw new Error(data?.error?.message || 'Failed to rotate secret');
    } catch (err: any) {
      console.error('Error rotating secret:', err);
      toast.error(err.message || 'Lỗi rotate secret');
      return null;
    }
  }, [apiKeyId, getHeaders]);

  return {
    webhooks,
    deliveries,
    loading,
    testLoading,
    fetchWebhooks,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    testWebhook,
    fetchDeliveries,
    rotateSecret,
  };
}
