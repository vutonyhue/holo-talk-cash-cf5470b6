/**
 * FunChat SDK - Users Resource
 * Methods for managing user profiles
 */

import type { FunChatClient } from '../client';
import type {
  Profile,
  UpdateProfileParams,
  SearchUsersParams,
  UserStats,
} from '../types';

/**
 * Users resource for profile operations
 */
export class UsersResource {
  constructor(private client: FunChatClient) {}

  /**
   * Get the current authenticated user's profile
   * 
   * @returns Current user profile
   * 
   * @example
   * ```typescript
   * const me = await client.users.me();
   * console.log(`Logged in as: ${me.display_name || me.username}`);
   * ```
   */
  async me(): Promise<Profile> {
    return this.client.request<Profile>('GET', '/api-users', {
      params: { action: 'me' }
    });
  }

  /**
   * Update the current user's profile
   * 
   * @param params - Profile fields to update
   * @returns Updated profile
   * 
   * @example
   * ```typescript
   * const updated = await client.users.updateMe({
   *   display_name: 'John Doe',
   *   status: 'Working from home'
   * });
   * ```
   */
  async updateMe(params: UpdateProfileParams): Promise<Profile> {
    return this.client.request<Profile>('PUT', '/api-users', {
      body: {
        action: 'update',
        ...params
      }
    });
  }

  /**
   * Get a user profile by ID
   * 
   * @param userId - User ID to fetch
   * @returns User profile
   * @throws NotFoundError if user doesn't exist
   * 
   * @example
   * ```typescript
   * const user = await client.users.get('user-123');
   * console.log(`User: ${user.username}`);
   * ```
   */
  async get(userId: string): Promise<Profile> {
    return this.client.request<Profile>('GET', '/api-users', {
      params: { action: 'get', user_id: userId }
    });
  }

  /**
   * Get a user profile by username
   * 
   * @param username - Username to look up
   * @returns User profile
   * @throws NotFoundError if user doesn't exist
   * 
   * @example
   * ```typescript
   * const user = await client.users.getByUsername('johndoe');
   * ```
   */
  async getByUsername(username: string): Promise<Profile> {
    return this.client.request<Profile>('GET', '/api-users', {
      params: { action: 'get_by_username', username }
    });
  }

  /**
   * Search for users
   * 
   * @param params - Search parameters
   * @returns Array of matching user profiles
   * 
   * @example
   * ```typescript
   * const users = await client.users.search({
   *   query: 'john',
   *   limit: 10
   * });
   * console.log(`Found ${users.length} users`);
   * ```
   */
  async search(params: SearchUsersParams): Promise<Profile[]> {
    return this.client.request<Profile[]>('GET', '/api-users', {
      params: {
        action: 'search',
        query: params.query,
        limit: params.limit?.toString()
      }
    });
  }

  /**
   * Search users by query string (convenience method)
   * 
   * @param query - Search query
   * @param limit - Maximum results (default: 20)
   * @returns Array of matching profiles
   * 
   * @example
   * ```typescript
   * const users = await client.users.find('john');
   * ```
   */
  async find(query: string, limit?: number): Promise<Profile[]> {
    return this.search({ query, limit });
  }

  /**
   * Get current user's statistics
   * 
   * @returns User statistics
   * 
   * @example
   * ```typescript
   * const stats = await client.users.stats();
   * console.log(`Messages sent: ${stats.messages_sent}`);
   * ```
   */
  async stats(): Promise<UserStats> {
    return this.client.request<UserStats>('GET', '/api-users', {
      params: { action: 'stats' }
    });
  }

  /**
   * Check if a username is available
   * 
   * @param username - Username to check
   * @returns Availability status
   * 
   * @example
   * ```typescript
   * const { available } = await client.users.checkUsername('newuser');
   * if (available) {
   *   console.log('Username is available!');
   * }
   * ```
   */
  async checkUsername(username: string): Promise<{ available: boolean; username: string }> {
    return this.client.request<{ available: boolean; username: string }>('GET', '/api-users', {
      params: { action: 'check_username', username }
    });
  }

  /**
   * Update user's wallet address
   * 
   * @param walletAddress - Crypto wallet address
   * @returns Updated profile
   * 
   * @example
   * ```typescript
   * const updated = await client.users.updateWallet('0x123...');
   * ```
   */
  async updateWallet(walletAddress: string): Promise<Profile> {
    return this.updateMe({ wallet_address: walletAddress });
  }

  /**
   * Update user's avatar
   * 
   * @param avatarUrl - URL to avatar image
   * @returns Updated profile
   * 
   * @example
   * ```typescript
   * const updated = await client.users.updateAvatar('https://example.com/avatar.jpg');
   * ```
   */
  async updateAvatar(avatarUrl: string): Promise<Profile> {
    return this.updateMe({ avatar_url: avatarUrl });
  }

  /**
   * Update user's status message
   * 
   * @param status - Status message
   * @returns Updated profile
   * 
   * @example
   * ```typescript
   * const updated = await client.users.updateStatus('In a meeting');
   * ```
   */
  async updateStatus(status: string): Promise<Profile> {
    return this.updateMe({ status });
  }
}
