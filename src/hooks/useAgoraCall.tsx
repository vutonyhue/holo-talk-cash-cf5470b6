import { useState, useEffect, useCallback, useRef } from 'react';
import AgoraRTC, {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';
import { supabase } from '@/integrations/supabase/client';

interface UseAgoraCallProps {
  channelName: string;
  uid?: number;
  enabled: boolean;
  isVideoCall: boolean;
}

interface AgoraCallState {
  localVideoTrack: ICameraVideoTrack | null;
  localAudioTrack: IMicrophoneAudioTrack | null;
  remoteUsers: IAgoraRTCRemoteUser[];
  isJoined: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  isConnecting: boolean;
  error: string | null;
}

export const useAgoraCall = ({ channelName, uid, enabled, isVideoCall }: UseAgoraCallProps) => {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const joinInProgressRef = useRef(false);
  const hasJoinedRef = useRef(false);
  const eventListenersSetRef = useRef(false);
  
  const [state, setState] = useState<AgoraCallState>({
    localVideoTrack: null,
    localAudioTrack: null,
    remoteUsers: [],
    isJoined: false,
    isMuted: false,
    isVideoOff: false,
    isConnecting: false,
    error: null,
  });

  const localVideoRef = useRef<HTMLDivElement | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);

  // Initialize Agora client
  useEffect(() => {
    if (!clientRef.current) {
      clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      console.log('Agora client created');
    }
    
    return () => {
      // Cleanup on unmount
      if (clientRef.current) {
        clientRef.current.removeAllListeners();
      }
    };
  }, []);

  // Set up event listeners once
  const setupEventListeners = useCallback(() => {
    if (!clientRef.current || eventListenersSetRef.current) return;
    
    eventListenersSetRef.current = true;
    
    clientRef.current.on('user-published', async (user, mediaType) => {
      console.log('User published:', user.uid, mediaType);
      try {
        await clientRef.current!.subscribe(user, mediaType);
        
        if (mediaType === 'video') {
          setState(prev => ({
            ...prev,
            remoteUsers: [...prev.remoteUsers.filter(u => u.uid !== user.uid), user],
          }));
        }
        
        if (mediaType === 'audio') {
          user.audioTrack?.play();
        }
      } catch (err) {
        console.error('Error subscribing to user:', err);
      }
    });

    clientRef.current.on('user-unpublished', (user, mediaType) => {
      console.log('User unpublished:', user.uid, mediaType);
      if (mediaType === 'video') {
        setState(prev => ({
          ...prev,
          remoteUsers: prev.remoteUsers.filter(u => u.uid !== user.uid),
        }));
      }
    });

    clientRef.current.on('user-left', (user) => {
      console.log('User left:', user.uid);
      setState(prev => ({
        ...prev,
        remoteUsers: prev.remoteUsers.filter(u => u.uid !== user.uid),
      }));
    });

    clientRef.current.on('connection-state-change', (curState, prevState) => {
      console.log('Connection state changed:', prevState, '->', curState);
    });

    clientRef.current.on('exception', (event) => {
      console.error('Agora exception:', event);
    });
  }, []);

  // Fetch token from edge function
  const fetchToken = useCallback(async () => {
    try {
      console.log('Fetching Agora token for channel:', channelName);
      
      // Use uid = 0 to let Agora server assign a unique ID
      const { data, error } = await supabase.functions.invoke('agora-token', {
        body: { channelName, uid: 0, role: 1 },
      });

      if (error) {
        console.error('Error fetching token:', error);
        throw new Error(error.message || 'Không thể lấy token từ server');
      }

      if (data.error) {
        console.error('Token API error:', data.error);
        throw new Error(data.error);
      }

      console.log('Token fetched:', {
        appIdPrefix: data.appId?.substring(0, 8),
        tokenPrefix: data.token?.substring(0, 10),
        uid: data.uid,
      });
      return data;
    } catch (error) {
      console.error('Failed to fetch Agora token:', error);
      throw error;
    }
  }, [channelName]);

  // Join channel
  const joinChannel = useCallback(async () => {
    // Prevent multiple join attempts
    if (!clientRef.current || !channelName) {
      console.log('Cannot join: missing client or channelName');
      return;
    }
    
    if (joinInProgressRef.current) {
      console.log('Join already in progress, skipping');
      return;
    }
    
    if (hasJoinedRef.current) {
      console.log('Already joined, skipping');
      return;
    }

    joinInProgressRef.current = true;
    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Set up event listeners before joining
      setupEventListeners();
      
      const { token, appId, uid: tokenUid } = await fetchToken();
      
      console.log('Joining channel:', channelName, 'appId:', appId?.substring(0, 8), 'uid:', tokenUid, 'tokenPrefix:', token?.substring(0, 10));
      
      // Join the channel with numeric UID (0 = auto-assign by Agora)
      await clientRef.current.join(appId, channelName, token, tokenUid || 0);
      console.log('Joined channel successfully');
      hasJoinedRef.current = true;

      // Create and publish local tracks
      const tracks: (ICameraVideoTrack | IMicrophoneAudioTrack)[] = [];
      
      try {
        // Always create audio track
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localAudioTrackRef.current = audioTrack;
        tracks.push(audioTrack);
        console.log('Audio track created');
      } catch (audioErr) {
        console.error('Failed to create audio track:', audioErr);
      }
      
      // Create video track only for video calls
      if (isVideoCall) {
        try {
          const videoTrack = await AgoraRTC.createCameraVideoTrack();
          localVideoTrackRef.current = videoTrack;
          tracks.push(videoTrack);
          console.log('Video track created');
        } catch (videoErr) {
          console.error('Failed to create video track:', videoErr);
        }
      }

      if (tracks.length > 0) {
        await clientRef.current.publish(tracks);
        console.log('Published local tracks:', tracks.length);
      }

      setState(prev => ({
        ...prev,
        localAudioTrack: localAudioTrackRef.current,
        localVideoTrack: localVideoTrackRef.current,
        isJoined: true,
        isConnecting: false,
      }));
    } catch (error: any) {
      console.error('Failed to join channel:', error);
      hasJoinedRef.current = false;
      
      let errorMessage = 'Không thể kết nối cuộc gọi';
      if (error.message?.includes('AGORA_APP_ID')) {
        errorMessage = error.message;
      } else if (error.code === 'INVALID_VENDOR_KEY' || error.message?.includes('vendor key')) {
        errorMessage = 'Agora App ID không hợp lệ. Vui lòng kiểm tra cấu hình.';
      } else if (error.code === 'INVALID_OPERATION') {
        errorMessage = 'Lỗi kết nối. Vui lòng thử lại.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: errorMessage,
      }));
    } finally {
      joinInProgressRef.current = false;
    }
  }, [channelName, fetchToken, isVideoCall, setupEventListeners]);

  // Leave channel
  const leaveChannel = useCallback(async () => {
    if (!clientRef.current) return;

    try {
      // Stop and close local tracks
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }

      if (localVideoTrackRef.current) {
        localVideoTrackRef.current.stop();
        localVideoTrackRef.current.close();
        localVideoTrackRef.current = null;
      }

      if (hasJoinedRef.current) {
        await clientRef.current.leave();
        console.log('Left channel');
      }

      hasJoinedRef.current = false;
      joinInProgressRef.current = false;
      eventListenersSetRef.current = false;
      
      // Remove all listeners
      clientRef.current.removeAllListeners();

      setState({
        localVideoTrack: null,
        localAudioTrack: null,
        remoteUsers: [],
        isJoined: false,
        isMuted: false,
        isVideoOff: false,
        isConnecting: false,
        error: null,
      });
    } catch (error) {
      console.error('Failed to leave channel:', error);
    }
  }, []);

  // Retry connection
  const retryConnection = useCallback(async () => {
    hasJoinedRef.current = false;
    joinInProgressRef.current = false;
    await joinChannel();
  }, [joinChannel]);

  // Toggle mute
  const toggleMute = useCallback(async () => {
    if (localAudioTrackRef.current) {
      const newMutedState = !state.isMuted;
      await localAudioTrackRef.current.setEnabled(!newMutedState);
      setState(prev => ({ ...prev, isMuted: newMutedState }));
      console.log('Mute toggled:', newMutedState);
    }
  }, [state.isMuted]);

  // Toggle video
  const toggleVideo = useCallback(async () => {
    if (localVideoTrackRef.current) {
      const newVideoOffState = !state.isVideoOff;
      await localVideoTrackRef.current.setEnabled(!newVideoOffState);
      setState(prev => ({ ...prev, isVideoOff: newVideoOffState }));
      console.log('Video toggled:', newVideoOffState);
    }
  }, [state.isVideoOff]);

  // Auto join when enabled
  useEffect(() => {
    if (enabled && channelName && !hasJoinedRef.current && !joinInProgressRef.current) {
      joinChannel();
    }
  }, [enabled, channelName, joinChannel]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveChannel();
    };
  }, []);

  // Play local video
  const setLocalVideoContainer = useCallback((container: HTMLDivElement | null) => {
    localVideoRef.current = container;
    if (container && localVideoTrackRef.current) {
      localVideoTrackRef.current.play(container);
    }
  }, []);

  return {
    ...state,
    joinChannel,
    leaveChannel,
    retryConnection,
    toggleMute,
    toggleVideo,
    setLocalVideoContainer,
  };
};
