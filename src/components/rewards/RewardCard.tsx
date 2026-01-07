import { 
  UserPlus, 
  UserCheck, 
  MessageCircle, 
  Users, 
  MessageSquare,
  Gift,
  Check,
  Clock,
  Lock,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { RewardWithStatus } from '@/hooks/useRewards';
import { ReferralCodeCard } from './ReferralCodeCard';

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
  onClaim?: (taskId: string) => void;
  claiming?: boolean;
}

export function RewardCard({ reward, onClaim, claiming }: RewardCardProps) {
  // Special case: invite_friends shows ReferralCodeCard
  if (reward.id === 'invite_friends') {
    return (
      <div className="space-y-3">
        <ReferralCodeCard 
          progress={reward.userReward?.progress as { invited?: number; required?: number } | undefined}
          rewardAmount={reward.reward_amount}
        />
        {reward.status === 'completed' && (
          <Button
            onClick={() => onClaim?.(reward.id)}
            disabled={claiming}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg"
          >
            {claiming ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Gift className="w-4 h-4 mr-2" />
            )}
            Nhận {reward.reward_amount.toLocaleString()} CAMLY
          </Button>
        )}
        {reward.status === 'claimed' && (
          <div className="text-center text-sm text-primary font-medium flex items-center justify-center gap-1">
            <Check className="w-4 h-4" />
            Đã nhận thưởng
          </div>
        )}
        {reward.status === 'paid' && (
          <div className="text-center text-sm text-emerald-500 font-medium flex items-center justify-center gap-1">
            <Check className="w-4 h-4" />
            Đã thanh toán
          </div>
        )}
      </div>
    );
  }

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
      badge: null,
      badgeColor: '',
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
  const canClaim = reward.status === 'completed';

  return (
    <div
      className={cn(
        'relative flex items-center gap-4 p-4 rounded-xl border transition-all duration-200',
        'hover:shadow-md hover:scale-[1.01]',
        config.bg,
        config.border,
        canClaim && 'animate-pulse'
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
      </div>

      {/* Reward Amount & Action */}
      <div className="flex items-center gap-2">
        {canClaim ? (
          <Button
            size="sm"
            onClick={() => onClaim?.(reward.id)}
            disabled={claiming}
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg"
          >
            {claiming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Gift className="w-4 h-4 mr-1" />
                Nhận {reward.reward_amount.toLocaleString()}
              </>
            )}
          </Button>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
