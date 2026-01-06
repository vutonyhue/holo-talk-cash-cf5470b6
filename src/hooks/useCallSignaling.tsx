import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface CallSession {
  id: string;
  caller_id: string;
  conversation_id: string;
  call_type: 'video' | 'voice';
  status: 'ringing' | 'accepted' | 'rejected' | 'ended' | 'missed';
  channel_name: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  caller_profile?: {
    display_name: string | null;
    avatar_url: string | null;
    username: string;
  };
}

interface UseCallSignalingProps {
  conversationId?: string;
}

export const useCallSignaling = ({ conversationId }: UseCallSignalingProps = {}) => {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Subscribe to call sessions for all user's conversations
  useEffect(() => {
    if (!user) return;

    console.log('Setting up call signaling subscription');

    const channel = supabase
      .channel('call-signaling')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_sessions',
        },
        async (payload) => {
          const newCall = payload.new as CallSession;
          console.log('New call received:', newCall);

          // Don't show incoming call for caller
          if (newCall.caller_id === user.id) {
            setActiveCall(newCall);
            return;
          }

          // Fetch caller profile
          const { data: callerProfile } = await supabase
            .from('profiles')
            .select('display_name, avatar_url, username')
            .eq('id', newCall.caller_id)
            .single();

          setIncomingCall({
            ...newCall,
            caller_profile: callerProfile || undefined,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_sessions',
        },
        (payload) => {
          const updatedCall = payload.new as CallSession;
          console.log('Call updated:', updatedCall);

          // Handle call status changes
          if (updatedCall.status === 'accepted') {
            setActiveCall(updatedCall);
            setIncomingCall(null);
          } else if (['rejected', 'ended', 'missed'].includes(updatedCall.status)) {
            setActiveCall(null);
            setIncomingCall(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Start a new call
  const startCall = useCallback(async (targetConversationId: string, callType: 'video' | 'voice') => {
    if (!user) return null;

    setIsLoading(true);
    try {
      const channelName = `call_${targetConversationId}_${Date.now()}`;

      const { data, error } = await supabase
        .from('call_sessions')
        .insert({
          caller_id: user.id,
          conversation_id: targetConversationId,
          call_type: callType,
          status: 'ringing',
          channel_name: channelName,
        })
        .select()
        .single();

      if (error) {
        console.error('Error starting call:', error);
        throw error;
      }

      console.log('Call started:', data);
      const callData = data as CallSession;
      setActiveCall(callData);
      return callData;
    } catch (error) {
      console.error('Failed to start call:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Accept incoming call
  const acceptCall = useCallback(async (callId: string) => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('call_sessions')
        .update({
          status: 'accepted',
          started_at: new Date().toISOString(),
        })
        .eq('id', callId)
        .select()
        .single();

      if (error) {
        console.error('Error accepting call:', error);
        throw error;
      }

      console.log('Call accepted:', data);
      setActiveCall(data as CallSession);
      setIncomingCall(null);
    } catch (error) {
      console.error('Failed to accept call:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Reject incoming call
  const rejectCall = useCallback(async (callId: string) => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('call_sessions')
        .update({
          status: 'rejected',
          ended_at: new Date().toISOString(),
        })
        .eq('id', callId);

      if (error) {
        console.error('Error rejecting call:', error);
        throw error;
      }

      console.log('Call rejected');
      setIncomingCall(null);
    } catch (error) {
      console.error('Failed to reject call:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // End active call
  const endCall = useCallback(async () => {
    if (!user || !activeCall) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('call_sessions')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
        })
        .eq('id', activeCall.id);

      if (error) {
        console.error('Error ending call:', error);
        throw error;
      }

      console.log('Call ended');
      setActiveCall(null);
    } catch (error) {
      console.error('Failed to end call:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, activeCall]);

  return {
    incomingCall,
    activeCall,
    isLoading,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
  };
};
