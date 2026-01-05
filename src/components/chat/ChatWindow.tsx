import { useState, useRef, useEffect, useMemo } from 'react';
import { Conversation, Message } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { useMessages } from '@/hooks/useMessages';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import MessageBubble from './MessageBubble';
import CryptoSendDialog from './CryptoSendDialog';
import ImagePreviewDialog from './ImagePreviewDialog';
import ImageLightbox, { LightboxImage } from './ImageLightbox';
import { toast } from 'sonner';
import { 
  Phone, 
  Video, 
  MoreVertical, 
  Send, 
  Smile, 
  Paperclip,
  Coins,
  Loader2,
  ArrowLeft
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatWindowProps {
  conversation: Conversation;
  onVideoCall: () => void;
  onVoiceCall: () => void;
  onBack?: () => void;
}

export default function ChatWindow({ conversation, onVideoCall, onVoiceCall, onBack }: ChatWindowProps) {
  const { profile } = useAuth();
  const { messages, loading, sendMessage, sendCryptoMessage, sendImageMessage } = useMessages(conversation.id);
  const [newMessage, setNewMessage] = useState('');
  const [showCryptoDialog, setShowCryptoDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;

    const content = newMessage;
    setNewMessage('');
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    
    await sendMessage(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Shift+Enter sẽ tự động xuống dòng
  };

  const handleSendCrypto = async (amount: number, currency: string) => {
    if (!otherMember) return;
    await sendCryptoMessage(otherMember.user_id, amount, currency);
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
              <DropdownMenuItem>Xem hồ sơ</DropdownMenuItem>
              <DropdownMenuItem>Tắt thông báo</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">Xóa cuộc trò chuyện</DropdownMenuItem>
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
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <div className="w-20 h-20 rounded-2xl gradient-primary/20 flex items-center justify-center mb-4">
              <Send className="w-10 h-10 text-primary" />
            </div>
            <p className="font-medium">Bắt đầu cuộc trò chuyện</p>
            <p className="text-sm">Gửi tin nhắn đầu tiên cho {chatName}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((message) => (
              <MessageBubble 
                key={message.id} 
                message={message} 
                onImageClick={handleImageClick}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t bg-card/50 backdrop-blur-sm">
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
              className="rounded-xl text-muted-foreground hover:text-fun-yellow"
              style={{ '--fun-yellow': 'var(--fun-yellow)' } as React.CSSProperties}
              onClick={() => setShowCryptoDialog(true)}
            >
              <Coins className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              placeholder="Nhập tin nhắn..."
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                adjustTextareaHeight();
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              className="min-h-[44px] max-h-[120px] py-3 pr-12 resize-none rounded-xl bg-muted/50 border-0 focus-visible:ring-primary overflow-y-auto"
            />
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
      </div>

      {/* Crypto Dialog */}
      <CryptoSendDialog
        open={showCryptoDialog}
        onClose={() => setShowCryptoDialog(false)}
        onSend={handleSendCrypto}
        recipientName={chatName || ''}
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
    </div>
  );
}
