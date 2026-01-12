/**
 * FunChat SDK - Chat Resource
 * Methods for managing conversations and messages
 */

import type { FunChatClient } from '../client';
import type {
  Conversation,
  Message,
  CreateConversationParams,
  SendMessageParams,
  ListMessagesParams,
  UpdateConversationParams,
  AddMembersParams,
  ConversationMember,
} from '../types';

/**
 * Chat resource for conversation and message operations
 */
export class ChatResource {
  constructor(private client: FunChatClient) {}

  /**
   * List all conversations for the authenticated user
   * 
   * @example
   * ```typescript
   * const conversations = await client.chat.listConversations();
   * console.log(`Found ${conversations.length} conversations`);
   * ```
   */
  async listConversations(): Promise<Conversation[]> {
    return this.client.request<Conversation[]>('GET', '/api-chat', {
      params: { action: 'list' }
    });
  }

  /**
   * Get a single conversation by ID
   * 
   * @param id - Conversation ID
   * @throws NotFoundError if conversation doesn't exist
   * 
   * @example
   * ```typescript
   * const conversation = await client.chat.getConversation('conv-123');
   * console.log(`Conversation: ${conversation.name}`);
   * ```
   */
  async getConversation(id: string): Promise<Conversation> {
    return this.client.request<Conversation>('GET', '/api-chat', {
      params: { action: 'get', conversation_id: id }
    });
  }

  /**
   * Create a new conversation
   * 
   * @param params - Conversation creation parameters
   * @returns The created conversation
   * 
   * @example
   * ```typescript
   * // Create a direct message conversation
   * const dm = await client.chat.createConversation({
   *   member_ids: ['user-456']
   * });
   * 
   * // Create a group conversation
   * const group = await client.chat.createConversation({
   *   name: 'Team Chat',
   *   is_group: true,
   *   member_ids: ['user-456', 'user-789']
   * });
   * ```
   */
  async createConversation(params: CreateConversationParams): Promise<Conversation> {
    return this.client.request<Conversation>('POST', '/api-chat', {
      body: {
        action: 'create',
        ...params
      }
    });
  }

  /**
   * Update conversation details
   * 
   * @param id - Conversation ID
   * @param params - Fields to update
   * @returns The updated conversation
   * 
   * @example
   * ```typescript
   * const updated = await client.chat.updateConversation('conv-123', {
   *   name: 'New Group Name'
   * });
   * ```
   */
  async updateConversation(id: string, params: UpdateConversationParams): Promise<Conversation> {
    return this.client.request<Conversation>('PUT', '/api-chat', {
      body: {
        action: 'update',
        conversation_id: id,
        ...params
      }
    });
  }

  /**
   * List messages in a conversation
   * 
   * @param conversationId - Conversation ID
   * @param params - Pagination parameters
   * @returns Array of messages
   * 
   * @example
   * ```typescript
   * // Get recent messages
   * const messages = await client.chat.listMessages('conv-123');
   * 
   * // Get older messages with pagination
   * const olderMessages = await client.chat.listMessages('conv-123', {
   *   limit: 50,
   *   offset: 100
   * });
   * ```
   */
  async listMessages(conversationId: string, params?: ListMessagesParams): Promise<Message[]> {
    return this.client.request<Message[]>('GET', '/api-chat', {
      params: {
        action: 'messages',
        conversation_id: conversationId,
        limit: params?.limit?.toString(),
        offset: params?.offset?.toString(),
        before: params?.before,
        after: params?.after,
      }
    });
  }

  /**
   * Send a message to a conversation
   * 
   * @param conversationId - Target conversation ID
   * @param params - Message content and metadata
   * @returns The sent message
   * 
   * @example
   * ```typescript
   * // Send a text message
   * const message = await client.chat.sendMessage('conv-123', {
   *   content: 'Hello from SDK!'
   * });
   * 
   * // Send a message with image
   * const imageMessage = await client.chat.sendMessage('conv-123', {
   *   content: 'Check this out',
   *   message_type: 'image',
   *   metadata: {
   *     image_url: 'https://example.com/image.jpg'
   *   }
   * });
   * 
   * // Reply to a message
   * const reply = await client.chat.sendMessage('conv-123', {
   *   content: 'I agree!',
   *   reply_to_id: 'msg-456'
   * });
   * ```
   */
  async sendMessage(conversationId: string, params: SendMessageParams): Promise<Message> {
    return this.client.request<Message>('POST', '/api-chat', {
      body: {
        action: 'send',
        conversation_id: conversationId,
        ...params
      }
    });
  }

  /**
   * Delete a message
   * 
   * @param messageId - Message ID to delete
   * @returns Deletion confirmation
   * 
   * @example
   * ```typescript
   * await client.chat.deleteMessage('msg-123');
   * console.log('Message deleted');
   * ```
   */
  async deleteMessage(messageId: string): Promise<{ deleted: boolean; message_id: string }> {
    return this.client.request<{ deleted: boolean; message_id: string }>('DELETE', '/api-chat', {
      params: { action: 'delete', message_id: messageId }
    });
  }

  /**
   * Add members to a group conversation
   * 
   * @param conversationId - Conversation ID
   * @param params - Members to add
   * @returns Updated member list
   * 
   * @example
   * ```typescript
   * const members = await client.chat.addMembers('conv-123', {
   *   member_ids: ['user-456', 'user-789'],
   *   role: 'member'
   * });
   * ```
   */
  async addMembers(conversationId: string, params: AddMembersParams): Promise<ConversationMember[]> {
    return this.client.request<ConversationMember[]>('POST', '/api-chat', {
      body: {
        action: 'add_members',
        conversation_id: conversationId,
        ...params
      }
    });
  }

  /**
   * Remove a member from a group conversation
   * 
   * @param conversationId - Conversation ID
   * @param memberId - User ID to remove
   * @returns Removal confirmation
   * 
   * @example
   * ```typescript
   * await client.chat.removeMember('conv-123', 'user-456');
   * ```
   */
  async removeMember(conversationId: string, memberId: string): Promise<{ removed: boolean }> {
    return this.client.request<{ removed: boolean }>('POST', '/api-chat', {
      body: {
        action: 'remove_member',
        conversation_id: conversationId,
        member_id: memberId
      }
    });
  }

  /**
   * Leave a conversation
   * 
   * @param conversationId - Conversation ID to leave
   * @returns Leave confirmation
   * 
   * @example
   * ```typescript
   * await client.chat.leaveConversation('conv-123');
   * ```
   */
  async leaveConversation(conversationId: string): Promise<{ left: boolean }> {
    return this.client.request<{ left: boolean }>('POST', '/api-chat', {
      body: {
        action: 'leave',
        conversation_id: conversationId
      }
    });
  }

  /**
   * Mark messages as read
   * 
   * @param conversationId - Conversation ID
   * @param messageId - Last read message ID
   * @returns Read confirmation
   * 
   * @example
   * ```typescript
   * await client.chat.markAsRead('conv-123', 'msg-456');
   * ```
   */
  async markAsRead(conversationId: string, messageId: string): Promise<{ marked: boolean }> {
    return this.client.request<{ marked: boolean }>('POST', '/api-chat', {
      body: {
        action: 'mark_read',
        conversation_id: conversationId,
        message_id: messageId
      }
    });
  }
}
