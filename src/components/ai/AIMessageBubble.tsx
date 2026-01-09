import { cn } from '@/lib/utils';
import { Bot, User, Download, Pencil } from 'lucide-react';
import { AIMessage } from '@/hooks/useAIChat';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface AIMessageBubbleProps {
  message: AIMessage;
  onEditImage?: (imageUrl: string) => void;
}

export default function AIMessageBubble({ message, onEditImage }: AIMessageBubbleProps) {
  const isUser = message.role === 'user';
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);

  const formatContent = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const code = part.slice(3, -3);
        const [lang, ...lines] = code.split('\n');
        const codeContent = lines.join('\n') || lang;
        
        return (
          <pre key={index} className="bg-muted/50 rounded-lg p-3 my-2 overflow-x-auto text-sm">
            <code>{codeContent}</code>
          </pre>
        );
      }
      
      return (
        <span key={index} className="whitespace-pre-wrap">
          {part.split('\n').map((line, lineIndex) => (
            <span key={lineIndex}>
              {lineIndex > 0 && <br />}
              {formatInline(line)}
            </span>
          ))}
        </span>
      );
    });
  };

  const formatInline = (text: string) => {
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm">$1</code>');
    
    return <span dangerouslySetInnerHTML={{ __html: text }} />;
  };

  const handleDownloadImage = () => {
    if (!message.imageUrl) return;
    
    const link = document.createElement('a');
    link.href = message.imageUrl;
    link.download = `funchat-ai-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className={cn(
        "flex gap-3 max-w-[85%]",
        isUser ? "ml-auto flex-row-reverse" : "mr-auto"
      )}>
        {/* Avatar */}
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
          isUser ? "gradient-primary" : "bg-gradient-to-br from-violet-500 to-purple-600"
        )}>
          {isUser ? (
            <User className="w-4 h-4 text-primary-foreground" />
          ) : (
            <Bot className="w-4 h-4 text-white" />
          )}
        </div>

        {/* Message content */}
        <div className={cn(
          "rounded-2xl px-4 py-2.5",
          isUser 
            ? "bg-primary text-primary-foreground rounded-tr-md" 
            : "bg-muted rounded-tl-md"
        )}>
          <div className={cn(
            "text-sm leading-relaxed",
            isUser ? "text-primary-foreground" : "text-foreground"
          )}>
            {formatContent(message.content)}
          </div>

          {/* Generated Image */}
          {message.imageUrl && (
            <div className="mt-3">
              <img 
                src={message.imageUrl}
                alt="AI generated"
                className="rounded-lg max-w-full max-h-80 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setImagePreviewOpen(true)}
              />
              {/* Edit button */}
              {onEditImage && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-violet-600 hover:text-violet-700 hover:bg-violet-100 dark:text-violet-400 dark:hover:bg-violet-900/30"
                  onClick={() => onEditImage(message.imageUrl!)}
                >
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Chỉnh sửa hình ảnh
                </Button>
              )}
            </div>
          )}

          <p className={cn(
            "text-[10px] mt-1",
            isUser ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {format(message.timestamp, 'HH:mm', { locale: vi })}
          </p>
        </div>
      </div>

      {/* Image Preview Dialog */}
      {message.imageUrl && (
        <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
          <DialogContent className="max-w-4xl p-2">
            <div className="relative">
              <img 
                src={message.imageUrl}
                alt="AI generated"
                className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
              />
              <div className="absolute bottom-4 right-4 flex gap-2">
                {onEditImage && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setImagePreviewOpen(false);
                      onEditImage(message.imageUrl!);
                    }}
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Chỉnh sửa
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDownloadImage}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Tải xuống
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
