import { useState } from 'react';
import { Copy, Share2, Users, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useReferral } from '@/hooks/useReferral';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ReferralCodeCardProps {
  progress?: { invited?: number; required?: number };
  rewardAmount: number;
}

export function ReferralCodeCard({ progress, rewardAmount }: ReferralCodeCardProps) {
  const { referralCode, loading, copyToClipboard, shareReferral } = useReferral();
  const [copied, setCopied] = useState(false);

  const invited = progress?.invited || referralCode?.uses_count || 0;
  const required = progress?.required || 3;
  const progressPercent = Math.min((invited / required) * 100, 100);
  const isComplete = invited >= required;

  const handleCopy = async () => {
    const success = await copyToClipboard();
    if (success) {
      setCopied(true);
      toast.success('Đã copy mã giới thiệu!');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Không thể copy mã');
    }
  };

  const handleShare = async () => {
    const success = await shareReferral();
    if (success) {
      toast.success('Đã copy link giới thiệu!');
    }
  };

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-primary/10 via-pink-500/10 to-amber-500/10 border-primary/20">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-primary/10 via-pink-500/10 to-amber-500/10 border-primary/20 overflow-hidden">
      <CardContent className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Users className="w-4 h-4" />
          <span>Mã giới thiệu của bạn</span>
        </div>

        {/* Referral Code Display */}
        <div className="flex items-center justify-center">
          <div className="bg-background/80 backdrop-blur-sm rounded-lg px-6 py-4 border-2 border-dashed border-primary/30">
            <span className="font-mono text-2xl tracking-widest font-bold text-foreground">
              {referralCode?.code || '--------'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleCopy}
            disabled={!referralCode?.code}
          >
            {copied ? (
              <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
            ) : (
              <Copy className="w-4 h-4 mr-2" />
            )}
            {copied ? 'Đã copy' : 'Copy'}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleShare}
            disabled={!referralCode?.share_url}
          >
            <Share2 className="w-4 h-4 mr-2" />
            Chia sẻ
          </Button>
        </div>

        {/* Progress Section */}
        <div className="space-y-2 pt-2 border-t border-border/50">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" />
              Bạn bè đã đăng ký
            </span>
            <span className={cn(
              "font-semibold",
              isComplete ? "text-green-500" : "text-foreground"
            )}>
              {invited}/{required}
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          
          {isComplete ? (
            <p className="text-xs text-green-500 font-medium flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Hoàn thành! Nhấn "Nhận thưởng" để nhận {rewardAmount.toLocaleString()} CAMLY
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Mời thêm {required - invited} bạn bè để nhận {rewardAmount.toLocaleString()} CAMLY
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
