/**
 * Rewards API Module
 * Endpoints for reward tasks and claims
 */

import { ApiClient } from '../apiClient';
import { ApiResponse } from '../types';

export interface RewardTask {
  id: string;
  name_en: string;
  name_vi: string;
  description_en: string;
  description_vi: string;
  reward_amount: number;
  icon: string | null;
  category: string | null;
  sort_order?: number | null;
  is_active: boolean;
  requires_verification: boolean;
  max_claims: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface UserReward {
  id: string;
  task_id: string;
  user_id: string;
  status: 'pending' | 'completed' | 'claimed' | 'paid';
  progress: Record<string, unknown> | null;
  completed_at: string | null;
  claimed_at: string | null;
  paid_at: string | null;
  tx_hash: string | null;
  task?: RewardTask;
}

export interface ReferralCode {
  id: string;
  code: string;
  user_id: string;
  uses_count: number;
  max_uses: number | null;
  is_active: boolean;
}

export function createRewardsApi(client: ApiClient) {
  return {
    /**
     * Get all available reward tasks
     */
    async getTasks(): Promise<ApiResponse<RewardTask[]>> {
      return client.get<RewardTask[]>('/v1/rewards/tasks');
    },

    /**
     * Get user's reward progress
     */
    async getUserRewards(): Promise<ApiResponse<UserReward[]>> {
      return client.get<UserReward[]>('/v1/rewards/user-rewards');
    },

    /**
     * Check eligibility for a reward task
     */
    async checkEligibility(taskId: string): Promise<ApiResponse<{ eligible: boolean; reason?: string }>> {
      return client.post<{ eligible: boolean; reason?: string }>('/v1/rewards/check-eligibility', { task_id: taskId });
    },

    /**
     * Claim a reward
     */
    async claimReward(taskId: string): Promise<ApiResponse<UserReward>> {
      return client.post<UserReward>('/v1/rewards/claim', { task_id: taskId });
    },

    /**
     * Auto-check and upsert completion for some tasks (profile completeness, first message, etc.)
     * This is forwarded by the API Gateway to the `check-eligibility` Edge Function.
     */
    async autoCheckEligibility(taskIds?: string[]): Promise<ApiResponse<{ success: boolean; updated_tasks?: string[] }>> {
      return client.post<{ success: boolean; updated_tasks?: string[] }>('/v1/rewards/auto-check', {
        task_ids: taskIds,
      });
    },

    /**
     * Get user's referral code
     */
    async getReferralCode(): Promise<ApiResponse<ReferralCode>> {
      return client.get<ReferralCode>('/v1/rewards/referral-code');
    },

    /**
     * Use a referral code
     */
    async useReferralCode(code: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
      return client.post<{ success: boolean; message: string }>('/v1/rewards/use-referral', { code });
    },

    /**
     * Get reward summary (total earned, pending, etc.)
     */
    async getSummary(): Promise<ApiResponse<{
      total_earned: number;
      pending_amount: number;
      referral_count: number;
      tasks_completed: number;
    }>> {
      return client.get<{
        total_earned: number;
        pending_amount: number;
        referral_count: number;
        tasks_completed: number;
      }>('/v1/rewards/summary');
    },
  };
}
