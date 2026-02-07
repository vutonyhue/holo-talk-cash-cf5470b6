import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';
import { api } from '@/lib/api';

interface TypingUser {
  id: string;
  name: string;
}

export function useTypingIndicator(conversationId: string | null) {
  const { profile } = useAuth();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const lastTypingRef = useRef<number>(0);

  // Broadcast typing status via API Gateway
  const broadcastTyping = useCallback(async () => {
    if (!conversationId || !profile) return;

    const now = Date.now();
    // Throttle: only send every 2 seconds
    if (now - lastTypingRef.current < 2000) return;
    lastTypingRef.current = now;

    try {
      await api.conversations.sendTyping(
        conversationId, 
        profile.display_name || profile.username
      );
    } catch (error) {
      // Silent fail for typing - not critical
      console.debug('[useTypingIndicator] Failed to send typing:', error);
    }
  }, [conversationId, profile]);

  // Stop typing (no-op since typing expires automatically)
  const stopTyping = useCallback(() => {
    // Typing indicators auto-expire on the server after 3 seconds
    // No need to send explicit "stop typing" signal
  }, []);

  // Update typing users from SSE stream
  const updateTypingUsers = useCallback((users: TypingUser[]) => {
    setTypingUsers(prev => {
      // Filter out own user
      const filtered = users.filter(u => u.id !== profile?.id);
      
      // Only update if actually changed
      if (JSON.stringify(filtered) !== JSON.stringify(prev)) {
        return filtered;
      }
      return prev;
    });
  }, [profile?.id]);

  // Auto-clear typing users after 3 seconds of no updates
  useEffect(() => {
    if (typingUsers.length === 0) return;
    
    const timer = setTimeout(() => {
      setTypingUsers([]);
    }, 3000);
    
    return () => clearTimeout(timer);
  }, [typingUsers]);

  // Clear typing users when conversation changes
  useEffect(() => {
    setTypingUsers([]);
  }, [conversationId]);

  return {
    typingUsers,
    broadcastTyping,
    stopTyping,
    updateTypingUsers,
  };
}
