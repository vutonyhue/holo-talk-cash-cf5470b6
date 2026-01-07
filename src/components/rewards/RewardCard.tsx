import { 
  UserPlus, 
  UserCheck, 
  MessageCircle, 
  Users, 
  MessageSquare,
  Gift,
  Check,
  Clock,
  Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RewardWithStatus } from '@/hooks/useRewards';

const iconMap: Record<string, React.ElementType> = {
  'user-plus': UserPlus,
  'user-check': UserCheck,
  'message-circle': MessageCircle,
  'users': Users,
  'message-square': MessageSquare,
  'gift': Gift,
};

interface RewardCardProps {
  reward: RewardWithStatus;
}

export function RewardCard({ reward }: RewardCardProps) {
  const Icon = iconMap[reward.icon] || Gift;
  
  const statusConfig = {
    locked: {
      bg: 'bg-muted/50',
      border: 'border-border',
      icon: Lock,
      iconColor: 'text-muted-foreground',
      badge: null,
      badgeColor: '',
    },
    pending: {
      bg: 'bg-muted/50',
      border: 'border-border',
      icon: Clock,
      iconColor: 'text-muted-foreground',
      badge: 'Đang thực hiện',
      badgeColor: 'bg-muted text-muted-foreground',
    },
    completed: {
      bg: 'bg-gradient-to-r from-amber-500/10 to-orange-500/10',
      border: 'border-amber-500/30',
      icon: Gift,
      iconColor: 'text-amber-500',
      badge: 'Sẵn sàng nhận',
      badgeColor: 'bg-amber-500/20 text-amber-600',
    },
    claimed: {
      bg: 'bg-gradient-to-r from-primary/10 to-pink-500/10',
      border: 'border-primary/30',
      icon: Check,
      iconColor: 'text-primary',
      badge: 'Đã nhận',
      badgeColor: 'bg-primary/20 text-primary',
    },
    paid: {
      bg: 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10',
      border: 'border-emerald-500/30',
      icon: Check,
      iconColor: 'text-emerald-500',
      badge: 'Đã thanh toán',
      badgeColor: 'bg-emerald-500/20 text-emerald-600',
    },
  };

  const config = statusConfig[reward.status];
  const StatusIcon = config.icon;
  const isCompleted = ['completed', 'claimed', 'paid'].includes(reward.status);

  return (
    <div
      className={cn(
        'relative flex items-center gap-4 p-4 rounded-xl border transition-all duration-200',
        'hover:shadow-md hover:scale-[1.01]',
        config.bg,
        config.border,
        reward.status === 'completed' && 'animate-pulse'
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex items-center justify-center w-12 h-12 rounded-xl',
          isCompleted ? 'bg-background/80' : 'bg-background/50'
        )}
      >
        <Icon className={cn('w-6 h-6', config.iconColor)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className={cn(
            'font-semibold truncate',
            reward.status === 'locked' ? 'text-muted-foreground' : 'text-foreground'
          )}>
            {reward.name_vi}
          </h3>
          {config.badge && (
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              config.badgeColor
            )}>
              {config.badge}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {reward.description_vi}
        </p>
        
        {/* Progress for invite_friends */}
        {reward.id === 'invite_friends' && reward.userReward?.progress && (
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ 
                    width: `${((reward.userReward.progress.invited || 0) / 3) * 100}%` 
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {reward.userReward.progress.invited || 0}/3
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Reward Amount */}
      <div className="flex items-center gap-2">
        <div className="text-right">
          <div className={cn(
            'font-bold text-lg',
            isCompleted ? 'text-primary' : 'text-muted-foreground'
          )}>
            {reward.reward_amount.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">CAMLY</div>
        </div>
        
        {/* Status Icon */}
        <div className={cn(
          'flex items-center justify-center w-8 h-8 rounded-full',
          isCompleted ? 'bg-primary/10' : 'bg-muted'
        )}>
          <StatusIcon className={cn('w-4 h-4', config.iconColor)} />
        </div>
      </div>
    </div>
  );
}
