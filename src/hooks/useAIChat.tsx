import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const STORAGE_KEY = 'funchat-ai-history';
const AI_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

export function useAIChat() {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setMessages(parsed.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        })));
      }
    } catch (e) {
      console.error('Failed to load AI chat history:', e);
    }
  }, []);

  // Save to localStorage when messages change
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      } catch (e) {
        console.error('Failed to save AI chat history:', e);
      }
    }
  }, [messages]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: AIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    let assistantContent = '';
    const assistantId = crypto.randomUUID();

    // Add empty assistant message that we'll update
    const addOrUpdateAssistant = (chunk: string) => {
      assistantContent += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.id === assistantId) {
          return prev.map((m, i) => 
            i === prev.length - 1 ? { ...m, content: assistantContent } : m
          );
        }
        return [...prev, {
          id: assistantId,
          role: 'assistant' as const,
          content: assistantContent,
          timestamp: new Date(),
        }];
      });
    };

    try {
      const messagesForAPI = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content
      }));

      const resp = await fetch(AI_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: messagesForAPI }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.error || 'Lỗi kết nối AI');
      }

      if (!resp.body) {
        throw new Error('No response body');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const deltaContent = parsed.choices?.[0]?.delta?.content;
            if (deltaContent) {
              addOrUpdateAssistant(deltaContent);
            }
          } catch {
            // Incomplete JSON, put it back
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Handle any remaining buffer
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const deltaContent = parsed.choices?.[0]?.delta?.content;
            if (deltaContent) addOrUpdateAssistant(deltaContent);
          } catch { /* ignore */ }
        }
      }

    } catch (error) {
      console.error('AI chat error:', error);
      toast({
        title: 'Lỗi',
        description: error instanceof Error ? error.message : 'Không thể kết nối với AI',
        variant: 'destructive',
      });
      // Remove the user message if there was an error
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, toast]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
    toast({
      title: 'Đã xóa',
      description: 'Lịch sử chat AI đã được xóa',
    });
  }, [toast]);

  return { messages, isLoading, sendMessage, clearHistory };
}
