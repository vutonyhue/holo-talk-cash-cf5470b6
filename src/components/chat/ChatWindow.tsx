import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Conversation, Message } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { useMessages } from '@/hooks/useMessages';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { useReadReceipts } from '@/hooks/useReadReceipts';
import { useReactions } from '@/hooks/useReactions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import MessageBubble from './MessageBubble';
import CryptoSendDialog from './CryptoSendDialog';
import ImagePreviewDialog from './ImagePreviewDialog';
import ImageLightbox, { LightboxImage } from './ImageLightbox';
import ForwardMessageDialog from './ForwardMessageDialog';
import TextInputContextMenu from './TextInputContextMenu';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  Phone, 
  Video, 
  MoreVertical, 
  Send, 
  Smile, 
  Paperclip,
  Coins,
  Loader2,
  ArrowLeft,
  X,
  Reply,
  Mic,
  User,
  Bell,
  BellOff,
  Trash2
} from 'lucide-react';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import VoiceRecorder from './VoiceRecorder';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatWindowProps {
  conversation: Conversation;
  conversations: Conversation[];
  onVideoCall: () => void;
  onVoiceCall: () => void;
  onBack?: () => void;
  onDeleteConversation?: (conversationId: string) => void;
}

export default function ChatWindow({ conversation, conversations, onVideoCall, onVoiceCall, onBack, onDeleteConversation }: ChatWindowProps) {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const { messages, loading, sendMessage, sendCryptoMessage, sendImageMessage, sendVoiceMessage, deleteMessage, retryMessage } = useMessages(conversation.id);
  const { typingUsers, broadcastTyping } = useTypingIndicator(conversation.id);
  const { isRecording, duration, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();
  
  // Sort messages by created_at ASC for correct display order
  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [messages]);

  // Get message IDs for read receipts - only stable (non-temp) messages from others
  const stableMessageIds = useMemo(() => 
    sortedMessages
      .filter(m => !m.id.startsWith('temp_') && m.sender_id !== user?.id)
      .map(m => m.id), 
    [sortedMessages, user?.id]
  );
  const { markAsRead, isReadByOthers, getReadTime } = useReadReceipts(conversation.id, stableMessageIds);
  
  // Reactions - only for stable messages
  const allStableMessageIds = useMemo(() => 
    sortedMessages.filter(m => !m.id.startsWith('temp_')).map(m => m.id), 
    [sortedMessages]
  );
  const { fetchReactions, toggleReaction, getReactionGroups } = useReactions(conversation.id);
  
  // Fetch reactions when messages change
  useEffect(() => {
    if (allStableMessageIds.length > 0) {
      fetchReactions(allStableMessageIds);
    }
  }, [allStableMessageIds, fetchReactions]);
  const [newMessage, setNewMessage] = useState('');
  const [showCryptoDialog, setShowCryptoDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [initialScrollDone, setInitialScrollDone] = useState(false);

  // Extract all images from messages for lightbox navigation
  const allImages = useMemo<LightboxImage[]>(() => {
    return messages
      .filter(m => m.message_type === 'image')
      .map(m => {
        const metadata = m.metadata as { file_url: string; file_name: string };
        return { src: metadata.file_url, alt: metadata.file_name };
      });
  }, [messages]);

  const handleImageClick = (src: string, alt: string) => {
    const index = allImages.findIndex(img => img.src === src);
    if (index !== -1) {
      setLightboxIndex(index);
    }
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  };

  const otherMember = conversation.members?.find(m => m.user_id !== profile?.id);
  const chatName = conversation.is_group 
    ? conversation.name 
    : otherMember?.profile?.display_name || otherMember?.profile?.username;
  const chatAvatar = conversation.is_group 
    ? conversation.avatar_url 
    : otherMember?.profile?.avatar_url;

  // Fetch mute status
  useEffect(() => {
    const fetchMuteStatus = async () => {
      if (!user) return;

      const { data } = await supabase
        .from('conversation_members')
        .select('is_muted')
        .eq('conversation_id', conversation.id)
        .eq('user_id', user.id)
        .single();

      setIsMuted(data?.is_muted || false);
    };

    fetchMuteStatus();
  }, [conversation.id, user]);

  // Reset scroll flag when conversation changes
  useEffect(() => {
    setInitialScrollDone(false);
  }, [conversation.id]);

  // Initial scroll when opening conversation (instant, no animation)
  useEffect(() => {
    if (!loading && messages.length > 0 && !initialScrollDone) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      setInitialScrollDone(true);
    }
  }, [loading, messages.length, initialScrollDone]);

  // Scroll on new messages (smooth animation)
  useEffect(() => {
    if (initialScrollDone && messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages.length, initialScrollDone]);

  // Mark messages as read when they are displayed (debounced)
  useEffect(() => {
    if (!user || stableMessageIds.length === 0) return;
    
    // Debounce to avoid spam
    const timer = setTimeout(() => {
      markAsRead(stableMessageIds);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [stableMessageIds, user, markAsRead]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;

    const content = newMessage;
    const replyId = replyingTo?.id;
    setNewMessage('');
    setReplyingTo(null);
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    
    await sendMessage(content, 'text', {}, replyId);
  };

  const handleReply = (message: Message) => {
    setReplyingTo(message);
    textareaRef.current?.focus();
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success('Đã sao chép tin nhắn');
  };

  const handleForward = (message: Message) => {
    setForwardingMessage(message);
  };

  const handleForwardToConversations = async (conversationIds: string[], message: Message) => {
    if (!user) return;

    try {
      // Forward message to each selected conversation
      for (const convId of conversationIds) {
        let content = message.content || '';
        let metadata = { ...message.metadata, forwarded: true, original_sender: message.sender?.display_name };

        // Handle different message types
        if (message.message_type === 'image' || message.message_type === 'file') {
          content = message.content || (message.message_type === 'image' ? 'Đã chuyển tiếp hình ảnh' : 'Đã chuyển tiếp file');
        } else if (message.message_type === 'crypto') {
          content = `Đã chuyển tiếp: ${message.content}`;
          metadata = { forwarded: true, original_sender: message.sender?.display_name };
        }

        await supabase
          .from('messages')
          .insert({
            conversation_id: convId,
            sender_id: user.id,
            content,
            message_type: message.message_type,
            metadata,
          });
      }

      toast.success(`Đã chuyển tiếp đến ${conversationIds.length} cuộc trò chuyện`);
    } catch (error) {
      console.error('Forward error:', error);
      toast.error('Không thể chuyển tiếp tin nhắn');
    }
  };

  const handleDelete = async (message: Message) => {
    const { error } = await deleteMessage(message.id);
    if (error) {
      toast.error('Không thể thu hồi tin nhắn');
    } else {
      toast.success('Đã thu hồi tin nhắn');
    }
  };

  const handleReaction = (messageId: string, emoji: string) => {
    toggleReaction(messageId, emoji);
  };

  const handleRetry = (messageId: string) => {
    retryMessage(messageId);
  };

  const getReplyPreview = (msg: Message) => {
    if (msg.message_type === 'image') return '📷 Hình ảnh';
    if (msg.message_type === 'file') return '📎 File';
    if (msg.message_type === 'crypto') return '💰 Crypto';
    return msg.content?.slice(0, 50) + (msg.content && msg.content.length > 50 ? '...' : '');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Shift+Enter sẽ tự động xuống dòng
  };

  const handleSendCrypto = async (amount: number, currency: string, txHash?: string) => {
    if (!otherMember) return;
    await sendCryptoMessage(otherMember.user_id, amount, currency, txHash);
    setShowCryptoDialog(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input immediately
    e.target.value = '';

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File quá lớn. Giới hạn 10MB');
      return;
    }

    // If image, show preview dialog
    if (file.type.startsWith('image/')) {
      setPreviewFile(file);
      setShowPreview(true);
    } else {
      // For other files, upload directly
      setUploading(true);
      const { error } = await sendImageMessage(file);
      setUploading(false);

      if (error) {
        toast.error('Không thể gửi file');
        console.error('Upload error:', error);
      }
    }
  };

  const handleSendWithCaption = async (caption: string) => {
    if (!previewFile) return;

    setUploading(true);
    const { error } = await sendImageMessage(previewFile, caption);
    setUploading(false);

    if (error) {
      toast.error('Không thể gửi ảnh');
      console.error('Upload error:', error);
    } else {
      setShowPreview(false);
      setPreviewFile(null);
    }
  };

  const handleClosePreview = () => {
    if (!uploading) {
      setShowPreview(false);
      setPreviewFile(null);
    }
  };

  const handleStartRecording = async () => {
    const success = await startRecording();
    if (!success) {
      toast.error('Không thể truy cập microphone. Vui lòng cấp quyền.');
    }
  };

  const handleSendVoice = async () => {
    const audioBlob = await stopRecording();
    if (audioBlob && duration > 0) {
      const { error } = await sendVoiceMessage(audioBlob, duration);
      if (error) {
        toast.error('Không thể gửi tin nhắn thoại');
        console.error('Voice send error:', error);
      }
    }
  };

  const handleCancelRecording = () => {
    cancelRecording();
  };

  // Menu handlers
  const handleViewProfile = () => {
    if (conversation.is_group) {
      toast.info('Đây là nhóm chat');
    } else if (otherMember?.user_id) {
      navigate(`/profile/${otherMember.user_id}`);
    }
  };

  const handleToggleMute = async () => {
    if (!user) return;

    const newMutedState = !isMuted;

    const { error } = await supabase
      .from('conversation_members')
      .update({
        is_muted: newMutedState,
        muted_at: newMutedState ? new Date().toISOString() : null,
      })
      .eq('conversation_id', conversation.id)
      .eq('user_id', user.id);

    if (error) {
      toast.error('Không thể thay đổi cài đặt thông báo');
    } else {
      setIsMuted(newMutedState);
      toast.success(newMutedState ? 'Đã tắt thông báo' : 'Đã bật thông báo');
    }
  };

  const handleDeleteConversation = async () => {
    if (!user) return;

    const { error } = await supabase
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversation.id)
      .eq('user_id', user.id);

    if (error) {
      toast.error('Không thể xóa cuộc trò chuyện');
    } else {
      toast.success('Đã xóa cuộc trò chuyện');
      onDeleteConversation?.(conversation.id);
      if (onBack) onBack();
    }

    setShowDeleteDialog(false);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-xl"
              onClick={onBack}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <Avatar className="w-10 h-10 ring-2 ring-offset-2 ring-primary/20">
            <AvatarImage src={chatAvatar || undefined} />
            <AvatarFallback className={`font-semibold ${
              conversation.is_group ? 'gradient-warm' : 'gradient-primary'
            } text-white`}>
              {chatName?.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold">{chatName}</h2>
            <p className="text-xs text-muted-foreground">
              {conversation.is_group 
                ? `${conversation.members?.length} thành viên`
                : 'Đang hoạt động'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-xl text-primary hover:bg-primary/10"
            onClick={onVoiceCall}
          >
            <Phone className="w-5 h-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-xl text-primary hover:bg-primary/10"
            onClick={onVideoCall}
          >
            <Video className="w-5 h-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-xl">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleViewProfile}>
                <User className="w-4 h-4 mr-2" />
                Xem hồ sơ
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleMute}>
                {isMuted ? (
                  <>
                    <Bell className="w-4 h-4 mr-2" />
                    Bật thông báo
                  </>
                ) : (
                  <>
                    <BellOff className="w-4 h-4 mr-2" />
                    Tắt thông báo
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="text-destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Xóa cuộc trò chuyện
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4 gradient-chat" ref={scrollRef}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : sortedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <div className="w-20 h-20 rounded-2xl gradient-primary/20 flex items-center justify-center mb-4">
              <Send className="w-10 h-10 text-primary" />
            </div>
            <p className="font-medium">Bắt đầu cuộc trò chuyện</p>
            <p className="text-sm">Gửi tin nhắn đầu tiên cho {chatName}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sortedMessages.map((message, index) => {
              const isLastFromSender = 
                index === sortedMessages.length - 1 || 
                sortedMessages[index + 1]?.sender_id !== message.sender_id;
              
              return (
                <MessageBubble 
                  key={message.id} 
                  message={message} 
                  onImageClick={handleImageClick}
                  isRead={isReadByOthers(message.id, message.sender_id || '')}
                  readTime={getReadTime(message.id, message.sender_id || '')}
                  showReadStatus={isLastFromSender}
                  onReply={handleReply}
                  onCopy={handleCopy}
                  onForward={handleForward}
                  onDelete={handleDelete}
                  onReaction={handleReaction}
                  reactionGroups={getReactionGroups(message.id)}
                  onRetry={handleRetry}
                />
              );
            })}
            
            {/* Typing Indicator */}
            {typingUsers.length > 0 && (
              <div className="flex items-center gap-2 px-2 py-1">
                <div className="flex items-center gap-1 px-3 py-2 bg-muted rounded-2xl">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {typingUsers.length === 1 
                    ? `${typingUsers[0].name} đang nhập...`
                    : `${typingUsers.map(u => u.name).join(', ')} đang nhập...`
                  }
                </span>
              </div>
            )}
            
            {/* Scroll anchor - invisible element at the end */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Reply Preview */}
      {replyingTo && (
        <div className="px-4 pt-3 bg-card/50 backdrop-blur-sm border-t">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
            <Reply className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-primary">
                Đang trả lời {replyingTo.sender_id === user?.id ? 'chính bạn' : replyingTo.sender?.display_name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {getReplyPreview(replyingTo)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 rounded-full shrink-0"
              onClick={() => setReplyingTo(null)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t bg-card/50 backdrop-blur-sm">
        {isRecording ? (
          <VoiceRecorder
            duration={duration}
            onCancel={handleCancelRecording}
            onSend={handleSendVoice}
          />
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="rounded-xl text-muted-foreground hover:text-primary">
                <Smile className="w-5 h-5" />
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar"
                className="hidden"
              />
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-xl text-muted-foreground hover:text-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Paperclip className="w-5 h-5" />
                )}
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-xl text-muted-foreground hover:text-primary"
                onClick={handleStartRecording}
              >
                <Mic className="w-5 h-5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-xl text-muted-foreground hover:text-fun-yellow"
                style={{ '--fun-yellow': 'var(--fun-yellow)' } as React.CSSProperties}
                onClick={() => setShowCryptoDialog(true)}
              >
                <Coins className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex-1 relative">
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <Textarea
                    ref={textareaRef}
                    placeholder="Nhập tin nhắn..."
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      adjustTextareaHeight();
                      broadcastTyping();
                    }}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    className="min-h-[44px] max-h-[120px] py-3 pr-12 resize-none rounded-xl bg-muted/50 border-0 focus-visible:ring-primary overflow-y-auto"
                  />
                </ContextMenuTrigger>
                <TextInputContextMenu
                  textareaRef={textareaRef}
                  value={newMessage}
                  onChange={setNewMessage}
                  onKeyDown={handleKeyDown}
                />
              </ContextMenu>
              <Button 
                size="icon" 
                className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg gradient-primary"
                onClick={handleSend}
                disabled={!newMessage.trim()}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Crypto Dialog */}
      <CryptoSendDialog
        open={showCryptoDialog}
        onClose={() => setShowCryptoDialog(false)}
        onSend={handleSendCrypto}
        recipientName={chatName || ''}
        recipientWallet={otherMember?.profile?.wallet_address}
      />

      {/* Image Preview Dialog */}
      <ImagePreviewDialog
        open={showPreview}
        onClose={handleClosePreview}
        file={previewFile}
        onSend={handleSendWithCaption}
        uploading={uploading}
      />

      {/* Image Lightbox with swipe */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={allImages}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}

      {/* Forward Message Dialog */}
      <ForwardMessageDialog
        open={!!forwardingMessage}
        onClose={() => setForwardingMessage(null)}
        message={forwardingMessage}
        conversations={conversations.filter(c => c.id !== conversation.id)}
        onForward={handleForwardToConversations}
      />

      {/* Delete Conversation Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa cuộc trò chuyện?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sẽ không thể nhận tin nhắn từ cuộc trò chuyện này nữa.
              Lịch sử tin nhắn sẽ bị xóa khỏi danh sách của bạn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
