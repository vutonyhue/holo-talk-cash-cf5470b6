import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface TypingUser {
  id: string;
  name: string;
  avatar_url?: string;
}

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
  className?: string;
}

/**
 * Formats typing users names for display
 * - 1 user: "Alice đang nhập..."
 * - 2 users: "Alice, Bob đang nhập..."
 * - 3+ users: "Alice, Bob và 2 người khác đang nhập..."
 */
function formatTypingText(users: TypingUser[]): string {
  if (users.length === 0) return '';
  if (users.length === 1) return `${users[0].name} đang nhập...`;
  if (users.length === 2) return `${users[0].name}, ${users[1].name} đang nhập...`;
  
  const othersCount = users.length - 2;
  return `${users[0].name}, ${users[1].name} và ${othersCount} người khác đang nhập...`;
}

/**
 * Get initials from name for avatar fallback
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function TypingIndicator({ typingUsers, className }: TypingIndicatorProps) {
  if (typingUsers.length === 0) return null;

  return (
    <div 
      className={cn(
        "flex items-center gap-2 px-2 py-1",
        "animate-fade-in transition-all duration-300 ease-out",
        className
      )}
    >
      {/* Avatar stack for typing users */}
      <div className="flex -space-x-2">
        {typingUsers.slice(0, 3).map((user, index) => (
          <Avatar 
            key={user.id} 
            className={cn(
              "h-6 w-6 border-2 border-background ring-0",
              "transition-transform duration-200"
            )}
            style={{ zIndex: 3 - index }}
          >
            <AvatarImage src={user.avatar_url} alt={user.name} />
            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>

      {/* Typing bubble with animated dots */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-2xl">
        <div className="flex gap-1">
          <span 
            className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" 
            style={{ animationDelay: '0ms', animationDuration: '1s' }} 
          />
          <span 
            className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" 
            style={{ animationDelay: '150ms', animationDuration: '1s' }} 
          />
          <span 
            className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" 
            style={{ animationDelay: '300ms', animationDuration: '1s' }} 
          />
        </div>
      </div>

      {/* Typing text */}
      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
        {formatTypingText(typingUsers)}
      </span>
    </div>
  );
}
