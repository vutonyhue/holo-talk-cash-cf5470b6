import { Message } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Coins, Check, CheckCheck } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const { user } = useAuth();
  const isMine = message.sender_id === user?.id;

  const renderContent = () => {
    if (message.message_type === 'crypto') {
      const { amount, currency } = message.metadata as { amount: number; currency: string };
      return (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl ${
          isMine 
            ? 'gradient-warm text-white' 
            : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
        }`}>
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-lg">{amount} {currency}</p>
            <p className="text-sm opacity-80">
              {isMine ? 'Đã gửi' : 'Đã nhận'}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className={`px-4 py-2.5 rounded-2xl max-w-xs md:max-w-md lg:max-w-lg ${
        isMine 
          ? 'gradient-primary text-primary-foreground rounded-br-md' 
          : 'bg-card shadow-card rounded-bl-md'
      }`}>
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </p>
      </div>
    );
  };

  return (
    <div className={`flex gap-2 mb-3 animate-bubble-in ${isMine ? 'flex-row-reverse' : ''}`}>
      {!isMine && (
        <Avatar className="w-8 h-8 mt-1">
          <AvatarImage src={message.sender?.avatar_url || undefined} />
          <AvatarFallback className="gradient-accent text-white text-xs font-semibold">
            {message.sender?.display_name?.slice(0, 2).toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
      )}
      
      <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
        {!isMine && (
          <span className="text-xs text-muted-foreground font-medium mb-1 ml-1">
            {message.sender?.display_name}
          </span>
        )}
        
        {renderContent()}
        
        <div className={`flex items-center gap-1 mt-1 ${isMine ? 'mr-1' : 'ml-1'}`}>
          <span className="text-[11px] text-muted-foreground">
            {format(new Date(message.created_at), 'HH:mm', { locale: vi })}
          </span>
          {isMine && (
            <CheckCheck className="w-3.5 h-3.5 text-primary" />
          )}
        </div>
      </div>
    </div>
  );
}
