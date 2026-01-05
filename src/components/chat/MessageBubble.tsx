import { Message } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Coins, CheckCheck, FileIcon, Download } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const { user } = useAuth();
  const isMine = message.sender_id === user?.id;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const renderContent = () => {
    // Image message
    if (message.message_type === 'image') {
      const { file_url, file_name, caption } = message.metadata as { 
        file_url: string; 
        file_name: string;
        caption?: string;
      };
      return (
        <div className={`rounded-2xl overflow-hidden max-w-xs ${
          isMine ? 'rounded-br-md' : 'rounded-bl-md'
        } ${caption ? (isMine ? 'bg-primary' : 'bg-card shadow-card') : ''}`}>
          <img 
            src={file_url} 
            alt={file_name}
            className="max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => window.open(file_url, '_blank')}
          />
          {caption && (
            <p className={`px-3 py-2 text-sm ${isMine ? 'text-primary-foreground' : ''}`}>
              {caption}
            </p>
          )}
        </div>
      );
    }

    // File message
    if (message.message_type === 'file') {
      const { file_url, file_name, file_size } = message.metadata as {
        file_url: string;
        file_name: string;
        file_size: number;
      };
      
      return (
        <a 
          href={file_url} 
          target="_blank" 
          rel="noopener noreferrer"
          className={`flex items-center gap-3 px-4 py-3 rounded-2xl hover:opacity-90 transition-opacity ${
            isMine 
              ? 'gradient-primary text-primary-foreground rounded-br-md' 
              : 'bg-card shadow-card rounded-bl-md'
          }`}
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            isMine ? 'bg-white/20' : 'bg-muted'
          }`}>
            <FileIcon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate text-sm">{file_name}</p>
            <p className="text-xs opacity-70">{formatFileSize(file_size)}</p>
          </div>
          <Download className="w-5 h-5 opacity-70" />
        </a>
      );
    }

    // Crypto message
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

    // Default text message
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
