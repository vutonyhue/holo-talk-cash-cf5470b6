import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MessageCircle, 
  Phone, 
  Users, 
  Bot, 
  Gift, 
  Settings, 
  LogOut,
  User,
  Key,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarButtonProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
}

function SidebarButton({ icon: Icon, label, active, badge, onClick }: SidebarButtonProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClick}
            className={cn(
              "w-10 h-10 rounded-xl relative transition-all duration-200",
              active 
                ? "bg-sidebar-accent text-sidebar-primary shadow-sm" 
                : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            )}
          >
            <Icon className="w-5 h-5" />
            {badge && badge > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface AppSidebarProps {
  activeTab: 'chat' | 'calls' | 'community' | 'ai' | 'settings';
  onTabChange: (tab: 'chat' | 'calls' | 'community' | 'ai' | 'settings') => void;
  callBadge?: number;
}

export default function AppSidebar({ activeTab, onTabChange, callBadge }: AppSidebarProps) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  return (
    <aside className="w-14 h-full flex flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="h-14 flex items-center justify-center">
        <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center shadow-3d">
          <MessageCircle className="w-5 h-5 text-primary-foreground" />
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 flex flex-col items-center py-2 space-y-1">
        <SidebarButton
          icon={MessageCircle}
          label="Đoạn chat"
          active={activeTab === 'chat'}
          onClick={() => onTabChange('chat')}
        />
        <SidebarButton
          icon={Phone}
          label="Cuộc gọi"
          active={activeTab === 'calls'}
          badge={callBadge}
          onClick={() => onTabChange('calls')}
        />
        <SidebarButton
          icon={Users}
          label="Cộng đồng"
          active={activeTab === 'community'}
          onClick={() => onTabChange('community')}
        />
        <SidebarButton
          icon={Bot}
          label="Meta AI"
          active={activeTab === 'ai'}
          onClick={() => onTabChange('ai')}
        />
      </nav>

      {/* Bottom Actions */}
      <div className="flex flex-col items-center py-3 space-y-1 border-t border-sidebar-border">
        <SidebarButton
          icon={Gift}
          label="Nhiệm vụ thưởng"
          onClick={() => navigate('/rewards')}
        />
        <SidebarButton
          icon={Settings}
          label="Cài đặt"
          active={activeTab === 'settings'}
          onClick={() => onTabChange('settings')}
        />

        {/* User Avatar with Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="w-10 h-10 rounded-xl mt-1">
              <Avatar className="w-8 h-8 ring-2 ring-primary/20">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="gradient-primary text-primary-foreground text-xs font-bold">
                  {profile?.display_name?.slice(0, 2).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56 mb-2">
            <div className="px-3 py-2">
              <p className="font-semibold">{profile?.display_name}</p>
              <p className="text-sm text-muted-foreground">@{profile?.username}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/profile')}>
              <User className="mr-2 h-4 w-4" />
              Hồ sơ cá nhân
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/api-keys')}>
              <Key className="mr-2 h-4 w-4" />
              API Keys
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/api-docs')}>
              <FileText className="mr-2 h-4 w-4" />
              API Docs
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
