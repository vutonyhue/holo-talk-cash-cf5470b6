/**
 * FunChat SDK - Calls Resource
 * Methods for voice and video calls
 */

import type { FunChatClient } from '../client';
import type {
  CallSession,
  CallStatus,
  CallStats,
  InitiateCallParams,
  CallHistoryParams,
} from '../types';

/**
 * Calls resource for voice/video call operations
 */
export class CallsResource {
  constructor(private client: FunChatClient) {}

  /**
   * Initiate a new call
   * 
   * @param params - Call parameters
   * @returns The created call session
   * 
   * @example
   * ```typescript
   * // Start a voice call
   * const call = await client.calls.initiate({
   *   conversation_id: 'conv-123',
   *   call_type: 'voice'
   * });
   * 
   * // Start a video call
   * const videoCall = await client.calls.initiate({
   *   conversation_id: 'conv-123',
   *   call_type: 'video'
   * });
   * 
   * console.log(`Call started: ${call.channel_name}`);
   * ```
   */
  async initiate(params: InitiateCallParams): Promise<CallSession> {
    return this.client.request<CallSession>('POST', '/api-calls', {
      body: {
        action: 'initiate',
        conversation_id: params.conversation_id,
        call_type: params.call_type || 'voice'
      }
    });
  }

  /**
   * Update a call's status
   * 
   * @param callId - Call ID
   * @param status - New status
   * @returns Updated call session
   * 
   * @example
   * ```typescript
   * // Answer a call
   * await client.calls.updateStatus('call-123', 'active');
   * 
   * // End a call
   * await client.calls.updateStatus('call-123', 'ended');
   * 
   * // Reject a call
   * await client.calls.updateStatus('call-123', 'rejected');
   * ```
   */
  async updateStatus(callId: string, status: CallStatus): Promise<CallSession> {
    return this.client.request<CallSession>('PUT', '/api-calls', {
      body: {
        action: 'update_status',
        call_id: callId,
        status
      }
    });
  }

  /**
   * Get a call by ID
   * 
   * @param callId - Call ID
   * @returns Call session details
   * @throws NotFoundError if call doesn't exist
   * 
   * @example
   * ```typescript
   * const call = await client.calls.get('call-123');
   * console.log(`Call status: ${call.status}`);
   * ```
   */
  async get(callId: string): Promise<CallSession> {
    return this.client.request<CallSession>('GET', '/api-calls', {
      params: { action: 'get', call_id: callId }
    });
  }

  /**
   * Get call history
   * 
   * @param params - Filter and pagination options
   * @returns Array of call sessions
   * 
   * @example
   * ```typescript
   * // Get recent calls
   * const calls = await client.calls.history();
   * 
   * // Get video calls only
   * const videoCalls = await client.calls.history({
   *   call_type: 'video',
   *   limit: 10
   * });
   * 
   * // Get missed calls
   * const missedCalls = await client.calls.history({
   *   status: 'missed'
   * });
   * ```
   */
  async history(params?: CallHistoryParams): Promise<CallSession[]> {
    return this.client.request<CallSession[]>('GET', '/api-calls', {
      params: {
        action: 'history',
        limit: params?.limit?.toString(),
        offset: params?.offset?.toString(),
        call_type: params?.call_type,
        status: params?.status,
        conversation_id: params?.conversation_id
      }
    });
  }

  /**
   * Answer an incoming call
   * 
   * @param callId - Call ID to answer
   * @returns Updated call session
   * 
   * @example
   * ```typescript
   * const call = await client.calls.answer('call-123');
   * // Use call.channel_name and call.agora_token to join
   * ```
   */
  async answer(callId: string): Promise<CallSession> {
    return this.updateStatus(callId, 'active');
  }

  /**
   * End an active call
   * 
   * @param callId - Call ID to end
   * @returns Updated call session
   * 
   * @example
   * ```typescript
   * await client.calls.end('call-123');
   * ```
   */
  async end(callId: string): Promise<CallSession> {
    return this.updateStatus(callId, 'ended');
  }

  /**
   * Reject an incoming call
   * 
   * @param callId - Call ID to reject
   * @returns Updated call session
   * 
   * @example
   * ```typescript
   * await client.calls.reject('call-123');
   * ```
   */
  async reject(callId: string): Promise<CallSession> {
    return this.updateStatus(callId, 'rejected');
  }

  /**
   * Get call statistics
   * 
   * @returns Call statistics for the current user
   * 
   * @example
   * ```typescript
   * const stats = await client.calls.stats();
   * console.log(`Total calls: ${stats.total_calls}`);
   * console.log(`Total duration: ${stats.total_duration_seconds}s`);
   * ```
   */
  async stats(): Promise<CallStats> {
    return this.client.request<CallStats>('GET', '/api-calls', {
      params: { action: 'stats' }
    });
  }

  /**
   * Get active call for a conversation
   * 
   * @param conversationId - Conversation ID
   * @returns Active call session or null
   * 
   * @example
   * ```typescript
   * const activeCall = await client.calls.getActive('conv-123');
   * if (activeCall) {
   *   console.log('There is an active call');
   * }
   * ```
   */
  async getActive(conversationId: string): Promise<CallSession | null> {
    try {
      return await this.client.request<CallSession>('GET', '/api-calls', {
        params: { action: 'get_active', conversation_id: conversationId }
      });
    } catch {
      return null;
    }
  }
}
