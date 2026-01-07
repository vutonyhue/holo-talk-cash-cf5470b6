import { useState, useEffect } from 'react';
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

export function useRewards() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<RewardTask[]>([]);
  const [userRewards, setUserRewards] = useState<UserReward[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTasks([]);
      setUserRewards([]);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      
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
      
      setLoading(false);
    };

    fetchData();

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
  }, [user]);

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
    getRewardsWithStatus,
    getTaskStatus,
    totalEarned,
    totalPending,
    completedCount,
    totalTasks: tasks.length,
    groupedByCategory
  };
}
