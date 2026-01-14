/**
 * API Keys API Module
 * Endpoints for managing API keys
 */

import { ApiClient } from '../apiClient';
import { ApiResponse } from '../types';

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  allowed_origins: string[] | null;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  rate_limit: number | null;
  app_id: string | null;
}

export interface CreateApiKeyRequest {
  name: string;
  scopes: string[];
  allowed_origins?: string[];
  rate_limit?: number;
  expires_at?: string;
}

export interface CreateApiKeyResponse {
  api_key: string;
  key_data: ApiKey;
}

export interface ApiKeyListResponse {
  keys: ApiKey[];
  total: number;
}

export function createApiKeysApi(client: ApiClient) {
  return {
    /**
     * List all API keys for current user
     */
    async list(): Promise<ApiResponse<ApiKeyListResponse>> {
      return client.get<ApiKeyListResponse>('/v1/api-keys');
    },

    /**
     * Create a new API key
     */
    async create(data: CreateApiKeyRequest): Promise<ApiResponse<CreateApiKeyResponse>> {
      return client.post<CreateApiKeyResponse>('/v1/api-keys', data);
    },

    /**
     * Delete an API key
     */
    async delete(keyId: string): Promise<ApiResponse<void>> {
      return client.delete<void>(`/v1/api-keys/${keyId}`);
    },

    /**
     * Rotate an API key (generates new key, same metadata)
     */
    async rotate(keyId: string): Promise<ApiResponse<CreateApiKeyResponse>> {
      return client.post<CreateApiKeyResponse>(`/v1/api-keys/${keyId}/rotate`);
    },

    /**
     * Update API key metadata
     */
    async update(keyId: string, data: Partial<CreateApiKeyRequest>): Promise<ApiResponse<ApiKey>> {
      return client.patch<ApiKey>(`/v1/api-keys/${keyId}`, data);
    },

    /**
     * Toggle API key active status
     */
    async toggleActive(keyId: string, isActive: boolean): Promise<ApiResponse<ApiKey>> {
      return client.patch<ApiKey>(`/v1/api-keys/${keyId}`, { is_active: isActive });
    },
  };
}
