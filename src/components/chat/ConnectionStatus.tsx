/**
 * Connection Status Badge
 * Shows realtime connection status in chat header
 */

import { Loader2, WifiOff, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConnectionStatus as ConnectionStatusType } from '@/realtime/events';

interface ConnectionStatusProps {
  status: ConnectionStatusType;
  className?: string;
}

export function ConnectionStatus({ status, className }: ConnectionStatusProps) {
  // Don't show anything when connected (clean UI)
  if (status === 'connected') {
    return null;
  }
  
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
      status === 'reconnecting' 
        ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" 
        : "bg-destructive/10 text-destructive",
      className
    )}>
      {status === 'reconnecting' ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Đang kết nối...</span>
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" />
          <span>Mất kết nối</span>
        </>
      )}
    </div>
  );
}

// Optional: Connected indicator for debugging/explicit display
export function ConnectionIndicator({ status, className }: ConnectionStatusProps) {
  const getConfig = () => {
    switch (status) {
      case 'connected':
        return {
          icon: Wifi,
          label: 'Đã kết nối',
          className: 'bg-green-500/10 text-green-600 dark:text-green-400'
        };
      case 'reconnecting':
        return {
          icon: Loader2,
          label: 'Đang kết nối...',
          className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
        };
      case 'offline':
        return {
          icon: WifiOff,
          label: 'Mất kết nối',
          className: 'bg-destructive/10 text-destructive'
        };
    }
  };

  const config = getConfig();
  const Icon = config.icon;
  
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
      config.className,
      className
    )}>
      <Icon className={cn("w-3 h-3", status === 'reconnecting' && 'animate-spin')} />
      <span>{config.label}</span>
    </div>
  );
}
