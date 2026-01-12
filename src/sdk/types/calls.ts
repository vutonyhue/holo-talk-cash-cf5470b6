/**
 * FunChat SDK - Call Types
 * Type definitions for voice/video call operations
 */

import type { Profile } from './chat';

/**
 * Call types supported
 */
export type CallType = 'video' | 'voice';

/**
 * Call status values
 */
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'rejected' | 'busy';

/**
 * Call session information
 */
export interface CallSession {
  id: string;
  conversation_id: string;
  caller_id: string;
  call_type: CallType;
  channel_name: string;
  agora_token?: string | null;
  status: CallStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  conversation?: {
    id: string;
    name: string | null;
    is_group: boolean | null;
  };
  caller?: Profile;
  participants?: CallParticipant[];
  duration_seconds?: number;
}

/**
 * Call participant information
 */
export interface CallParticipant {
  id: string;
  call_id: string | null;
  user_id: string | null;
  joined_at: string | null;
  left_at: string | null;
  user?: Profile;
}

/**
 * Parameters for initiating a call
 */
export interface InitiateCallParams {
  /**
   * Conversation ID to call
   */
  conversation_id: string;

  /**
   * Type of call
   * @default 'voice'
   */
  call_type?: CallType;
}

/**
 * Parameters for updating call status
 */
export interface UpdateCallStatusParams {
  /**
   * New status for the call
   */
  status: CallStatus;
}

/**
 * Parameters for listing call history
 */
export interface CallHistoryParams {
  /**
   * Maximum number of calls to return
   * @default 20
   */
  limit?: number;

  /**
   * Offset for pagination
   * @default 0
   */
  offset?: number;

  /**
   * Filter by call type
   */
  call_type?: CallType;

  /**
   * Filter by status
   */
  status?: CallStatus;

  /**
   * Filter by conversation ID
   */
  conversation_id?: string;
}

/**
 * Call statistics
 */
export interface CallStats {
  total_calls: number;
  total_duration_seconds: number;
  video_calls: number;
  voice_calls: number;
  missed_calls: number;
  average_duration_seconds: number;
}
