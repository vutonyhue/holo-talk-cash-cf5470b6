import { Bot, Sparkles } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AIChatPanelProps {
  onSuggestionClick?: (suggestion: string) => void;
}

const suggestions = [
  { emoji: '💡', text: 'Viết email chuyên nghiệp' },
  { emoji: '🔍', text: 'Giải thích về blockchain' },
  { emoji: '🌐', text: 'Dịch văn bản sang tiếng Anh' },
  { emoji: '✨', text: 'Tạo ý tưởng sáng tạo' },
  { emoji: '💻', text: 'Giúp tôi viết code' },
  { emoji: '📝', text: 'Tóm tắt nội dung dài' },
];

export default function AIChatPanel({ onSuggestionClick }: AIChatPanelProps) {
  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Header */}
      <div className="h-16 flex items-center px-4 border-b border-sidebar-border">
        <h2 className="font-semibold text-lg">Meta AI</h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* AI Profile Card */}
          <div className="bg-gradient-to-br from-violet-500/10 to-purple-600/10 rounded-xl p-4 border border-violet-500/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold">FunChat AI</h3>
                <p className="text-sm text-muted-foreground">Trợ lý thông minh</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Xin chào! Mình là FunChat AI, trợ lý thông minh được tích hợp sẵn. 
              Mình có thể giúp bạn trả lời câu hỏi, viết nội dung, dịch thuật và nhiều việc khác! 🤖✨
            </p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-2 py-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Gợi ý
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Suggestions */}
          <div className="space-y-2">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => onSuggestionClick?.(suggestion.text)}
                className="w-full text-left px-4 py-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
              >
                <span className="mr-2">{suggestion.emoji}</span>
                <span className="text-sm">{suggestion.text}</span>
              </button>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
