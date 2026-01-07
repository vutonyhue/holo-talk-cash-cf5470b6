import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { MessageCircle, Sparkles } from 'lucide-react';
import { z } from 'zod';
import { PasswordStrengthIndicator } from '@/components/auth/PasswordStrengthIndicator';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { UsernameInput } from '@/components/auth/UsernameInput';
import { EmailInput } from '@/components/auth/EmailInput';

const emailSchema = z.string().email('Email không hợp lệ');
const passwordSchema = z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự');
// Username: 3-20 chars, lowercase alphanumeric + underscore, no leading/trailing/consecutive underscores
const usernameSchema = z.string()
  .min(3, 'Username phải có ít nhất 3 ký tự')
  .max(20, 'Username tối đa 20 ký tự')
  .regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, 'Username không hợp lệ');

export default function Auth() {
  const navigate = useNavigate();
  const { user, signIn, signUp, signInWithGoogle, signInWithGitHub, signInWithDiscord, resetPassword } = useAuth();
  const { toast } = useToast();
  
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isUsernameValid, setIsUsernameValid] = useState(false);
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(null);
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [isEmailAvailable, setIsEmailAvailable] = useState<boolean | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem('rememberMe') === 'true';
  });

  useEffect(() => {
    if (user) {
      navigate('/chat');
    }
  }, [user, navigate]);

  // Clear session on browser close if "Remember Me" is not checked
  useEffect(() => {
    const handleBeforeUnload = () => {
      const shouldRemember = localStorage.getItem('rememberMe') === 'true';
      if (!shouldRemember) {
        // Mark session as temporary
        sessionStorage.setItem('tempSession', 'true');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      emailSchema.parse(email);
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

    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);

    if (error) {
      let message = 'Đăng nhập thất bại';
      if (error.message.includes('Invalid login credentials')) {
        message = 'Email hoặc mật khẩu không đúng';
      }
      toast({
        title: 'Lỗi',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Normalize username to lowercase
    const normalizedUsername = username.trim().toLowerCase();
    
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
      usernameSchema.parse(normalizedUsername);
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

    // Check username availability one more time
    if (!isUsernameValid || isUsernameAvailable !== true) {
      toast({
        title: 'Lỗi',
        description: 'Username không hợp lệ hoặc đã được sử dụng',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    const { error } = await signUp(email, password, normalizedUsername);
    setIsLoading(false);

    if (error) {
      let message = 'Đăng ký thất bại';
      if (error.message.includes('already registered')) {
        message = 'Email này đã được sử dụng';
      } else if (error.message.includes('username') || error.message.includes('duplicate') || error.message.includes('unique')) {
        message = 'Username đã được sử dụng';
      }
      toast({
        title: 'Lỗi',
        description: message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Thành công!',
        description: 'Kiểm tra email để xác nhận tài khoản',
      });
    }
  };

  const handleUsernameValidityChange = useCallback((isValid: boolean, isAvailable: boolean | null) => {
    setIsUsernameValid(isValid);
    setIsUsernameAvailable(isAvailable);
  }, []);

  const handleEmailValidityChange = useCallback((isValid: boolean, isAvailable: boolean | null, isChecking: boolean) => {
    setIsEmailValid(isValid);
    setIsEmailAvailable(isAvailable);
    setIsCheckingEmail(isChecking);
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    const { error } = await signInWithGoogle();
    setIsLoading(false);
    
    if (error) {
      toast({
        title: 'Lỗi',
        description: 'Đăng nhập bằng Google thất bại',
        variant: 'destructive',
      });
    }
  };

  const handleGitHubLogin = async () => {
    setIsLoading(true);
    const { error } = await signInWithGitHub();
    setIsLoading(false);
    
    if (error) {
      toast({
        title: 'Lỗi',
        description: 'Đăng nhập bằng GitHub thất bại',
        variant: 'destructive',
      });
    }
  };

  const handleDiscordLogin = async () => {
    setIsLoading(true);
    const { error } = await signInWithDiscord();
    setIsLoading(false);
    
    if (error) {
      toast({
        title: 'Lỗi',
        description: 'Đăng nhập bằng Discord thất bại',
        variant: 'destructive',
      });
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      emailSchema.parse(email);
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

    setIsLoading(true);
    const { error } = await resetPassword(email);
    setIsLoading(false);

    if (error) {
      toast({
        title: 'Lỗi',
        description: 'Gửi email khôi phục thất bại',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Thành công!',
        description: 'Kiểm tra email để đặt lại mật khẩu',
      });
      setMode('login');
      setEmail('');
    }
  };

  const switchMode = (newMode: 'login' | 'signup' | 'forgot') => {
    setMode(newMode);
    setEmail('');
    setPassword('');
    setUsername('');
  };

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
                <MessageCircle className="w-10 h-10 text-primary-foreground" />
              </div>
              <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-fun-yellow" style={{ color: 'hsl(var(--fun-yellow))' }} />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold text-gradient">FunChat</CardTitle>
          <CardDescription className="text-base">
            Chat vui vẻ • Video call • Gửi Crypto 🚀
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12"
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Mật khẩu</Label>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs text-primary hover:underline"
                  >
                    Quên mật khẩu?
                  </button>
                </div>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="remember-me"
                  checked={rememberMe}
                  onChange={(e) => {
                    setRememberMe(e.target.checked);
                    localStorage.setItem('rememberMe', String(e.target.checked));
                  }}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer">
                  Ghi nhớ đăng nhập
                </Label>
              </div>
              <Button 
                type="submit" 
                className="w-full h-12 text-lg font-semibold gradient-primary btn-3d"
                disabled={isLoading}
              >
                {isLoading ? 'Đang xử lý...' : 'Đăng nhập'}
              </Button>
            </form>
          )}

          {mode === 'signup' && (
            <form onSubmit={handleSignup} className="space-y-4">
              <UsernameInput
                value={username}
                onChange={setUsername}
                onValidityChange={handleUsernameValidityChange}
                required
              />
              <EmailInput
                value={email}
                onChange={setEmail}
                onValidityChange={handleEmailValidityChange}
                mode="signup"
                required
              />
              <div className="space-y-2">
                <Label htmlFor="signup-password">Mật khẩu</Label>
                <PasswordInput
                  id="signup-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <PasswordStrengthIndicator password={password} />
              </div>
              <Button 
                type="submit" 
                className="w-full h-12 text-lg font-semibold gradient-primary btn-3d"
                disabled={
                  isLoading || 
                  !isUsernameValid || isUsernameAvailable !== true ||
                  !isEmailValid || isEmailAvailable !== true ||
                  isCheckingEmail
                }
              >
                {isLoading ? 'Đang xử lý...' : 'Tạo tài khoản'}
              </Button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12"
                  required
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Nhập email của bạn để nhận link đặt lại mật khẩu
              </p>
              <Button 
                type="submit" 
                className="w-full h-12 text-lg font-semibold gradient-primary btn-3d"
                disabled={isLoading}
              >
                {isLoading ? 'Đang gửi...' : 'Gửi email khôi phục'}
              </Button>
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full text-sm text-primary hover:underline"
              >
                ← Quay lại đăng nhập
              </button>
            </form>
          )}

          {mode !== 'forgot' && (
            <>
              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">hoặc</span>
                </div>
              </div>

              {/* Google Login Button */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 text-base font-medium gap-3"
                onClick={handleGoogleLogin}
                disabled={isLoading}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {mode === 'login' ? 'Đăng nhập với Google' : 'Đăng ký với Google'}
              </Button>

              {/* GitHub Login Button */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 text-base font-medium gap-3"
                onClick={handleGitHubLogin}
                disabled={isLoading}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                {mode === 'login' ? 'Đăng nhập với GitHub' : 'Đăng ký với GitHub'}
              </Button>

              {/* Discord Login Button */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 text-base font-medium gap-3"
                onClick={handleDiscordLogin}
                disabled={isLoading}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#5865F2">
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
                </svg>
                {mode === 'login' ? 'Đăng nhập với Discord' : 'Đăng ký với Discord'}
              </Button>

              {/* Switch mode link */}
              <p className="text-center text-sm text-muted-foreground">
                {mode === 'login' ? (
                  <>
                    Không có tài khoản?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className="text-primary font-semibold hover:underline"
                    >
                      Đăng ký
                    </button>
                  </>
                ) : (
                  <>
                    Đã có tài khoản?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="text-primary font-semibold hover:underline"
                    >
                      Đăng nhập
                    </button>
                  </>
                )}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
