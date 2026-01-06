import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

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

// Helper format thời lượng cuộc gọi
const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs} giây`;
  return `${mins} phút ${secs} giây`;
};

export const useCallSignaling = ({ conversationId }: UseCallSignalingProps = {}) => {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Track which calls have already had messages sent to avoid duplicates
  const sentMessagesRef = useRef<Set<string>>(new Set());

  // Hàm gửi tin nhắn thông báo cuộc gọi
  const sendCallMessage = async (
    convId: string,
    callType: 'video' | 'voice',
    status: 'rejected' | 'ended' | 'missed',
    duration?: number,
    callId?: string
  ) => {
    // Prevent duplicate messages for the same call event
    const messageKey = `${callId}-${status}`;
    if (callId && sentMessagesRef.current.has(messageKey)) {
      return;
    }
    if (callId) {
      sentMessagesRef.current.add(messageKey);
    }

    const statusMessages = {
      rejected: callType === 'video' ? 'Cuộc gọi video bị từ chối' : 'Cuộc gọi thoại bị từ chối',
      ended: callType === 'video' 
        ? `Cuộc gọi video đã kết thúc${duration ? ` (${formatDuration(duration)})` : ''}`
        : `Cuộc gọi thoại đã kết thúc${duration ? ` (${formatDuration(duration)})` : ''}`,
      missed: callType === 'video' ? 'Cuộc gọi video nhỡ' : 'Cuộc gọi thoại nhỡ',
    };

    await supabase.from('messages').insert({
      conversation_id: convId,
      sender_id: user?.id,
      content: statusMessages[status],
      message_type: 'call',
      metadata: {
        call_type: callType,
        call_status: status,
        duration: duration || null,
      },
    });
  };

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
          } else if (updatedCall.status === 'rejected') {
            // Show toast for rejected call (only for caller)
            if (activeCall?.id === updatedCall.id) {
              toast({
                title: "Cuộc gọi bị từ chối",
                description: "Người nhận đã từ chối cuộc gọi của bạn",
                variant: "destructive",
              });
              // Send call message (only caller sends to avoid duplicates)
              sendCallMessage(
                updatedCall.conversation_id,
                updatedCall.call_type as 'video' | 'voice',
                'rejected',
                undefined,
                updatedCall.id
              );
            }
            setActiveCall(null);
            setIncomingCall(null);
          } else if (updatedCall.status === 'ended') {
            // Calculate duration
            let duration = 0;
            if (updatedCall.started_at && updatedCall.ended_at) {
              duration = Math.floor(
                (new Date(updatedCall.ended_at).getTime() - new Date(updatedCall.started_at).getTime()) / 1000
              );
            }
            
            // Show toast for ended call
            if (activeCall?.id === updatedCall.id || incomingCall?.id === updatedCall.id) {
              toast({
                title: "Cuộc gọi đã kết thúc",
                description: "Cuộc gọi đã được kết thúc",
              });
              // Send call message (only the person who sees this update sends)
              if (activeCall?.id === updatedCall.id) {
                sendCallMessage(
                  updatedCall.conversation_id,
                  updatedCall.call_type as 'video' | 'voice',
                  'ended',
                  duration,
                  updatedCall.id
                );
              }
            }
            setActiveCall(null);
            setIncomingCall(null);
          } else if (updatedCall.status === 'missed') {
            toast({
              title: "Cuộc gọi nhỡ",
              description: "Bạn có một cuộc gọi nhỡ",
              variant: "destructive",
            });
            // Send missed call message
            sendCallMessage(
              updatedCall.conversation_id,
              updatedCall.call_type as 'video' | 'voice',
              'missed',
              undefined,
              updatedCall.id
            );
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
      toast({
        title: "Đã từ chối cuộc gọi",
        description: "Bạn đã từ chối cuộc gọi đến",
      });
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
