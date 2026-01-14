/**
 * Users API Module
 * Endpoints for user search and profile operations
 */

import { ApiClient } from '../apiClient';
import { ApiResponse, ProfileResponse } from '../types';

export interface UserSearchResponse {
  users: ProfileResponse[];
  total: number;
}

export function createUsersApi(client: ApiClient) {
  return {
    /**
     * Search users by username, display_name, or phone number
     */
    async search(query: string, limit = 10): Promise<ApiResponse<UserSearchResponse>> {
      const queryParams = new URLSearchParams({
        q: query,
        limit: limit.toString(),
      });
      return client.get<UserSearchResponse>(`/v1/users/search?${queryParams.toString()}`);
    },

    /**
     * Get a user's public profile by ID
     */
    async getProfile(userId: string): Promise<ApiResponse<ProfileResponse>> {
      return client.get<ProfileResponse>(`/v1/users/${userId}`);
    },

    /**
     * Get multiple users' profiles by IDs
     */
    async getProfiles(userIds: string[]): Promise<ApiResponse<ProfileResponse[]>> {
      return client.post<ProfileResponse[]>('/v1/users/batch', { user_ids: userIds });
    },

    /**
     * Check if a username is available
     */
    async checkUsername(username: string): Promise<ApiResponse<{ available: boolean }>> {
      return client.get<{ available: boolean }>(`/v1/users/check-username?username=${encodeURIComponent(username)}`);
    },

    /**
     * Update user's online status
     */
    async updateStatus(status: 'online' | 'away' | 'offline'): Promise<ApiResponse<void>> {
      return client.patch<void>('/v1/users/status', { status });
    },

    /**
     * Update last seen timestamp
     */
    async updateLastSeen(): Promise<ApiResponse<void>> {
      return client.patch<void>('/v1/users/last-seen');
    },
  };
}
