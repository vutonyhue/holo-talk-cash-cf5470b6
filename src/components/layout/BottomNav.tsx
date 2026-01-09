import { MessageCircle, Phone, Gift, Settings, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavButtonProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
}

function NavButton({ icon: Icon, label, active, badge, onClick }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors relative",
        active 
          ? "text-primary" 
          : "text-muted-foreground"
      )}
    >
      <div className="relative">
        <Icon className="w-5 h-5" />
        {badge && badge > 0 && (
          <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </div>
      <span className={cn(
        "text-[10px] font-medium",
        active && "font-semibold"
      )}>
        {label}
      </span>
      {active && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
      )}
    </button>
  );
}

interface BottomNavProps {
  activeTab: 'chat' | 'calls' | 'rewards' | 'settings' | 'profile';
  onTabChange: (tab: 'chat' | 'calls' | 'rewards' | 'settings' | 'profile') => void;
  callBadge?: number;
}

export default function BottomNav({ activeTab, onTabChange, callBadge }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-background border-t border-border flex md:hidden z-50 safe-area-inset-bottom">
      <NavButton
        icon={MessageCircle}
        label="Chat"
        active={activeTab === 'chat'}
        onClick={() => onTabChange('chat')}
      />
      <NavButton
        icon={Phone}
        label="Cuộc gọi"
        active={activeTab === 'calls'}
        badge={callBadge}
        onClick={() => onTabChange('calls')}
      />
      <NavButton
        icon={Gift}
        label="Thưởng"
        active={activeTab === 'rewards'}
        onClick={() => onTabChange('rewards')}
      />
      <NavButton
        icon={Settings}
        label="Cài đặt"
        active={activeTab === 'settings'}
        onClick={() => onTabChange('settings')}
      />
      <NavButton
        icon={User}
        label="Tôi"
        active={activeTab === 'profile'}
        onClick={() => onTabChange('profile')}
      />
    </nav>
  );
}
