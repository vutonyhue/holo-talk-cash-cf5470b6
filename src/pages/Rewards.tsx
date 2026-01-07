import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Gift, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useRewards } from '@/hooks/useRewards';
import { RewardCard } from '@/components/rewards/RewardCard';
import { ConfettiCelebration } from '@/components/rewards/ConfettiCelebration';
import { toast } from 'sonner';

const categoryNames: Record<string, string> = {
  onboarding: '🚀 Khởi đầu',
  social: '👥 Xã hội',
  engagement: '💬 Tương tác',
};

const categoryOrder = ['onboarding', 'social', 'engagement'];

export default function Rewards() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { 
    loading, 
    claiming,
    claimReward,
    totalEarned, 
    totalPending, 
    completedCount, 
    totalTasks,
    groupedByCategory 
  } = useRewards();

  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  const handleClaim = async (taskId: string) => {
    const result = await claimReward(taskId);
    
    if (result.success) {
      setShowConfetti(true);
      toast.success(
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-amber-500" />
          <span>+{result.reward_amount?.toLocaleString()} CAMLY!</span>
        </div>,
        { duration: 4000 }
      );
    } else {
      toast.error(result.error || 'Không thể nhận thưởng');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const groups = groupedByCategory();
  const totalCamly = totalEarned + totalPending;

  return (
    <div className="min-h-screen bg-background">
      <ConfettiCelebration 
        trigger={showConfetti} 
        onComplete={() => setShowConfetti(false)} 
      />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  Nhiệm vụ thưởng
                </h1>
              </div>
            </div>
            
            {/* Total CAMLY */}
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">
                {totalCamly.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">CAMLY</div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Summary Card */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/20 via-pink-500/10 to-amber-500/20 border border-primary/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/20">
              <Gift className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Tiến độ của bạn</h2>
              <p className="text-sm text-muted-foreground">
                Hoàn thành nhiệm vụ để nhận CAMLY
              </p>
            </div>
          </div>
          
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {completedCount}/{totalTasks} nhiệm vụ hoàn thành
              </span>
              <span className="font-medium">
                {totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0}%
              </span>
            </div>
            <div className="h-3 bg-background/50 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary via-pink-500 to-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0}%` }}
              />
            </div>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="p-3 rounded-xl bg-background/50">
              <div className="text-2xl font-bold text-emerald-500">
                {totalEarned.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Đã nhận</div>
            </div>
            <div className="p-3 rounded-xl bg-background/50">
              <div className="text-2xl font-bold text-amber-500">
                {totalPending.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Chờ nhận</div>
            </div>
          </div>
        </div>

        {/* Tasks by Category */}
        {categoryOrder.map(category => {
          const rewards = groups[category];
          if (!rewards || rewards.length === 0) return null;
          
          return (
            <div key={category} className="space-y-3">
              <h3 className="text-lg font-semibold px-1">
                {categoryNames[category] || category}
              </h3>
              <div className="space-y-2">
                {rewards.map(reward => (
                  <RewardCard 
                    key={reward.id} 
                    reward={reward}
                    onClaim={handleClaim}
                    claiming={claiming === reward.id}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
