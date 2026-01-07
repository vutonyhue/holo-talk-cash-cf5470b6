import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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
  const { user, session } = useAuth();
  const [tasks, setTasks] = useState<RewardTask[]>([]);
  const [userRewards, setUserRewards] = useState<UserReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    
    const [tasksRes, rewardsRes] = await Promise.all([
      supabase
        .from('reward_tasks')
        .select('*')
        .order('sort_order'),
      supabase
        .from('user_rewards')
        .select('*')
        .eq('user_id', user.id)
    ]);

    if (tasksRes.data) {
      setTasks(tasksRes.data as RewardTask[]);
    }
    
    if (rewardsRes.data) {
      setUserRewards(rewardsRes.data as UserReward[]);
    }
  }, [user]);

  // Check eligibility for auto-completable tasks
  const checkEligibility = useCallback(async () => {
    if (!session?.access_token) return;

    try {
      await supabase.functions.invoke('check-eligibility', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      // Refresh data after checking eligibility
      await fetchData();
    } catch (error) {
      console.error('Error checking eligibility:', error);
    }
  }, [session?.access_token, fetchData]);

  // Claim a reward
  const claimReward = useCallback(async (taskId: string): Promise<ClaimResult> => {
    if (!session?.access_token) {
      return { success: false, error: 'Not authenticated' };
    }

    setClaiming(taskId);

    try {
      const { data, error } = await supabase.functions.invoke('claim-reward', {
        body: { task_id: taskId },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) {
        console.error('Claim error:', error);
        return { success: false, error: error.message };
      }

      if (data?.error) {
        return { success: false, error: data.error };
      }

      // Refresh data after successful claim
      await fetchData();

      return {
        success: true,
        reward_amount: data.reward_amount,
        task_name: data.task_name
      };
    } catch (error) {
      console.error('Claim error:', error);
      return { success: false, error: 'Failed to claim reward' };
    } finally {
      setClaiming(null);
    }
  }, [session?.access_token, fetchData]);

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

    // Subscribe to realtime changes
    const channel = supabase
      .channel('user_rewards_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_rewards',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
