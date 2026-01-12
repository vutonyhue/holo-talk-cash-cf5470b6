/**
 * FunChat SDK - User Types
 * Type definitions for user-related operations
 */

import type { Profile } from './chat';

export type { Profile };

/**
 * Parameters for updating user profile
 */
export interface UpdateProfileParams {
  /**
   * Display name (can be different from username)
   */
  display_name?: string;

  /**
   * Avatar image URL
   */
  avatar_url?: string;

  /**
   * User status message
   */
  status?: string;

  /**
   * Phone number (E.164 format recommended)
   */
  phone_number?: string;

  /**
   * Crypto wallet address
   */
  wallet_address?: string;
}

/**
 * Parameters for searching users
 */
export interface SearchUsersParams {
  /**
   * Search query (searches username, display_name, email)
   */
  query: string;

  /**
   * Maximum number of results
   * @default 20
   */
  limit?: number;
}

/**
 * User presence status
 */
export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';

/**
 * User with presence information
 */
export interface UserWithPresence extends Profile {
  presence?: PresenceStatus;
  last_active?: string;
}

/**
 * User statistics
 */
export interface UserStats {
  conversations_count: number;
  messages_sent: number;
  messages_received: number;
  calls_made: number;
  calls_received: number;
  member_since: string;
}
