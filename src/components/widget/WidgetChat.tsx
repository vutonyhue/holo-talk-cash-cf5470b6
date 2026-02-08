/**
 * Widget Chat Component
 * Main chat UI for embedded widget
 */

import { useEffect, useState } from 'react';
import { useWidgetAuth } from '@/hooks/useWidgetAuth';
import { useWidgetMessages } from '@/hooks/useWidgetMessages';
import { WidgetHeader } from './WidgetHeader';
import { WidgetMessages } from './WidgetMessages';
import { WidgetInput } from './WidgetInput';
import { Loader2, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '@/config/workerUrls';

interface WidgetChatProps {
  token: string;
  theme?: 'light' | 'dark' | 'auto';
}

interface ConversationInfo {
  id: string;
  name: string | null;
  avatar_url: string | null;
  is_group: boolean | null;
}

export function WidgetChat({ token, theme = 'auto' }: WidgetChatProps) {
  const auth = useWidgetAuth(token);
  const [conversation, setConversation] = useState<ConversationInfo | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);

  const canWrite = auth.hasScope('chat:write');
  
  const {
    messages,
    isLoading: messagesLoading,
    error: messagesError,
    sendMessage,
    loadMore,
    hasMore,
    unreadCount,
  } = useWidgetMessages({
    conversationId: auth.conversationId,
    userId: auth.userId,
    canWrite,
    widgetToken: token,
  });

  // Apply theme
  useEffect(() => {
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
    } else {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

  // Fetch conversation info
  useEffect(() => {
    if (!auth.conversationId) return;

    const fetchConversation = async () => {
      setConversationLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/v1/conversations/${auth.conversationId}`, {
          headers: { 'x-funchat-widget-token': token },
        });
        const json = (await res.json().catch(() => null)) as any;
        if (res.ok && json?.ok === true && json.data) {
          setConversation(json.data as ConversationInfo);
        } else {
          setConversation(null);
        }
      } catch {
        setConversation(null);
      }
      setConversationLoading(false);
    };

    fetchConversation();
  }, [auth.conversationId, token]);

  // Notify parent of ready state
  useEffect(() => {
    if (auth.isValid) {
      window.parent.postMessage({ type: 'funchat:ready' }, '*');
    }
  }, [auth.isValid]);

  // Notify parent of unread count
  useEffect(() => {
    window.parent.postMessage({ type: 'funchat:unreadCount', count: unreadCount }, '*');
  }, [unreadCount]);

  // Listen for parent messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type } = event.data || {};
      
      switch (type) {
        case 'widget:setTheme':
          const newTheme = event.data.theme;
          document.documentElement.classList.toggle('dark', newTheme === 'dark');
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Loading state
  if (auth.isLoading || conversationLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground mt-2">Đang tải...</p>
      </div>
    );
  }

  // Error state
  if (auth.error || !auth.isValid) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background p-4 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-3" />
        <h3 className="font-semibold text-foreground mb-1">Không thể tải chat</h3>
        <p className="text-sm text-muted-foreground">
          {auth.error || 'Token không hợp lệ hoặc đã hết hạn'}
        </p>
      </div>
    );
  }

  const title = conversation?.name || 'Chat';
  const subtitle = conversation?.is_group ? 'Nhóm chat' : undefined;

  return (
    <div className="flex flex-col h-full bg-background">
      <WidgetHeader
        title={title}
        subtitle={subtitle}
        avatarUrl={conversation?.avatar_url}
        showClose={true}
        showMinimize={false}
      />
      
      <WidgetMessages
        messages={messages}
        currentUserId={auth.userId}
        isLoading={messagesLoading}
        onLoadMore={loadMore}
        hasMore={hasMore}
      />
      
      <WidgetInput
        onSend={sendMessage}
        disabled={!canWrite}
        placeholder={canWrite ? 'Nhập tin nhắn...' : 'Chỉ đọc'}
      />

      {messagesError && (
        <div className="absolute bottom-16 left-4 right-4 bg-destructive/10 text-destructive text-sm p-2 rounded">
          {messagesError}
        </div>
      )}
    </div>
  );
}
