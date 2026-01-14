/**
 * Messages API Module
 * Endpoints for message CRUD operations
 */

import { ApiClient } from '../apiClient';
import { ApiResponse, MessageResponse, PaginationParams } from '../types';

export interface SendMessageRequest {
  content: string;
  message_type?: string;
  metadata?: Record<string, unknown>;
  reply_to_id?: string;
}

export interface SendCryptoMessageRequest {
  to_user_id: string;
  amount: number;
  currency: string;
  tx_hash?: string;
}

export interface MessageListResponse {
  messages: MessageResponse[];
  total: number;
  hasMore: boolean;
}

export function createMessagesApi(client: ApiClient) {
  return {
    /**
     * List messages in a conversation
     */
    async list(conversationId: string, params?: PaginationParams): Promise<ApiResponse<MessageListResponse>> {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', params.limit.toString());
      if (params?.offset) queryParams.set('offset', params.offset.toString());
      if (params?.cursor) queryParams.set('cursor', params.cursor);
      
      const query = queryParams.toString();
      return client.get<MessageListResponse>(
        `/v1/conversations/${conversationId}/messages${query ? `?${query}` : ''}`
      );
    },

    /**
     * Send a text message
     */
    async send(conversationId: string, data: SendMessageRequest): Promise<ApiResponse<MessageResponse>> {
      return client.post<MessageResponse>(`/v1/conversations/${conversationId}/messages`, data);
    },

    /**
     * Send a crypto transaction message
     */
    async sendCrypto(conversationId: string, data: SendCryptoMessageRequest): Promise<ApiResponse<MessageResponse>> {
      return client.post<MessageResponse>(`/v1/conversations/${conversationId}/messages/crypto`, data);
    },

    /**
     * Send an image/file message (after uploading via presigned URL)
     */
    async sendMedia(conversationId: string, data: {
      content: string;
      file_url: string;
      file_name: string;
      file_size: number;
      file_type: string;
      caption?: string;
    }): Promise<ApiResponse<MessageResponse>> {
      const messageType = data.file_type.startsWith('image/') ? 'image' : 'file';
      return client.post<MessageResponse>(`/v1/conversations/${conversationId}/messages`, {
        content: data.content,
        message_type: messageType,
        metadata: {
          file_url: data.file_url,
          file_name: data.file_name,
          file_size: data.file_size,
          file_type: data.file_type,
          caption: data.caption || null,
        },
      });
    },

    /**
     * Send a voice message
     */
    async sendVoice(conversationId: string, data: {
      file_url: string;
      duration: number;
    }): Promise<ApiResponse<MessageResponse>> {
      return client.post<MessageResponse>(`/v1/conversations/${conversationId}/messages`, {
        content: 'Tin nhắn thoại',
        message_type: 'voice',
        metadata: {
          file_url: data.file_url,
          duration: data.duration,
          file_type: 'audio/webm',
        },
      });
    },

    /**
     * Delete a message (soft delete)
     */
    async delete(messageId: string): Promise<ApiResponse<void>> {
      return client.delete<void>(`/v1/messages/${messageId}`);
    },

    /**
     * Edit a message
     */
    async edit(messageId: string, content: string): Promise<ApiResponse<MessageResponse>> {
      return client.patch<MessageResponse>(`/v1/messages/${messageId}`, { content });
    },

    /**
     * Forward a message to another conversation
     */
    async forward(messageId: string, toConversationId: string): Promise<ApiResponse<MessageResponse>> {
      return client.post<MessageResponse>(`/v1/messages/${messageId}/forward`, {
        to_conversation_id: toConversationId,
      });
    },
  };
}
