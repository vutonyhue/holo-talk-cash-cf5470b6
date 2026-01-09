import { useNavigate } from 'react-router-dom';
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
  FileText,
  PanelLeft,
  PanelLeftClose
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarButtonProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
  collapsed?: boolean;
}

function SidebarButton({ icon: Icon, label, active, badge, onClick, collapsed = true }: SidebarButtonProps) {
  const buttonContent = (
    <Button
      variant="ghost"
      size={collapsed ? "icon" : "default"}
      onClick={onClick}
      className={cn(
        "relative transition-all duration-200",
        collapsed 
          ? "w-10 h-10 rounded-xl" 
          : "w-full h-10 justify-start px-3 rounded-xl",
        active 
          ? "bg-sidebar-accent text-sidebar-primary shadow-sm" 
          : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
      )}
    >
      <Icon className="w-5 h-5 shrink-0" />
      {!collapsed && <span className="ml-3 truncate">{label}</span>}
      {badge && badge > 0 && (
        <span className={cn(
          "w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center",
          collapsed ? "absolute -top-1 -right-1" : "ml-auto"
        )}>
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </Button>
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            {buttonContent}
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            {label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return buttonContent;
}

interface AppSidebarProps {
  activeTab: 'chat' | 'calls' | 'community' | 'ai' | 'settings';
  onTabChange: (tab: 'chat' | 'calls' | 'community' | 'ai' | 'settings') => void;
  callBadge?: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function AppSidebar({ activeTab, onTabChange, callBadge, collapsed = true, onToggleCollapse }: AppSidebarProps) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  return (
    <aside className={cn(
      "h-full flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300",
      collapsed ? "w-14" : "w-52"
    )}>
      {/* Header with Logo and Toggle */}
      <div className={cn(
        "h-14 flex items-center border-b border-sidebar-border/50",
        collapsed ? "justify-center" : "justify-between px-3"
      )}>
        <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center shadow-3d shrink-0">
          <MessageCircle className="w-5 h-5 text-primary-foreground" />
        </div>
        {!collapsed && (
          <span className="font-bold text-lg text-gradient ml-2 flex-1">FunChat</span>
        )}
        {onToggleCollapse && (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleCollapse}
                  className={cn(
                    "w-8 h-8 rounded-lg text-muted-foreground hover:text-sidebar-foreground",
                    collapsed && "absolute left-16 top-3 bg-sidebar border border-sidebar-border shadow-sm z-10"
                  )}
                >
                  {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                {collapsed ? "Mở rộng" : "Thu gọn"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Main Navigation */}
      <nav className={cn(
        "flex-1 flex flex-col py-2 space-y-1",
        collapsed ? "items-center" : "px-2"
      )}>
        <SidebarButton
          icon={MessageCircle}
          label="Đoạn chat"
          active={activeTab === 'chat'}
          onClick={() => onTabChange('chat')}
          collapsed={collapsed}
        />
        <SidebarButton
          icon={Phone}
          label="Cuộc gọi"
          active={activeTab === 'calls'}
          badge={callBadge}
          onClick={() => onTabChange('calls')}
          collapsed={collapsed}
        />
        <SidebarButton
          icon={Users}
          label="Cộng đồng"
          active={activeTab === 'community'}
          onClick={() => onTabChange('community')}
          collapsed={collapsed}
        />
        <SidebarButton
          icon={Bot}
          label="Meta AI"
          active={activeTab === 'ai'}
          onClick={() => onTabChange('ai')}
          collapsed={collapsed}
        />
      </nav>

      {/* Bottom Actions */}
      <div className={cn(
        "flex flex-col py-3 space-y-1 border-t border-sidebar-border",
        collapsed ? "items-center" : "px-2"
      )}>
        <SidebarButton
          icon={Gift}
          label="Nhiệm vụ thưởng"
          onClick={() => navigate('/rewards')}
          collapsed={collapsed}
        />
        <SidebarButton
          icon={Settings}
          label="Cài đặt"
          active={activeTab === 'settings'}
          onClick={() => onTabChange('settings')}
          collapsed={collapsed}
        />

        {/* User Avatar with Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size={collapsed ? "icon" : "default"}
              className={cn(
                "mt-1 rounded-xl",
                collapsed ? "w-10 h-10" : "w-full h-10 justify-start px-3"
              )}
            >
              <Avatar className="w-8 h-8 ring-2 ring-primary/20 shrink-0">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="gradient-primary text-primary-foreground text-xs font-bold">
                  {profile?.display_name?.slice(0, 2).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="ml-3 text-left truncate">
                  <p className="text-sm font-medium truncate">{profile?.display_name}</p>
                </div>
              )}
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