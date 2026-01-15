/**
 * Calls API Module
 * Endpoints for call session management
 */

import { ApiClient } from '../apiClient';
import { ApiResponse } from '../types';

export interface CallSession {
  id: string;
  caller_id: string;
  conversation_id: string;
  call_type: 'video' | 'voice';
  status: 'ringing' | 'accepted' | 'rejected' | 'ended' | 'missed';
  channel_name: string;
  agora_token?: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface StartCallRequest {
  conversation_id: string;
  call_type: 'video' | 'voice';
}

export interface UpdateCallRequest {
  status: 'accepted' | 'rejected' | 'ended' | 'missed';
}

export interface CallMessageRequest {
  conversation_id: string;
  call_type: 'video' | 'voice';
  call_status: 'rejected' | 'ended' | 'missed';
  duration?: number;
}

export function createCallsApi(client: ApiClient) {
  return {
    /**
     * Start a new call
     */
    async start(data: StartCallRequest): Promise<ApiResponse<CallSession>> {
      return client.post<CallSession>('/v1/calls', data);
    },

    /**
     * Get call session by ID
     */
    async get(callId: string): Promise<ApiResponse<CallSession>> {
      return client.get<CallSession>(`/v1/calls/${callId}`);
    },

    /**
     * Accept a call
     */
    async accept(callId: string): Promise<ApiResponse<CallSession>> {
      return client.patch<CallSession>(`/v1/calls/${callId}`, {
        status: 'accepted',
        started_at: new Date().toISOString(),
      });
    },

    /**
     * Reject a call
     */
    async reject(callId: string): Promise<ApiResponse<CallSession>> {
      return client.patch<CallSession>(`/v1/calls/${callId}`, {
        status: 'rejected',
        ended_at: new Date().toISOString(),
      });
    },

    /**
     * End a call
     */
    async end(callId: string): Promise<ApiResponse<CallSession>> {
      return client.patch<CallSession>(`/v1/calls/${callId}`, {
        status: 'ended',
        ended_at: new Date().toISOString(),
      });
    },

    /**
     * Send call status message to conversation
     */
    async sendCallMessage(data: CallMessageRequest): Promise<ApiResponse<void>> {
      return client.post<void>('/v1/calls/message', data);
    },

    /**
     * Get Agora token for a call
     */
    async getAgoraToken(callId: string): Promise<ApiResponse<{ token: string; channel: string }>> {
      return client.get<{ token: string; channel: string }>(`/v1/calls/${callId}/token`);
    },
  };
}
