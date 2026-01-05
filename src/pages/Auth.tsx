import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { MessageCircle, Sparkles } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('Email không hợp lệ');
const passwordSchema = z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự');
const usernameSchema = z.string().min(3, 'Username phải có ít nhất 3 ký tự').regex(/^[a-zA-Z0-9_]+$/, 'Username chỉ được chứa chữ, số và _');

export default function Auth() {
  const navigate = useNavigate();
  const { user, signIn, signUp } = useAuth();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupUsername, setSignupUsername] = useState('');

  useEffect(() => {
    if (user) {
      navigate('/chat');
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      emailSchema.parse(loginEmail);
      passwordSchema.parse(loginPassword);
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
    const { error } = await signIn(loginEmail, loginPassword);
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
    
    try {
      emailSchema.parse(signupEmail);
      passwordSchema.parse(signupPassword);
      usernameSchema.parse(signupUsername);
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
    const { error } = await signUp(signupEmail, signupPassword, signupUsername);
    setIsLoading(false);

    if (error) {
      let message = 'Đăng ký thất bại';
      if (error.message.includes('already registered')) {
        message = 'Email này đã được sử dụng';
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
        
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login" className="font-semibold">Đăng nhập</TabsTrigger>
              <TabsTrigger value="signup" className="font-semibold">Đăng ký</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="email@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="h-12"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Mật khẩu</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="h-12"
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 text-lg font-semibold gradient-primary btn-3d"
                  disabled={isLoading}
                >
                  {isLoading ? 'Đang xử lý...' : 'Đăng nhập'}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-username">Username</Label>
                  <Input
                    id="signup-username"
                    type="text"
                    placeholder="username_vui"
                    value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value)}
                    className="h-12"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="email@example.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    className="h-12"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Mật khẩu</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    className="h-12"
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 text-lg font-semibold gradient-primary btn-3d"
                  disabled={isLoading}
                >
                  {isLoading ? 'Đang xử lý...' : 'Tạo tài khoản'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
