import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';
import { AIMessage } from '@/hooks/useAIChat';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface AIMessageBubbleProps {
  message: AIMessage;
}

export default function AIMessageBubble({ message }: AIMessageBubbleProps) {
  const isUser = message.role === 'user';

  // Simple markdown-like formatting
  const formatContent = (content: string) => {
    // Handle code blocks
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
      
      // Handle inline formatting
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
    // Bold
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm">$1</code>');
    
    return <span dangerouslySetInnerHTML={{ __html: text }} />;
  };

  return (
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
        <p className={cn(
          "text-[10px] mt-1",
          isUser ? "text-primary-foreground/70" : "text-muted-foreground"
        )}>
          {format(message.timestamp, 'HH:mm', { locale: vi })}
        </p>
      </div>
    </div>
  );
}
