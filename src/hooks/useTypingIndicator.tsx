import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface TypingUser {
  id: string;
  name: string;
}

export function useTypingIndicator(conversationId: string | null) {
  const { profile } = useAuth();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingRef = useRef<number>(0);

  // Broadcast typing status
  const broadcastTyping = useCallback(async () => {
    if (!conversationId || !profile) return;

    const now = Date.now();
    // Throttle: only send every 2 seconds
    if (now - lastTypingRef.current < 2000) return;
    lastTypingRef.current = now;

    const channel = supabase.channel(`typing:${conversationId}`);
    
    await channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        user_id: profile.id,
        user_name: profile.display_name || profile.username,
        timestamp: now,
      },
    });
  }, [conversationId, profile]);

  // Stop typing (clear from others' view)
  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []);

  // Listen for typing events from others
  useEffect(() => {
    if (!conversationId || !profile) return;

    const channel = supabase
      .channel(`typing:${conversationId}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { user_id, user_name, timestamp } = payload.payload;
        
        // Ignore own typing
        if (user_id === profile.id) return;

        // Add/update typing user
        setTypingUsers((prev) => {
          const existing = prev.find((u) => u.id === user_id);
          if (existing) return prev;
          return [...prev, { id: user_id, name: user_name }];
        });

        // Remove after 3 seconds of no updates
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u.id !== user_id));
        }, 3000);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, profile]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [stopTyping]);

  return {
    typingUsers,
    broadcastTyping,
    stopTyping,
  };
}
