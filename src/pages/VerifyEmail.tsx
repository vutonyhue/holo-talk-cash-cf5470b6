import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, RefreshCw, LogOut, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const { user, loading, signOut, resendVerificationEmail, isEmailVerified } = useAuth();
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Redirect if already verified
  useEffect(() => {
    if (!loading && isEmailVerified) {
      navigate('/chat');
    }
  }, [isEmailVerified, loading, navigate]);

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  // Auto-check verification status every 5 seconds
  useEffect(() => {
    if (!user || isEmailVerified) return;

    const interval = setInterval(async () => {
      // Refresh session to get latest email_confirmed_at status
      const { data } = await (await import('@/integrations/supabase/client')).supabase.auth.getSession();
      if (data.session?.user?.email_confirmed_at) {
        toast.success('Email đã được xác minh!');
        navigate('/chat');
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [user, isEmailVerified, navigate]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleResendEmail = async () => {
    if (cooldown > 0) return;
    
    setResending(true);
    const { error } = await resendVerificationEmail();
    setResending(false);

    if (error) {
      toast.error('Gửi email thất bại: ' + error.message);
    } else {
      toast.success('Email xác minh đã được gửi lại!');
      setCooldown(60);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-chat flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-chat flex items-center justify-center p-4">
      {/* Decorative elements */}
      <div className="absolute top-20 left-20 w-32 h-32 rounded-full gradient-primary opacity-20 blur-3xl animate-float" />
      <div className="absolute bottom-20 right-20 w-40 h-40 rounded-full gradient-accent opacity-20 blur-3xl animate-float" style={{ animationDelay: '1s' }} />

      <Card className="w-full max-w-md shadow-float border-0 bg-card/80 backdrop-blur-xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                <Mail className="w-10 h-10 text-primary" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-fun-yellow flex items-center justify-center shadow-lg">
                <CheckCircle className="w-5 h-5 text-fun-purple" />
              </div>
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-gradient">
            Xác minh email của bạn
          </CardTitle>
          <CardDescription className="text-base">
            Chúng tôi đã gửi email xác minh đến{' '}
            <span className="font-semibold text-foreground">{user?.email}</span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-xl p-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              📧 Vui lòng kiểm tra hộp thư của bạn (bao gồm cả thư mục spam) và click vào link xác minh.
            </p>
            <p className="text-sm text-muted-foreground">
              ⏳ Trang này sẽ tự động chuyển hướng khi email được xác minh.
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleResendEmail}
              disabled={resending || cooldown > 0}
              className="w-full h-12 text-base font-semibold gradient-primary btn-3d"
            >
              {resending ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Đang gửi...
                </>
              ) : cooldown > 0 ? (
                <>
                  <RefreshCw className="w-5 h-5 mr-2" />
                  Gửi lại sau {cooldown}s
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5 mr-2" />
                  Gửi lại email xác minh
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleSignOut}
              className="w-full h-12 text-base"
            >
              <LogOut className="w-5 h-5 mr-2" />
              Đăng xuất
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Nếu bạn không nhận được email, hãy kiểm tra thư mục spam hoặc thử đăng ký lại với email khác.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
