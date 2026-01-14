/**
 * Widget Header Component
 * Compact header for embedded widget
 */

import { X, Minus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

interface WidgetHeaderProps {
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  onClose?: () => void;
  onMinimize?: () => void;
  showClose?: boolean;
  showMinimize?: boolean;
}

export function WidgetHeader({
  title,
  subtitle,
  avatarUrl,
  onClose,
  onMinimize,
  showClose = true,
  showMinimize = false,
}: WidgetHeaderProps) {
  const handleClose = () => {
    // Notify parent window
    window.parent.postMessage({ type: 'funchat:close' }, '*');
    onClose?.();
  };

  const handleMinimize = () => {
    window.parent.postMessage({ type: 'funchat:minimize' }, '*');
    onMinimize?.();
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground border-b shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar className="h-8 w-8">
          <AvatarImage src={avatarUrl || undefined} alt={title} />
          <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground text-sm">
            {title.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h3 className="font-semibold text-sm truncate">{title}</h3>
          {subtitle && (
            <p className="text-xs opacity-80 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {showMinimize && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
            onClick={handleMinimize}
          >
            <Minus className="h-4 w-4" />
          </Button>
        )}
        {showClose && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
