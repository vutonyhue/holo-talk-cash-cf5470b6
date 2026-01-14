/**
 * Reactions API Module
 * Endpoints for message reaction operations
 */

import { ApiClient } from '../apiClient';
import { ApiResponse, ReactionResponse } from '../types';

export interface ReactionListResponse {
  reactions: ReactionResponse[];
}

export function createReactionsApi(client: ApiClient) {
  return {
    /**
     * Get reactions for multiple messages
     */
    async getForMessages(messageIds: string[]): Promise<ApiResponse<ReactionListResponse>> {
      return client.post<ReactionListResponse>('/v1/reactions/batch', { message_ids: messageIds });
    },

    /**
     * Add a reaction to a message
     */
    async add(messageId: string, emoji: string): Promise<ApiResponse<ReactionResponse>> {
      return client.post<ReactionResponse>('/v1/reactions', { message_id: messageId, emoji });
    },

    /**
     * Remove a reaction from a message
     */
    async remove(reactionId: string): Promise<ApiResponse<void>> {
      return client.delete<void>(`/v1/reactions/${reactionId}`);
    },

    /**
     * Toggle a reaction (add if not exists, remove if exists)
     */
    async toggle(messageId: string, emoji: string): Promise<ApiResponse<{ added: boolean; reaction?: ReactionResponse }>> {
      return client.post<{ added: boolean; reaction?: ReactionResponse }>('/v1/reactions/toggle', {
        message_id: messageId,
        emoji,
      });
    },
  };
}
