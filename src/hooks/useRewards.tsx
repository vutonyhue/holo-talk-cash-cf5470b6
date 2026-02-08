import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

export interface RewardTask {
  id: string;
  name_vi: string;
  name_en: string;
  description_vi: string;
  description_en: string;
  reward_amount: number;
  icon: string;
  category: string;
  sort_order: number;
  is_active: boolean;
  requires_verification: boolean;
  max_claims: number;
  created_at: string;
}

export interface UserReward {
  id: string;
  user_id: string;
  task_id: string;
  status: 'pending' | 'completed' | 'claimed' | 'paid';
  progress: Record<string, any>;
  completed_at: string | null;
  claimed_at: string | null;
  paid_at: string | null;
  tx_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface RewardWithStatus extends RewardTask {
  userReward?: UserReward;
  status: 'locked' | 'pending' | 'completed' | 'claimed' | 'paid';
}

export interface ClaimResult {
  success: boolean;
  reward_amount?: number;
  task_name?: string;
  error?: string;
}

export function useRewards() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<RewardTask[]>([]);
  const [userRewards, setUserRewards] = useState<UserReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    
    try {
      // Fetch tasks and user rewards via API
      const [tasksRes, rewardsRes] = await Promise.all([
        api.rewards.getTasks(),
        api.rewards.getUserRewards(),
      ]);

      if (tasksRes.ok && tasksRes.data) {
        setTasks(tasksRes.data as RewardTask[]);
      }
      
      if (rewardsRes.ok && rewardsRes.data) {
        setUserRewards(rewardsRes.data as UserReward[]);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('[useRewards] Fetch error:', error);
    }
  }, [user]);

  // Check eligibility for auto-completable tasks
  const checkEligibility = useCallback(async () => {
    if (!user) return;

    try {
      // Trigger server-side eligibility upserts via API Gateway (forwarded to Edge Function)
      await api.rewards.autoCheckEligibility();
      // Refresh data after checking eligibility
      await fetchData();
    } catch (error) {
      if (import.meta.env.DEV) console.error('[useRewards] Error checking eligibility:', error);
    }
  }, [user, fetchData]);

  // Claim a reward via API
  const claimReward = useCallback(async (taskId: string): Promise<ClaimResult> => {
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    setClaiming(taskId);

    try {
      const response = await api.rewards.claimReward(taskId);

      if (!response.ok) {
        return { success: false, error: response.error?.message || 'Failed to claim reward' };
      }

      // Optimistic local update (avoid UI flicker)
      setUserRewards(prev =>
        prev.map(r => (r.task_id === taskId ? { ...r, status: 'claimed', claimed_at: new Date().toISOString() } : r))
      );

      // Refresh data after successful claim
      await fetchData();

      const task = tasks.find(t => t.id === taskId);
      return {
        success: true,
        reward_amount: task?.reward_amount,
        task_name: task?.name_vi || task?.name_en
      };
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('[useRewards] Claim error:', error);
      return { success: false, error: 'Failed to claim reward' };
    } finally {
      setClaiming(null);
    }
  }, [user, fetchData, tasks]);

  useEffect(() => {
    if (!user) {
      setTasks([]);
      setUserRewards([]);
      setLoading(false);
      return;
    }

    const init = async () => {
      setLoading(true);
      await fetchData();
      await checkEligibility();
      setLoading(false);
    };

    init();

    // Poll for updates (avoid Supabase Realtime in frontend)
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      fetchData();
    }, 15000);

    return () => {
      window.clearInterval(interval);
    };
  }, [user, fetchData, checkEligibility]);

  const getRewardsWithStatus = (): RewardWithStatus[] => {
    return tasks.map(task => {
      const userReward = userRewards.find(r => r.task_id === task.id);
      let status: RewardWithStatus['status'] = 'locked';
      
      if (userReward) {
        status = userReward.status as RewardWithStatus['status'];
      }
      
      return {
        ...task,
        userReward,
        status
      };
    });
  };

  const getTaskStatus = (taskId: string): RewardWithStatus['status'] => {
    const userReward = userRewards.find(r => r.task_id === taskId);
    if (!userReward) return 'locked';
    return userReward.status as RewardWithStatus['status'];
  };

  const totalEarned = userRewards
    .filter(r => r.status === 'claimed' || r.status === 'paid')
    .reduce((sum, r) => {
      const task = tasks.find(t => t.id === r.task_id);
      return sum + (task?.reward_amount || 0);
    }, 0);

  const totalPending = userRewards
    .filter(r => r.status === 'completed')
    .reduce((sum, r) => {
      const task = tasks.find(t => t.id === r.task_id);
      return sum + (task?.reward_amount || 0);
    }, 0);

  const completedCount = userRewards.filter(
    r => r.status === 'completed' || r.status === 'claimed' || r.status === 'paid'
  ).length;

  const groupedByCategory = () => {
    const rewards = getRewardsWithStatus();
    const groups: Record<string, RewardWithStatus[]> = {};
    
    rewards.forEach(reward => {
      if (!groups[reward.category]) {
        groups[reward.category] = [];
      }
      groups[reward.category].push(reward);
    });
    
    return groups;
  };

  return {
    tasks,
    userRewards,
    loading,
    claiming,
    claimReward,
    checkEligibility,
    getRewardsWithStatus,
    getTaskStatus,
    totalEarned,
    totalPending,
    completedCount,
    totalTasks: tasks.length,
    groupedByCategory
  };
}
