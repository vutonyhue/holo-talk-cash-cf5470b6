/**
 * Widget Messages Component
 * Simplified message list for embedded widget
 */

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/sdk/types/chat';

interface WidgetMessagesProps {
  messages: Message[];
  currentUserId: string | null;
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export function WidgetMessages({
  messages,
  currentUserId,
  isLoading,
  onLoadMore,
  hasMore,
}: WidgetMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    if (target.scrollTop === 0 && hasMore && !isLoading && onLoadMore) {
      onLoadMore();
    }
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Hôm nay';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Hôm qua';
    }
    return date.toLocaleDateString('vi-VN', { 
      day: 'numeric', 
      month: 'short' 
    });
  };

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  let currentDate = '';
  
  messages.forEach(msg => {
    const msgDate = formatDate(msg.created_at);
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groupedMessages.push({ date: msgDate, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  });

  return (
    <ScrollArea 
      className="flex-1 px-3" 
      ref={scrollRef as any}
      onScrollCapture={handleScroll}
    >
      {isLoading && messages.length === 0 && (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {hasMore && messages.length > 0 && (
        <div className="flex justify-center py-2">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <button
              onClick={onLoadMore}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Tải thêm
            </button>
          )}
        </div>
      )}

      <div className="py-3 space-y-4">
        {groupedMessages.map((group, groupIdx) => (
          <div key={groupIdx}>
            <div className="flex justify-center my-3">
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                {group.date}
              </span>
            </div>
            <div className="space-y-2">
              {group.messages.map((message) => {
                const isOwn = message.sender_id === currentUserId;
                const sender = message.sender;

                return (
                  <div
                    key={message.id}
                    className={cn(
                      'flex gap-2',
                      isOwn ? 'flex-row-reverse' : 'flex-row'
                    )}
                  >
                    {!isOwn && (
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarImage src={sender?.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {sender?.display_name?.[0] || sender?.username?.[0] || '?'}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={cn(
                        'max-w-[75%] rounded-2xl px-3 py-2',
                        isOwn
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-muted rounded-bl-md'
                      )}
                    >
                      {!isOwn && sender && (
                        <p className="text-xs font-medium mb-0.5 opacity-70">
                          {sender.display_name || sender.username}
                        </p>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.content}
                      </p>
                      <p
                        className={cn(
                          'text-[10px] mt-1',
                          isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'
                        )}
                      >
                        {formatTime(message.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div ref={bottomRef} />
    </ScrollArea>
  );
}
