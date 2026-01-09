import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Trash2, Sparkles, MoreVertical, ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import AIMessageBubble from './AIMessageBubble';
import { useAIChat } from '@/hooks/useAIChat';
import { cn } from '@/lib/utils';

interface AIChatWindowProps {
  onSuggestion?: string | null;
  onSuggestionUsed?: () => void;
}

export default function AIChatWindow({ onSuggestion, onSuggestionUsed }: AIChatWindowProps) {
  const { 
    messages, 
    isLoading, 
    isGeneratingImage, 
    editingImageUrl,
    sendMessage, 
    clearHistory,
    startEditingImage,
    cancelEditingImage
  } = useAIChat();
  const [input, setInput] = useState('');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle suggestion from panel
  useEffect(() => {
    if (onSuggestion) {
      setInput(onSuggestion);
      textareaRef.current?.focus();
      onSuggestionUsed?.();
    }
  }, [onSuggestion, onSuggestionUsed]);

  // Focus input when editing mode starts
  useEffect(() => {
    if (editingImageUrl) {
      textareaRef.current?.focus();
    }
  }, [editingImageUrl]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || isGeneratingImage) return;
    const message = input;
    setInput('');
    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape' && editingImageUrl) {
      cancelEditingImage();
    }
  };

  return (
    <div className="flex flex-col h-full gradient-chat">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold">FunChat AI</h2>
            <p className="text-xs text-muted-foreground">Luôn sẵn sàng hỗ trợ bạn</p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <MoreVertical className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => setShowClearDialog(true)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Xóa lịch sử chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-float animate-float mb-6">
              <Bot className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-xl font-bold mb-2">Xin chào! 👋</h3>
            <p className="text-muted-foreground max-w-sm mb-6">
              Mình là FunChat AI. Hãy hỏi mình bất cứ điều gì - từ câu hỏi đơn giản đến những vấn đề phức tạp!
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {['💬 Chat', '🔍 Tìm kiếm', '✍️ Viết', '🌐 Dịch', '🎨 Tạo ảnh'].map((tag) => (
                <span key={tag} className="px-3 py-1.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 text-sm">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <AIMessageBubble 
                key={message.id} 
                message={message} 
                onEditImage={startEditingImage}
              />
            ))}
            {isLoading && (
              <div className="flex gap-3 max-w-[85%]">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-md px-4 py-3">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            {isGeneratingImage && (
              <div className="flex gap-3 max-w-[85%]">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-md px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ImagePlus className="w-4 h-4 text-violet-500 animate-pulse" />
                    <span className="text-sm text-muted-foreground">
                      {editingImageUrl ? 'Đang chỉnh sửa hình ảnh...' : 'Đang tạo hình ảnh...'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-border bg-background/80 backdrop-blur-sm">
        {/* Edit mode indicator */}
        {editingImageUrl && (
          <div className="mb-3 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center gap-3">
            <img 
              src={editingImageUrl} 
              alt="Editing" 
              className="w-12 h-12 rounded-lg object-cover"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-violet-600 dark:text-violet-400">
                Chế độ chỉnh sửa hình ảnh
              </p>
              <p className="text-xs text-muted-foreground">
                Nhập mô tả những thay đổi bạn muốn
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-8 w-8"
              onClick={cancelEditingImage}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={editingImageUrl ? "Mô tả chỉnh sửa (VD: thêm mũ, đổi màu nền...)" : "Nhập tin nhắn cho AI..."}
              className="min-h-[44px] max-h-32 resize-none pr-12 rounded-2xl"
              rows={1}
              disabled={isLoading || isGeneratingImage}
            />
            <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-violet-500 opacity-50" />
          </div>
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || isGeneratingImage}
            size="icon"
            className={cn(
              "rounded-full h-11 w-11 flex-shrink-0",
              "bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
            )}
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          💡 Gợi ý: Dùng "tạo hình" hoặc "vẽ" để AI tạo hình ảnh
        </p>
      </div>

      {/* Clear History Dialog */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa lịch sử chat?</AlertDialogTitle>
            <AlertDialogDescription>
              Tất cả tin nhắn với AI sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearHistory();
                setShowClearDialog(false);
              }}
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
