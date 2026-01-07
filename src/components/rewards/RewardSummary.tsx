import { Gift, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRewards } from '@/hooks/useRewards';
import { cn } from '@/lib/utils';

interface RewardSummaryProps {
  compact?: boolean;
}

export function RewardSummary({ compact = false }: RewardSummaryProps) {
  const navigate = useNavigate();
  const { totalEarned, totalPending, completedCount, totalTasks, loading } = useRewards();

  if (loading) {
    return (
      <div className="animate-pulse bg-muted rounded-xl p-4">
        <div className="h-4 bg-muted-foreground/20 rounded w-1/2 mb-2" />
        <div className="h-6 bg-muted-foreground/20 rounded w-3/4" />
      </div>
    );
  }

  if (compact) {
    return (
      <button
        onClick={() => navigate('/rewards')}
        className={cn(
          'flex items-center gap-3 w-full p-3 rounded-xl',
          'bg-gradient-to-r from-primary/10 to-pink-500/10',
          'border border-primary/20',
          'hover:border-primary/40 hover:shadow-md transition-all'
        )}
      >
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/20">
          <Gift className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 text-left">
          <div className="text-sm text-muted-foreground">Phần thưởng</div>
          <div className="font-bold text-primary">
            {(totalEarned + totalPending).toLocaleString()} CAMLY
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </button>
    );
  }

  return (
    <button
      onClick={() => navigate('/rewards')}
      className={cn(
        'w-full p-4 rounded-xl',
        'bg-gradient-to-r from-primary/10 via-pink-500/10 to-amber-500/10',
        'border border-primary/20',
        'hover:border-primary/40 hover:shadow-lg transition-all'
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-primary" />
          <span className="font-semibold">Nhiệm vụ thưởng</span>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </div>
      
      <div className="flex items-end justify-between">
        <div>
          <div className="text-3xl font-bold text-primary">
            {(totalEarned + totalPending).toLocaleString()}
          </div>
          <div className="text-sm text-muted-foreground">CAMLY</div>
        </div>
        
        <div className="text-right">
          <div className="text-sm">
            <span className="font-semibold text-foreground">{completedCount}</span>
            <span className="text-muted-foreground">/{totalTasks} hoàn thành</span>
          </div>
          {totalPending > 0 && (
            <div className="text-xs text-amber-500">
              +{totalPending.toLocaleString()} chờ nhận
            </div>
          )}
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-primary to-pink-500 rounded-full transition-all"
          style={{ width: `${(completedCount / totalTasks) * 100}%` }}
        />
      </div>
    </button>
  );
}
