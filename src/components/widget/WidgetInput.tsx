/**
 * Widget Input Component
 * Message input for embedded widget
 */

import { useState, useRef, useEffect } from 'react';
import { Send, Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WidgetInputProps {
  onSend: (content: string) => Promise<boolean>;
  disabled?: boolean;
  placeholder?: string;
}

const QUICK_EMOJIS = ['👍', '❤️', '😊', '😂', '🎉', '👋'];

export function WidgetInput({
  onSend,
  disabled = false,
  placeholder = 'Nhập tin nhắn...',
}: WidgetInputProps) {
  const [message, setMessage] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    if (!message.trim() || disabled || isSending) return;

    setIsSending(true);
    const success = await onSend(message);
    if (success) {
      setMessage('');
    }
    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addEmoji = (emoji: string) => {
    setMessage(prev => prev + emoji);
    setShowEmoji(false);
    textareaRef.current?.focus();
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
    }
  }, [message]);

  return (
    <div className="border-t bg-background p-3 shrink-0">
      {/* Quick emoji panel */}
      {showEmoji && (
        <div className="flex gap-1 mb-2 pb-2 border-b">
          {QUICK_EMOJIS.map(emoji => (
            <button
              key={emoji}
              onClick={() => addEmoji(emoji)}
              className="text-lg hover:bg-muted p-1 rounded transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => setShowEmoji(!showEmoji)}
        >
          <Smile className={cn('h-5 w-5', showEmoji && 'text-primary')} />
        </Button>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              'w-full resize-none rounded-2xl border bg-muted/50 px-4 py-2.5',
              'text-sm placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-primary/50',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'max-h-[100px] overflow-y-auto'
            )}
          />
        </div>

        <Button
          type="button"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full"
          onClick={handleSend}
          disabled={!message.trim() || disabled || isSending}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {disabled && (
        <p className="text-xs text-muted-foreground text-center mt-2">
          Bạn không có quyền gửi tin nhắn
        </p>
      )}
    </div>
  );
}
