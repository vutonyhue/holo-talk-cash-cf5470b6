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

// ============= AGORA LOGGING UTILITY =============
const agoraLog = {
  info: (context: string, message: string, data?: any) => {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    console.log(`[${timestamp}][Agora][${context}] ${message}`, data !== undefined ? data : '');
  },
  warn: (context: string, message: string, data?: any) => {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    console.warn(`[${timestamp}][Agora][${context}] ⚠️ ${message}`, data !== undefined ? data : '');
  },
  error: (context: string, message: string, data?: any) => {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    console.error(`[${timestamp}][Agora][${context}] ❌ ${message}`, data !== undefined ? data : '');
  },
  success: (context: string, message: string, data?: any) => {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    console.log(`[${timestamp}][Agora][${context}] ✅ ${message}`, data !== undefined ? data : '');
  },
  debug: (context: string, message: string, data?: any) => {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    console.debug(`[${timestamp}][Agora][${context}] 🔍 ${message}`, data !== undefined ? data : '');
  },
};

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
        agoraLog.info('Init', 'Cleaning up old client before creating new one', { channel: channelName });
        clientRef.current.removeAllListeners();
        clientRef.current = null;
      }
      
      // Reset all refs for new session
      hasJoinedRef.current = false;
      joinInProgressRef.current = false;
      eventListenersSetRef.current = false;
      
      // Create new client
      const sdkVersion = AgoraRTC.VERSION;
      clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      agoraLog.success('Init', 'New client created', { 
        channel: channelName, 
        sdkVersion,
        mode: 'rtc', 
        codec: 'vp8',
        isVideoCall 
      });
    }
    
    return () => {
      if (clientRef.current) {
        agoraLog.info('Init', 'Cleanup: removing client listeners');
        clientRef.current.removeAllListeners();
        clientRef.current = null;
      }
    };
  }, [enabled, channelName, isVideoCall]);

  // Set up event listeners - always reset before adding new ones
  const setupEventListeners = useCallback(() => {
    if (!clientRef.current) {
      agoraLog.warn('Events', 'Cannot setup listeners: no client');
      return;
    }
    
    // Always remove old listeners to ensure clean state
    clientRef.current.removeAllListeners();
    eventListenersSetRef.current = true;
    agoraLog.info('Events', 'Setting up event listeners');
    
    clientRef.current.on('user-published', async (user, mediaType) => {
      agoraLog.info('Events', 'User published', { uid: user.uid, mediaType, hasAudio: user.hasAudio, hasVideo: user.hasVideo });
      try {
        const subscribeStart = Date.now();
        await clientRef.current!.subscribe(user, mediaType);
        agoraLog.success('Events', 'Subscribed to user', { uid: user.uid, mediaType, time: `${Date.now() - subscribeStart}ms` });
        
        // Force state update after successful subscription
        setState(prev => {
          const existingIndex = prev.remoteUsers.findIndex(u => u.uid === user.uid);
          let newRemoteUsers: IAgoraRTCRemoteUser[];
          
          if (existingIndex >= 0) {
            newRemoteUsers = [...prev.remoteUsers];
            newRemoteUsers[existingIndex] = user;
          } else {
            newRemoteUsers = [...prev.remoteUsers, user];
          }
          
          agoraLog.debug('Events', 'Updated remoteUsers', { 
            count: newRemoteUsers.length, 
            users: newRemoteUsers.map(u => ({ uid: u.uid, hasVideo: !!u.videoTrack, hasAudio: !!u.audioTrack }))
          });
          return { ...prev, remoteUsers: newRemoteUsers };
        });
        
        if (mediaType === 'audio' && user.audioTrack) {
          agoraLog.info('Events', 'Auto-playing remote audio', { uid: user.uid });
          user.audioTrack.play();
        }
      } catch (err: any) {
        agoraLog.error('Events', 'Failed to subscribe', { uid: user.uid, mediaType, error: err?.message || err });
      }
    });

    clientRef.current.on('user-unpublished', (user, mediaType) => {
      agoraLog.info('Events', 'User unpublished', { uid: user.uid, mediaType });
      setState(prev => ({
        ...prev,
        remoteUsers: prev.remoteUsers.map(u => u.uid === user.uid ? user : u),
      }));
    });

    clientRef.current.on('user-left', (user, reason) => {
      agoraLog.info('Events', 'User left', { uid: user.uid, reason });
      setState(prev => ({
        ...prev,
        remoteUsers: prev.remoteUsers.filter(u => u.uid !== user.uid),
      }));
    });

    clientRef.current.on('user-joined', (user) => {
      agoraLog.info('Events', 'User joined channel', { uid: user.uid });
    });

    clientRef.current.on('connection-state-change', (curState, prevState, reason) => {
      agoraLog.info('Connection', 'State changed', { from: prevState, to: curState, reason });
    });

    clientRef.current.on('exception', (event) => {
      agoraLog.error('Exception', 'Agora exception occurred', { code: event.code, msg: event.msg, uid: event.uid });
    });

    // Network quality monitoring
    clientRef.current.on('network-quality', (stats) => {
      if (stats.uplinkNetworkQuality <= 2 || stats.downlinkNetworkQuality <= 2) {
        agoraLog.warn('Network', 'Poor network quality detected', {
          uplink: stats.uplinkNetworkQuality,
          downlink: stats.downlinkNetworkQuality
        });
      }
    });

    // Token expiry warnings
    clientRef.current.on('token-privilege-will-expire', () => {
      agoraLog.warn('Token', 'Token will expire soon - need to renew');
    });

    clientRef.current.on('token-privilege-did-expire', () => {
      agoraLog.error('Token', 'Token has expired - call will disconnect');
    });

    agoraLog.success('Events', 'All event listeners configured');
  }, []);

  // Fetch token from Cloudflare Worker with retry logic
  const fetchToken = useCallback(async (retries = 3): Promise<{ token: string; appId: string; uid: number }> => {
    let lastError: Error | null = null;
    const fetchStartTime = Date.now();
    
    agoraLog.info('Token', 'Starting token fetch', { endpoint: AGORA_TOKEN_WORKER_URL, channel: channelName, retries });
    
    // Get user ID to generate stable UID
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token || !session?.user?.id) {
      agoraLog.error('Token', 'No valid session found - user must login');
      throw new Error('Bạn cần đăng nhập để thực hiện cuộc gọi');
    }
    
    // Generate stable UID from user ID
    const stableUid = generateUidFromUserId(session.user.id);
    agoraLog.debug('Token', 'Generated stable UID', { uid: stableUid, userId: session.user.id.substring(0, 8) + '...' });
    
    for (let attempt = 0; attempt < retries; attempt++) {
      const attemptStart = Date.now();
      try {
        agoraLog.info('Token', `Fetch attempt ${attempt + 1}/${retries}`, { channel: channelName, uid: stableUid });

        const response = await fetch(AGORA_TOKEN_WORKER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ channelName, uid: stableUid, role: 1 }),
        });

        agoraLog.debug('Token', 'Response received', { 
          status: response.status, 
          statusText: response.statusText,
          time: `${Date.now() - attemptStart}ms`
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          agoraLog.error('Token', 'Server error response', { 
            status: response.status, 
            error: errorData 
          });
          
          if (response.status === 401) {
            throw new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
          }
          if (response.status === 429) {
            throw new Error('Quá nhiều yêu cầu. Vui lòng thử lại sau.');
          }
          
          throw new Error(errorData.error || 'Không thể lấy token từ server');
        }

        const data = await response.json();

        agoraLog.success('Token', 'Token fetched successfully', {
          appId: data.appId?.substring(0, 8) + '...',
          tokenLength: data.token?.length,
          tokenPrefix: data.token?.substring(0, 20) + '...',
          uid: stableUid,
          totalTime: `${Date.now() - fetchStartTime}ms`
        });
        
        return { ...data, uid: stableUid };
      } catch (error: any) {
        agoraLog.error('Token', `Attempt ${attempt + 1} failed`, { 
          error: error.message, 
          time: `${Date.now() - attemptStart}ms` 
        });
        lastError = error;
        
        if (error.message?.includes('đăng nhập')) {
          throw error;
        }
        
        if (attempt < retries - 1) {
          const waitTime = 1000 * (attempt + 1);
          agoraLog.info('Token', `Waiting ${waitTime}ms before retry...`);
          await new Promise(r => setTimeout(r, waitTime));
        }
      }
    }
    
    agoraLog.error('Token', 'All retry attempts exhausted', { totalTime: `${Date.now() - fetchStartTime}ms` });
    throw lastError || new Error('Không thể lấy token sau nhiều lần thử');
  }, [channelName]);

  // Join channel
  const joinChannel = useCallback(async () => {
    const joinStartTime = Date.now();
    
    // Prevent multiple join attempts
    if (!clientRef.current || !channelName) {
      agoraLog.warn('Join', 'Cannot join: missing client or channelName', { hasClient: !!clientRef.current, channelName });
      return;
    }
    
    if (joinInProgressRef.current) {
      agoraLog.warn('Join', 'Join already in progress, skipping');
      return;
    }
    
    if (hasJoinedRef.current) {
      agoraLog.warn('Join', 'Already joined, skipping');
      return;
    }

    // Check connection state and cleanup if needed
    const connectionState = clientRef.current.connectionState;
    agoraLog.info('Join', 'Current connection state', { state: connectionState });
    
    if (connectionState === 'CONNECTED' || connectionState === 'CONNECTING') {
      agoraLog.warn('Join', 'Client still connected, cleaning up first', { state: connectionState });
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
        agoraLog.info('Join', 'Cleanup leave completed');
      } catch (e: any) {
        agoraLog.warn('Join', 'Cleanup leave error (ignored)', { error: e?.message });
      }
      hasJoinedRef.current = false;
      eventListenersSetRef.current = false;
      clientRef.current.removeAllListeners();
      await new Promise(r => setTimeout(r, 500));
    }

    joinInProgressRef.current = true;
    setState(prev => ({ ...prev, isConnecting: true, error: null }));
    agoraLog.info('Join', '=== Starting join process ===', { channel: channelName, isVideoCall });

    try {
      // Set up event listeners before joining
      setupEventListeners();
      
      const { token, appId, uid: tokenUid } = await fetchToken();
      
      agoraLog.info('Join', 'Joining channel with credentials', { 
        channel: channelName, 
        appId: appId?.substring(0, 8) + '...', 
        uid: tokenUid,
        tokenLength: token?.length
      });
      
      const joinApiStart = Date.now();
      await clientRef.current.join(appId, channelName, token, tokenUid);
      agoraLog.success('Join', 'Joined channel successfully', { 
        uid: tokenUid, 
        joinApiTime: `${Date.now() - joinApiStart}ms`,
        totalTime: `${Date.now() - joinStartTime}ms`
      });
      hasJoinedRef.current = true;

      // Subscribe to existing remote users
      const existingUsers = clientRef.current.remoteUsers;
      agoraLog.info('Join', 'Checking existing remote users', { count: existingUsers.length });
      
      for (const user of existingUsers) {
        agoraLog.debug('Join', 'Found existing user', { uid: user.uid, hasAudio: user.hasAudio, hasVideo: user.hasVideo });
        if (user.hasAudio) {
          await clientRef.current.subscribe(user, 'audio');
          user.audioTrack?.play();
          agoraLog.success('Join', 'Subscribed to existing user audio', { uid: user.uid });
        }
        if (user.hasVideo) {
          await clientRef.current.subscribe(user, 'video');
          setState(prev => ({
            ...prev,
            remoteUsers: [...prev.remoteUsers.filter(u => u.uid !== user.uid), user],
          }));
          agoraLog.success('Join', 'Subscribed to existing user video', { uid: user.uid });
        }
      }

      // Create and publish local tracks
      agoraLog.info('Tracks', 'Creating local tracks', { isVideoCall });
      const tracks: (ICameraVideoTrack | IMicrophoneAudioTrack)[] = [];
      
      // Get saved device preferences
      const savedMicrophone = localStorage.getItem('preferredMicrophone');
      const savedCamera = localStorage.getItem('preferredCamera');
      agoraLog.debug('Tracks', 'Device preferences from settings', { savedMicrophone, savedCamera });
      
      try {
        const audioStart = Date.now();
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack(
          savedMicrophone ? { microphoneId: savedMicrophone } : undefined
        );
        localAudioTrackRef.current = audioTrack;
        tracks.push(audioTrack);
        agoraLog.success('Tracks', 'Audio track created', { 
          time: `${Date.now() - audioStart}ms`,
          microphoneId: savedMicrophone || 'default'
        });
      } catch (audioErr: any) {
        agoraLog.error('Tracks', 'Failed to create audio track', { 
          error: audioErr?.message,
          name: audioErr?.name,
          code: audioErr?.code 
        });
      }
      
      if (isVideoCall) {
        try {
          const videoStart = Date.now();
          const videoTrack = await AgoraRTC.createCameraVideoTrack(
            savedCamera ? { cameraId: savedCamera } : undefined
          );
          localVideoTrackRef.current = videoTrack;
          tracks.push(videoTrack);
          agoraLog.success('Tracks', 'Video track created', { 
            time: `${Date.now() - videoStart}ms`,
            cameraId: savedCamera || 'default'
          });
        } catch (videoErr: any) {
          agoraLog.error('Tracks', 'Failed to create video track', { 
            error: videoErr?.message,
            name: videoErr?.name,
            code: videoErr?.code 
          });
        }
      }

      if (tracks.length > 0) {
        const publishStart = Date.now();
        await clientRef.current.publish(tracks);
        agoraLog.success('Tracks', 'Published local tracks', { count: tracks.length, time: `${Date.now() - publishStart}ms` });
      } else {
        agoraLog.warn('Tracks', 'No tracks to publish');
      }

      agoraLog.success('Join', '=== Join process completed ===', { totalTime: `${Date.now() - joinStartTime}ms` });

      setState(prev => ({
        ...prev,
        localAudioTrack: localAudioTrackRef.current,
        localVideoTrack: localVideoTrackRef.current,
        isJoined: true,
        isConnecting: false,
      }));
    } catch (error: any) {
      agoraLog.error('Join', 'Failed to join channel', { 
        code: error?.code, 
        message: error?.message,
        name: error?.name,
        totalTime: `${Date.now() - joinStartTime}ms`
      });
      hasJoinedRef.current = false;
      
      let errorMessage = 'Không thể kết nối cuộc gọi';
      
      // Handle specific Agora error codes with logging
      if (error.code === 'CAN_NOT_GET_GATEWAY_SERVER') {
        agoraLog.error('Join', 'Gateway server unreachable - check network/token/appId');
        errorMessage = 'Không thể kết nối server Agora. Kiểm tra kết nối mạng.';
      } else if (error.code === 'UID_CONFLICT') {
        agoraLog.error('Join', 'UID conflict detected');
        errorMessage = 'Xung đột user ID. Vui lòng thử lại.';
      } else if (error.code === 'INVALID_VENDOR_KEY' || error.message?.includes('vendor key')) {
        agoraLog.error('Join', 'Invalid Agora App ID');
        errorMessage = 'Agora App ID không hợp lệ. Vui lòng kiểm tra cấu hình.';
      } else if (error.code === 'INVALID_OPERATION') {
        agoraLog.error('Join', 'Invalid operation - client state issue');
        errorMessage = 'Lỗi kết nối. Vui lòng thử lại.';
      } else if (error.code === 'OPERATION_ABORTED') {
        agoraLog.error('Join', 'Operation was aborted');
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
    agoraLog.info('Leave', '=== Starting leave process ===', {
      hasJoined: hasJoinedRef.current,
      connectionState: clientRef.current?.connectionState
    });

    try {
      // Stop and close local tracks
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
        agoraLog.info('Leave', 'Audio track closed');
      }

      if (localVideoTrackRef.current) {
        localVideoTrackRef.current.stop();
        localVideoTrackRef.current.close();
        localVideoTrackRef.current = null;
        agoraLog.info('Leave', 'Video track closed');
      }

      // Leave channel if connected
      if (clientRef.current) {
        const connectionState = clientRef.current.connectionState;
        if (connectionState === 'CONNECTED' || connectionState === 'CONNECTING') {
          await clientRef.current.leave();
          agoraLog.success('Leave', 'Left channel successfully');
        }
        
        clientRef.current.removeAllListeners();
        clientRef.current = null;
        agoraLog.info('Leave', 'Client destroyed');
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
      
      agoraLog.success('Leave', '=== Leave process completed ===');
    } catch (error: any) {
      agoraLog.error('Leave', 'Failed to leave channel', { error: error?.message });
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
      agoraLog.info('Controls', 'Audio mute toggled', { isMuted: newMutedState });
    }
  }, [state.isMuted]);

  // Toggle video
  const toggleVideo = useCallback(async () => {
    if (localVideoTrackRef.current) {
      const newVideoOffState = !state.isVideoOff;
      await localVideoTrackRef.current.setEnabled(!newVideoOffState);
      setState(prev => ({ ...prev, isVideoOff: newVideoOffState }));
      agoraLog.info('Controls', 'Video toggled', { isVideoOff: newVideoOffState });
    }
  }, [state.isVideoOff]);

  // Debug info getter
  const getDebugInfo = useCallback(() => ({
    timestamp: new Date().toISOString(),
    channelName,
    connectionState: clientRef.current?.connectionState || 'NO_CLIENT',
    isJoined: hasJoinedRef.current,
    joinInProgress: joinInProgressRef.current,
    localTracks: {
      audio: !!localAudioTrackRef.current,
      video: !!localVideoTrackRef.current,
    },
    remoteUsersCount: state.remoteUsers.length,
    error: state.error,
  }), [channelName, state.remoteUsers.length, state.error]);

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
    getDebugInfo,
  };
};
