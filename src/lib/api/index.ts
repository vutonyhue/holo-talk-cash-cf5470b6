/**
 * FunChat API Module
 * 
 * Centralized API client for all backend communication through Cloudflare Worker.
 * Supabase is only used for Auth - all data operations go through the API.
 */

import { ApiClient } from './apiClient';
import { supabase } from '@/integrations/supabase/client';

// API modules
import { createAuthApi } from './modules/auth';
import { createConversationsApi } from './modules/conversations';
import { createMessagesApi } from './modules/messages';
import { createUsersApi } from './modules/users';
import { createReactionsApi } from './modules/reactions';
import { createReadReceiptsApi } from './modules/readReceipts';
import { createMediaApi } from './modules/media';
import { createRewardsApi } from './modules/rewards';
import { createApiKeysApi } from './modules/apiKeys';
import { createCallsApi } from './modules/calls';
import { createAIApi } from './modules/ai';
import { API_BASE_URL } from '@/config/workerUrls';

// Debug mode in development
const DEBUG = import.meta.env.DEV;

// Create the API client instance
const apiClient = new ApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  },
  onUnauthorized: () => {
    console.warn('[API] Session expired, signing out...');
    supabase.auth.signOut();
  },
  onError: (error) => {
    console.error('[API] Error:', error.code, error.message);
  },
  debug: DEBUG,
});

// Export API modules
export const api = {
  auth: createAuthApi(apiClient),
  conversations: createConversationsApi(apiClient),
  messages: createMessagesApi(apiClient),
  users: createUsersApi(apiClient),
  reactions: createReactionsApi(apiClient),
  readReceipts: createReadReceiptsApi(apiClient),
  media: createMediaApi(apiClient),
  rewards: createRewardsApi(apiClient),
  apiKeys: createApiKeysApi(apiClient),
  calls: createCallsApi(apiClient),
  ai: createAIApi(apiClient),
};

// Export types
export * from './types';
export type { ApiKey, CreateApiKeyRequest, CreateApiKeyResponse, ApiKeyListResponse } from './modules/apiKeys';

// Export client for advanced usage
export { apiClient };
