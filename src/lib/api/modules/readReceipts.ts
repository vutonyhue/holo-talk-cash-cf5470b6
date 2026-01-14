/**
 * Read Receipts API Module
 * Endpoints for message read receipt operations
 */

import { ApiClient } from '../apiClient';
import { ApiResponse, ReadReceiptResponse } from '../types';

export interface ReadReceiptListResponse {
  receipts: ReadReceiptResponse[];
}

export function createReadReceiptsApi(client: ApiClient) {
  return {
    /**
     * Get read receipts for multiple messages
     */
    async getForMessages(messageIds: string[]): Promise<ApiResponse<ReadReceiptListResponse>> {
      return client.post<ReadReceiptListResponse>('/v1/read-receipts/batch', { message_ids: messageIds });
    },

    /**
     * Mark messages as read
     */
    async markAsRead(messageIds: string[]): Promise<ApiResponse<void>> {
      return client.post<void>('/v1/read-receipts', { message_ids: messageIds });
    },

    /**
     * Mark all messages in a conversation as read
     */
    async markConversationAsRead(conversationId: string): Promise<ApiResponse<void>> {
      return client.post<void>(`/v1/conversations/${conversationId}/read`);
    },

    /**
     * Get unread count for a conversation
     */
    async getUnreadCount(conversationId: string): Promise<ApiResponse<{ count: number }>> {
      return client.get<{ count: number }>(`/v1/conversations/${conversationId}/unread-count`);
    },

    /**
     * Get total unread count across all conversations
     */
    async getTotalUnreadCount(): Promise<ApiResponse<{ count: number }>> {
      return client.get<{ count: number }>('/v1/conversations/unread-count');
    },
  };
}
