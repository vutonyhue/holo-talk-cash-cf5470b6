import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { KeyRound, Sparkles } from 'lucide-react';
import { z } from 'zod';
import { PasswordStrengthIndicator } from '@/components/auth/PasswordStrengthIndicator';
import { PasswordInput } from '@/components/auth/PasswordInput';

const passwordSchema = z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự');

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isValidSession, setIsValidSession] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check if user arrived via password reset link
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        setIsValidSession(true);
      } else {
        toast({
          title: 'Link không hợp lệ',
          description: 'Link đặt lại mật khẩu đã hết hạn hoặc không hợp lệ',
          variant: 'destructive',
        });
        setTimeout(() => navigate('/auth'), 2000);
      }
      setIsChecking(false);
    };

    // Listen for auth state changes (when user clicks reset link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          setIsValidSession(true);
          setIsChecking(false);
        }
      }
    );

    checkSession();

    return () => subscription.unsubscribe();
  }, [navigate, toast]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate password
    try {
      passwordSchema.parse(password);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({
          title: 'Lỗi',
          description: err.errors[0].message,
          variant: 'destructive',
        });
        return;
      }
    }

    // Check password match
    if (password !== confirmPassword) {
      toast({
        title: 'Lỗi',
        description: 'Mật khẩu xác nhận không khớp',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    
    const { error } = await supabase.auth.updateUser({
      password: password
    });

    setIsLoading(false);

    if (error) {
      toast({
        title: 'Lỗi',
        description: 'Đặt lại mật khẩu thất bại. Vui lòng thử lại.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Thành công!',
        description: 'Mật khẩu đã được đặt lại. Đang chuyển hướng...',
      });
      setTimeout(() => navigate('/chat'), 1500);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen gradient-chat flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Đang kiểm tra...</p>
        </div>
      </div>
    );
  }

  if (!isValidSession) {
    return (
      <div className="min-h-screen gradient-chat flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-muted-foreground">Đang chuyển hướng...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-chat flex items-center justify-center p-4">
      {/* Decorative elements */}
      <div className="absolute top-20 left-20 w-32 h-32 rounded-full gradient-primary opacity-20 blur-3xl animate-float" />
      <div className="absolute bottom-20 right-20 w-40 h-40 rounded-full gradient-accent opacity-20 blur-3xl animate-float" style={{ animationDelay: '1s' }} />
      
      <Card className="w-full max-w-md shadow-float border-0 bg-card/80 backdrop-blur-xl">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl gradient-primary flex items-center justify-center shadow-3d animate-float">
                <KeyRound className="w-10 h-10 text-primary-foreground" />
              </div>
              <Sparkles className="absolute -top-2 -right-2 w-6 h-6" style={{ color: 'hsl(var(--fun-yellow))' }} />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Đặt lại mật khẩu</CardTitle>
          <CardDescription className="text-base">
            Nhập mật khẩu mới cho tài khoản của bạn
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu mới</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <PasswordStrengthIndicator password={password} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Xác nhận mật khẩu</Label>
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Button 
              type="submit" 
              className="w-full h-12 text-lg font-semibold gradient-primary btn-3d"
              disabled={isLoading}
            >
              {isLoading ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            <button
              type="button"
              onClick={() => navigate('/auth')}
              className="text-primary hover:underline"
            >
              ← Quay lại đăng nhập
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
