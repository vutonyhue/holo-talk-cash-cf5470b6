import { useState, useEffect, useCallback, useRef } from 'react';
import AgoraRTC, {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';
import { supabase } from '@/integrations/supabase/client';

// Cloudflare Worker URL for Agora token generation
const AGORA_TOKEN_WORKER_URL = 'https://agora-token-worker-v2.hieu-le-010.workers.dev';

// Generate stable numeric UID from user ID string
const generateUidFromUserId = (userId: string): number => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % 1000000000; // Agora UID range: 0 to 10^9
};

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

  // Create new Agora client for each call session
  useEffect(() => {
    if (enabled && channelName) {
      // Cleanup old client if exists
      if (clientRef.current) {
        console.log('Cleaning up old Agora client before creating new one');
        clientRef.current.removeAllListeners();
        clientRef.current = null;
      }
      
      // Reset all refs for new session
      hasJoinedRef.current = false;
      joinInProgressRef.current = false;
      eventListenersSetRef.current = false;
      
      // Create new client
      clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      console.log('New Agora client created for channel:', channelName);
    }
    
    return () => {
      if (clientRef.current) {
        clientRef.current.removeAllListeners();
        clientRef.current = null;
      }
    };
  }, [enabled, channelName]);

  // Set up event listeners - always reset before adding new ones
  const setupEventListeners = useCallback(() => {
    if (!clientRef.current) return;
    
    // Always remove old listeners to ensure clean state
    clientRef.current.removeAllListeners();
    eventListenersSetRef.current = true;
    
    clientRef.current.on('user-published', async (user, mediaType) => {
      console.log('User published:', user.uid, mediaType, 'hasAudio:', user.hasAudio, 'hasVideo:', user.hasVideo);
      try {
        await clientRef.current!.subscribe(user, mediaType);
        console.log('Subscribed to user:', user.uid, mediaType);
        
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

    clientRef.current.on('user-joined', (user) => {
      console.log('User joined channel:', user.uid);
    });

    clientRef.current.on('connection-state-change', (curState, prevState) => {
      console.log('Connection state changed:', prevState, '->', curState);
    });

    clientRef.current.on('exception', (event) => {
      console.error('Agora exception:', event);
    });
  }, []);

  // Fetch token from Cloudflare Worker with retry logic
  const fetchToken = useCallback(async (retries = 3): Promise<{ token: string; appId: string; uid: number }> => {
    let lastError: Error | null = null;
    
    // Get user ID to generate stable UID
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token || !session?.user?.id) {
      throw new Error('Bạn cần đăng nhập để thực hiện cuộc gọi');
    }
    
    // Generate stable UID from user ID
    const stableUid = generateUidFromUserId(session.user.id);
    console.log('Generated stable UID:', stableUid, 'from user ID:', session.user.id);
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        console.log(`Fetching Agora token for channel: ${channelName}, uid: ${stableUid} (attempt ${attempt + 1}/${retries})`);

        // Call Cloudflare Worker with stable UID
        const response = await fetch(AGORA_TOKEN_WORKER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ channelName, uid: stableUid, role: 1 }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          
          if (response.status === 401) {
            throw new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
          }
          if (response.status === 429) {
            throw new Error('Quá nhiều yêu cầu. Vui lòng thử lại sau.');
          }
          
          throw new Error(errorData.error || 'Không thể lấy token từ server');
        }

        const data = await response.json();

        console.log('Token fetched:', {
          appIdPrefix: data.appId?.substring(0, 8),
          tokenPrefix: data.token?.substring(0, 10),
          uid: data.uid,
        });
        
        // Return with stable UID
        return { ...data, uid: stableUid };
      } catch (error: any) {
        console.error(`Token fetch attempt ${attempt + 1} failed:`, error);
        lastError = error;
        
        // Don't retry for auth errors
        if (error.message?.includes('đăng nhập')) {
          throw error;
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < retries - 1) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    
    throw lastError || new Error('Không thể lấy token sau nhiều lần thử');
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

    // Check connection state and cleanup if needed
    const connectionState = clientRef.current.connectionState;
    if (connectionState === 'CONNECTED' || connectionState === 'CONNECTING') {
      console.log('Client still connected, cleaning up first:', connectionState);
      // Inline cleanup to avoid circular dependency
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
      try {
        await clientRef.current.leave();
      } catch (e) {
        console.log('Cleanup leave error (ignored):', e);
      }
      hasJoinedRef.current = false;
      eventListenersSetRef.current = false;
      clientRef.current.removeAllListeners();
      await new Promise(r => setTimeout(r, 500)); // Wait for cleanup
    }

    joinInProgressRef.current = true;
    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Set up event listeners before joining
      setupEventListeners();
      
      const { token, appId, uid: tokenUid } = await fetchToken();
      
      console.log('Joining channel:', channelName, 'appId:', appId?.substring(0, 8), 'uid:', tokenUid, 'tokenPrefix:', token?.substring(0, 10));
      
      // Join the channel with stable UID
      await clientRef.current.join(appId, channelName, token, tokenUid);
      console.log('Joined channel successfully with UID:', tokenUid);
      hasJoinedRef.current = true;

      // Subscribe to existing remote users already in the channel
      const existingUsers = clientRef.current.remoteUsers;
      console.log('Existing remote users in channel:', existingUsers.length);
      for (const user of existingUsers) {
        console.log('Found existing user:', user.uid, 'hasAudio:', user.hasAudio, 'hasVideo:', user.hasVideo);
        if (user.hasAudio) {
          await clientRef.current.subscribe(user, 'audio');
          user.audioTrack?.play();
          console.log('Subscribed to existing user audio:', user.uid);
        }
        if (user.hasVideo) {
          await clientRef.current.subscribe(user, 'video');
          setState(prev => ({
            ...prev,
            remoteUsers: [...prev.remoteUsers.filter(u => u.uid !== user.uid), user],
          }));
          console.log('Subscribed to existing user video:', user.uid);
        }
      }

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
      
      // Handle specific Agora error codes
      if (error.code === 'CAN_NOT_GET_GATEWAY_SERVER') {
        errorMessage = 'Không thể kết nối server Agora. Kiểm tra kết nối mạng.';
      } else if (error.code === 'UID_CONFLICT') {
        errorMessage = 'Xung đột user ID. Vui lòng thử lại.';
      } else if (error.code === 'INVALID_VENDOR_KEY' || error.message?.includes('vendor key')) {
        errorMessage = 'Agora App ID không hợp lệ. Vui lòng kiểm tra cấu hình.';
      } else if (error.code === 'INVALID_OPERATION') {
        errorMessage = 'Lỗi kết nối. Vui lòng thử lại.';
      } else if (error.code === 'OPERATION_ABORTED') {
        errorMessage = 'Kết nối bị hủy. Vui lòng thử lại.';
      } else if (error.message?.includes('AGORA_APP_ID')) {
        errorMessage = error.message;
      } else if (error.message?.includes('đăng nhập')) {
        errorMessage = error.message;
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

  // Leave channel with full cleanup
  const leaveChannel = useCallback(async () => {
    console.log('Leaving channel, current state:', {
      hasJoined: hasJoinedRef.current,
      isConnected: clientRef.current?.connectionState
    });

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

      // Leave channel if connected
      if (clientRef.current) {
        const connectionState = clientRef.current.connectionState;
        if (connectionState === 'CONNECTED' || connectionState === 'CONNECTING') {
          await clientRef.current.leave();
          console.log('Left channel successfully');
        }
        
        // Remove all listeners and destroy client
        clientRef.current.removeAllListeners();
        clientRef.current = null;
        console.log('Agora client destroyed');
      }

      // Reset all refs
      hasJoinedRef.current = false;
      joinInProgressRef.current = false;
      eventListenersSetRef.current = false;

      // Reset state
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
      
      console.log('Channel cleanup completed');
    } catch (error) {
      console.error('Failed to leave channel:', error);
      // Still reset state even on error
      hasJoinedRef.current = false;
      joinInProgressRef.current = false;
      clientRef.current = null;
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
