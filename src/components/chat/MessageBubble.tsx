import { Message } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Coins, CheckCheck, FileIcon, Download, Reply, Copy, Forward, Trash2, Mic, Video, Phone, PhoneOff, PhoneMissed, Loader2, AlertCircle } from 'lucide-react';
import VoiceMessagePlayer from './VoiceMessagePlayer';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ReactionGroup } from '@/hooks/useReactions';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: Message;
  onImageClick?: (src: string, alt: string) => void;
  isRead?: boolean;
  readTime?: string | null;
  showReadStatus?: boolean;
  onReply?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onCopy?: (content: string) => void;
  onDelete?: (message: Message) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  reactionGroups?: ReactionGroup[];
  onRetry?: (messageId: string) => void;
}

export default function MessageBubble({ 
  message, 
  onImageClick, 
  isRead = false, 
  readTime = null,
  showReadStatus = true, 
  onReply,
  onForward,
  onCopy,
  onDelete,
  onReaction,
  reactionGroups = [],
  onRetry
}: MessageBubbleProps) {
  const { user } = useAuth();
  const isMine = message.sender_id === user?.id;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getReplyPreview = (msg: Message) => {
    if (msg.message_type === 'image') return '📷 Hình ảnh';
    if (msg.message_type === 'file') return '📎 File';
    if (msg.message_type === 'crypto') return '💰 Crypto';
    if (msg.message_type === 'voice') return '🎤 Tin nhắn thoại';
    return msg.content?.slice(0, 50) + (msg.content && msg.content.length > 50 ? '...' : '');
  };

  const renderReplyPreview = () => {
    if (!message.reply_to) return null;
    
    const repliedTo = message.reply_to;
    const isMyReply = repliedTo.sender_id === user?.id;
    
    return (
      <div 
        className={`mb-1.5 px-3 py-2 rounded-xl border-l-2 ${
          isMine 
            ? 'bg-white/10 border-white/40' 
            : 'bg-muted/50 border-primary/40'
        }`}
      >
        <p className={`text-xs font-medium ${isMine ? 'text-white/80' : 'text-primary'}`}>
          {isMyReply ? 'Bạn' : repliedTo.sender?.display_name || 'Người dùng'}
        </p>
        <p className={`text-xs truncate ${isMine ? 'text-white/60' : 'text-muted-foreground'}`}>
          {getReplyPreview(repliedTo)}
        </p>
      </div>
    );
  };

  // Check if message is deleted
  if (message.is_deleted) {
    return (
      <div className={`group flex gap-2 mb-3 animate-bubble-in ${isMine ? 'flex-row-reverse' : ''}`}>
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
          
          <div className={`px-4 py-2.5 rounded-2xl max-w-xs md:max-w-md ${
            isMine 
              ? 'bg-muted/50 border border-border rounded-br-md' 
              : 'bg-muted/50 border border-border rounded-bl-md'
          }`}>
            <p className="text-sm italic text-muted-foreground">
              Tin nhắn đã được thu hồi
            </p>
          </div>
          
          <div className={`flex items-center gap-1 mt-1 ${isMine ? 'mr-1' : 'ml-1'}`}>
            <span className="text-[11px] text-muted-foreground">
              {format(new Date(message.created_at), 'HH:mm', { locale: vi })}
            </span>
          </div>
        </div>
      </div>
    );
  }
  // Call message (system message) - render separately
  if (message.message_type === 'call') {
    const metadata = message.metadata as {
      call_type: 'video' | 'voice';
      call_status: 'rejected' | 'ended' | 'missed';
      duration?: number;
    } | null;
    
    const callType = metadata?.call_type || 'voice';
    const callStatus = metadata?.call_status || 'ended';
    
    const statusConfig = {
      rejected: { icon: PhoneOff, color: 'text-destructive' },
      ended: { icon: Phone, color: 'text-muted-foreground' },
      missed: { icon: PhoneMissed, color: 'text-destructive' },
    };
    
    const config = statusConfig[callStatus];
    const StatusIcon = config.icon;
    const isVideo = callType === 'video';
    
    return (
      <div className="flex justify-center my-4">
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-full text-sm text-muted-foreground border border-border">
          {isVideo ? (
            <Video className={`w-4 h-4 ${config.color}`} />
          ) : (
            <StatusIcon className={`w-4 h-4 ${config.color}`} />
          )}
          <span>{message.content}</span>
          <span className="text-xs opacity-70">
            {format(new Date(message.created_at), 'HH:mm', { locale: vi })}
          </span>
        </div>
      </div>
    );
  }

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
        } ${caption || message.reply_to ? (isMine ? 'bg-primary' : 'bg-card shadow-card') : ''}`}>
          {message.reply_to && (
            <div className="p-2 pb-0">
              {renderReplyPreview()}
            </div>
          )}
          <img 
            src={file_url} 
            alt={file_name}
            className="max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => onImageClick?.(file_url, file_name)}
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
        <div className={`rounded-2xl ${
          isMine 
            ? 'gradient-primary text-primary-foreground rounded-br-md' 
            : 'bg-card shadow-card rounded-bl-md'
        }`}>
          {renderReplyPreview()}
          <a 
            href={file_url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 hover:opacity-90 transition-opacity"
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
        </div>
      );
    }

    // Crypto message
    if (message.message_type === 'crypto') {
      const { amount, currency } = message.metadata as { amount: number; currency: string };
      return (
        <div className={`rounded-2xl ${
          isMine 
            ? 'gradient-warm text-white' 
            : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
        }`}>
          {message.reply_to && (
            <div className="px-4 pt-3">
              {renderReplyPreview()}
            </div>
          )}
          <div className="flex items-center gap-2 px-4 py-3">
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
        </div>
      );
    }

    // Voice message
    if (message.message_type === 'voice') {
      const { file_url, duration } = message.metadata as { file_url: string; duration: number };
      return (
        <div className="flex flex-col">
          {message.reply_to && (
            <div className={`px-3 pt-2 rounded-t-2xl ${isMine ? 'gradient-primary' : 'bg-card'}`}>
              {renderReplyPreview()}
            </div>
          )}
          <VoiceMessagePlayer 
            src={file_url} 
            duration={duration}
            isMine={isMine}
          />
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
        {renderReplyPreview()}
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </p>
      </div>
    );
  };

  const emojis = ['❤️', '😂', '👍', '😮', '😢', '😡'];

  return (
    <div className={cn(
      "group flex gap-2 mb-3 animate-bubble-in",
      isMine ? 'flex-row-reverse' : '',
      message._sending && "opacity-70",
      message._failed && "opacity-90"
    )}>
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
        
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="cursor-pointer">
              {renderContent()}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            {/* Emoji reactions */}
            <div className="flex items-center justify-around px-2 py-2 border-b">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  className="text-xl hover:scale-125 transition-transform p-1"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onReaction?.(message.id, emoji);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            
            <ContextMenuItem onClick={() => onReply?.(message)}>
              <Reply className="mr-2 h-4 w-4" />
              Trả lời
            </ContextMenuItem>
            
            {message.content && (
              <ContextMenuItem onClick={() => onCopy?.(message.content || '')}>
                <Copy className="mr-2 h-4 w-4" />
                Sao chép
              </ContextMenuItem>
            )}
            
            <ContextMenuItem onClick={() => onForward?.(message)}>
              <Forward className="mr-2 h-4 w-4" />
              Chuyển tiếp
            </ContextMenuItem>
            
            {isMine && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem 
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete?.(message)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Xóa
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
        
        {/* Reactions display */}
        {reactionGroups.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
            {reactionGroups.map((group) => (
              <button
                key={group.emoji}
                onClick={() => onReaction?.(message.id, group.emoji)}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors",
                  group.hasReacted
                    ? "bg-primary/20 border border-primary/40"
                    : "bg-muted/80 hover:bg-muted border border-transparent"
                )}
              >
                <span>{group.emoji}</span>
                <span className={group.hasReacted ? "text-primary font-medium" : "text-muted-foreground"}>
                  {group.count}
                </span>
              </button>
            ))}
          </div>
        )}
        
        <div className={`flex items-center gap-1 mt-1 ${isMine ? 'mr-1' : 'ml-1'}`}>
          <span className="text-[11px] text-muted-foreground">
            {format(new Date(message.created_at), 'HH:mm', { locale: vi })}
          </span>
          {isMine && showReadStatus && (
            <>
              {/* Sending indicator */}
              {message._sending && (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              )}
              
              {/* Failed indicator with retry */}
              {message._failed && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button 
                        onClick={() => onRetry?.(message.id)}
                        className="flex items-center gap-1 text-destructive hover:text-destructive/80"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p>Gửi thất bại. Nhấn để thử lại</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              
              {/* Read status */}
              {!message._sending && !message._failed && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CheckCheck 
                        className={`w-3.5 h-3.5 transition-all duration-500 ease-out cursor-pointer ${
                          isRead 
                            ? 'text-primary scale-110 animate-[pulse_0.5s_ease-out]' 
                            : 'text-muted-foreground/50 scale-100'
                        }`} 
                      />
                    </TooltipTrigger>
                    {isRead && readTime && (
                      <TooltipContent side="top" className="text-xs">
                        <p>Đã xem lúc {format(new Date(readTime), 'HH:mm, dd/MM/yyyy', { locale: vi })}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
