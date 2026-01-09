import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Search, 
  User,
  Shield,
  MessageSquare,
  Video,
  Bell,
  Keyboard,
  HelpCircle,
  LogOut,
  Moon,
  Sun,
  Monitor,
  Globe,
  ChevronRight,
  Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingsMenuProps {
  onClose?: () => void;
}

interface MenuItemProps {
  icon: React.ElementType;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onClick?: () => void;
  endContent?: React.ReactNode;
}

function MenuItem({ icon: Icon, iconColor, title, subtitle, onClick, endContent }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors rounded-lg text-left"
    >
      <div className={cn(
        "w-9 h-9 rounded-lg flex items-center justify-center",
        iconColor || "bg-muted"
      )}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{title}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        )}
      </div>
      {endContent || <ChevronRight className="w-4 h-4 text-muted-foreground" />}
    </button>
  );
}

export default function SettingsMenu({ onClose }: SettingsMenuProps) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [notifications, setNotifications] = useState(true);
  const [language, setLanguage] = useState<'vi' | 'en'>('vi');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null;
    if (savedTheme) setTheme(savedTheme);
    
    const savedNotifications = localStorage.getItem('notifications');
    if (savedNotifications) setNotifications(savedNotifications === 'true');
    
    const savedLanguage = localStorage.getItem('language') as 'vi' | 'en' | null;
    if (savedLanguage) setLanguage(savedLanguage);
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('notifications', String(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  const getThemeIcon = () => {
    switch (theme) {
      case 'light': return Sun;
      case 'dark': return Moon;
      default: return Monitor;
    }
  };

  const ThemeIcon = getThemeIcon();

  return (
    <div className="h-full w-full flex flex-col bg-sidebar">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <h2 className="text-xl font-bold mb-4">Cài đặt</h2>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm cài đặt..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10 rounded-xl bg-muted/50 border-0"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {/* Profile Section */}
          <button
            onClick={() => navigate('/profile')}
            className="w-full p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors rounded-lg"
          >
            <Avatar className="w-14 h-14 ring-2 ring-primary/20">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="gradient-primary text-primary-foreground font-bold">
                {profile?.display_name?.slice(0, 2).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-left">
              <p className="font-semibold">{profile?.display_name || 'User'}</p>
              <p className="text-sm text-muted-foreground">{profile?.status || 'Xin chào! Mình đang dùng FunChat'}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>

          <div className="h-px bg-border my-2" />

          {/* Theme */}
          <div className="p-3 flex items-center gap-3 rounded-lg">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
              <ThemeIcon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <Label className="font-medium text-sm">Chủ đề</Label>
            </div>
            <Select value={theme} onValueChange={(value: 'light' | 'dark' | 'system') => setTheme(value)}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Sáng</SelectItem>
                <SelectItem value="dark">Tối</SelectItem>
                <SelectItem value="system">Hệ thống</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Language */}
          <div className="p-3 flex items-center gap-3 rounded-lg">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <Label className="font-medium text-sm">Ngôn ngữ</Label>
            </div>
            <Select value={language} onValueChange={(value: 'vi' | 'en') => setLanguage(value)}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vi">Tiếng Việt</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="h-px bg-border my-2" />

          {/* Account */}
          <MenuItem
            icon={User}
            iconColor="bg-gradient-to-br from-blue-500 to-cyan-500"
            title="Tài khoản"
            subtitle="Thông tin cá nhân, email"
            onClick={() => navigate('/profile')}
          />

          {/* Privacy */}
          <MenuItem
            icon={Lock}
            iconColor="bg-gradient-to-br from-indigo-500 to-purple-500"
            title="Quyền riêng tư"
            subtitle="Người liên hệ đã chặn, bảo mật"
          />

          {/* Chats */}
          <MenuItem
            icon={MessageSquare}
            iconColor="bg-gradient-to-br from-emerald-500 to-green-500"
            title="Đoạn chat"
            subtitle="Chủ đề, hình nền, lịch sử"
          />

          {/* Video & Voice */}
          <MenuItem
            icon={Video}
            iconColor="bg-gradient-to-br from-orange-500 to-red-500"
            title="Video và thoại"
            subtitle="Camera, micro và loa"
            onClick={() => navigate('/settings/video-voice')}
          />

          {/* Notifications */}
          <div className="p-3 flex items-center gap-3 rounded-lg">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Thông báo</p>
              <p className="text-xs text-muted-foreground">Âm thanh và thông báo đẩy</p>
            </div>
            <Switch
              checked={notifications}
              onCheckedChange={setNotifications}
            />
          </div>

          {/* Shortcuts */}
          <MenuItem
            icon={Keyboard}
            iconColor="bg-gradient-to-br from-gray-500 to-slate-600"
            title="Phím tắt"
            subtitle="Hành động nhanh trên bàn phím"
          />

          <div className="h-px bg-border my-2" />

          {/* Help */}
          <MenuItem
            icon={HelpCircle}
            iconColor="bg-gradient-to-br from-cyan-500 to-blue-500"
            title="Trợ giúp"
            subtitle="Câu hỏi thường gặp, liên hệ"
          />

          {/* Security */}
          <MenuItem
            icon={Shield}
            iconColor="bg-gradient-to-br from-amber-500 to-orange-500"
            title="Bảo mật"
            subtitle="Xác thực 2 bước, thiết bị"
          />

          <div className="h-px bg-border my-2" />

          {/* Logout */}
          <button
            onClick={signOut}
            className="w-full p-3 flex items-center gap-3 hover:bg-destructive/10 transition-colors rounded-lg text-destructive"
          >
            <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
              <LogOut className="w-5 h-5" />
            </div>
            <p className="font-medium text-sm">Đăng xuất</p>
          </button>
        </div>
      </ScrollArea>
    </div>
  );
}
