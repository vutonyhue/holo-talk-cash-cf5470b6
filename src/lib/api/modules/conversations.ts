/**
 * Conversations API Module
 * Endpoints for conversation CRUD operations
 */

import { ApiClient } from '../apiClient';
import { ApiResponse, ConversationResponse, PaginationParams } from '../types';

export interface CreateConversationRequest {
  member_ids: string[];
  name?: string;
  is_group?: boolean;
}

export interface ConversationListResponse {
  conversations: ConversationResponse[];
  total: number;
}

export function createConversationsApi(client: ApiClient) {
  return {
    /**
     * List all conversations for current user
     */
    async list(params?: PaginationParams): Promise<ApiResponse<ConversationListResponse>> {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', params.limit.toString());
      if (params?.offset) queryParams.set('offset', params.offset.toString());
      
      const query = queryParams.toString();
      return client.get<ConversationListResponse>(`/v1/conversations${query ? `?${query}` : ''}`);
    },

    /**
     * Get a specific conversation by ID
     */
    async get(conversationId: string): Promise<ApiResponse<ConversationResponse>> {
      return client.get<ConversationResponse>(`/v1/conversations/${conversationId}`);
    },

    /**
     * Create a new conversation
     */
    async create(data: CreateConversationRequest): Promise<ApiResponse<ConversationResponse>> {
      return client.post<ConversationResponse>('/v1/conversations', data);
    },

    /**
     * Update conversation (name, avatar, etc.)
     */
    async update(conversationId: string, data: Partial<CreateConversationRequest>): Promise<ApiResponse<ConversationResponse>> {
      return client.patch<ConversationResponse>(`/v1/conversations/${conversationId}`, data);
    },

    /**
     * Leave/delete a conversation (removes current user as member)
     */
    async leave(conversationId: string): Promise<ApiResponse<void>> {
      return client.delete<void>(`/v1/conversations/${conversationId}/leave`);
    },

    /**
     * Add members to a group conversation
     */
    async addMembers(conversationId: string, memberIds: string[]): Promise<ApiResponse<void>> {
      return client.post<void>(`/v1/conversations/${conversationId}/members`, { member_ids: memberIds });
    },

    /**
     * Remove a member from a group conversation
     */
    async removeMember(conversationId: string, memberId: string): Promise<ApiResponse<void>> {
      return client.delete<void>(`/v1/conversations/${conversationId}/members/${memberId}`);
    },

    /**
     * Check for existing 1-on-1 conversation with another user
     */
    async findDirectConversation(otherUserId: string): Promise<ApiResponse<ConversationResponse | null>> {
      return client.get<ConversationResponse | null>(`/v1/conversations/direct/${otherUserId}`);
    },
  };
}
