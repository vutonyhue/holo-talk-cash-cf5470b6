/**
 * Auth API Module
 * Endpoints for user profile and authentication-related operations
 */

import { ApiClient } from '../apiClient';
import { ApiResponse, ProfileResponse } from '../types';

export interface UpdateProfileRequest {
  username?: string;
  display_name?: string;
  avatar_url?: string;
  phone_number?: string;
  wallet_address?: string;
  status?: string;
}

export function createAuthApi(client: ApiClient) {
  return {
    /**
     * Get current user's profile
     */
    async getMe(): Promise<ApiResponse<ProfileResponse>> {
      return client.get<ProfileResponse>('/v1/me');
    },

    /**
     * Update current user's profile
     */
    async updateMe(data: UpdateProfileRequest): Promise<ApiResponse<ProfileResponse>> {
      return client.put<ProfileResponse>('/v1/me', data);
    },

    /**
     * Sync profile (upsert - create if not exists, update if exists)
     */
    async syncProfile(data: UpdateProfileRequest): Promise<ApiResponse<ProfileResponse>> {
      return client.post<ProfileResponse>('/v1/profiles/sync', data);
    },
  };
}
