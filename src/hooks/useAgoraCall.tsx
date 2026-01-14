import { useState, useEffect, useCallback, useRef } from 'react';
import AgoraRTC, {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';
import { supabase } from '@/integrations/supabase/client';

// Cloudflare Worker URL for Agora token generation
const AGORA_TOKEN_WORKER_URL = 'https://agora-token-worker.india-25d.workers.dev';

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
  const lastUserInfoUpdateRef = useRef<Map<string, number>>(new Map());
  const isMountedRef = useRef(true); // Track if component is mounted
  const isClientReadyRef = useRef(false); // Track if client is fully initialized
  const retryCountRef = useRef(0); // Track retry attempts for INVALID_OPERATION
  
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

  // Safe setState that checks if component is still mounted
  const safeSetState = useCallback((updater: React.SetStateAction<AgoraCallState>) => {
    if (isMountedRef.current) {
      setState(updater);
    }
  }, []);

  const localVideoRef = useRef<HTMLDivElement | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);

  // Track mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Create new Agora client for each call session
  useEffect(() => {
    if (enabled && channelName) {
      // Mark client as not ready during initialization
      isClientReadyRef.current = false;
      
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
      retryCountRef.current = 0;
      
      // Create new client
      const sdkVersion = AgoraRTC.VERSION;
      clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      
      // Mark client as ready after creation
      isClientReadyRef.current = true;
      
      agoraLog.success('Init', 'New client created and ready', { 
        channel: channelName, 
        sdkVersion,
        mode: 'rtc', 
        codec: 'vp8',
        isVideoCall 
      });
    }
    
    return () => {
      isClientReadyRef.current = false;
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
        if (!clientRef.current) return; // Guard against unmount
        const subscribeStart = Date.now();
        await clientRef.current.subscribe(user, mediaType);
        agoraLog.success('Events', 'Subscribed to user', { uid: user.uid, mediaType, time: `${Date.now() - subscribeStart}ms` });
        
        // Only update state if there's an actual change to prevent infinite loops
        safeSetState(prev => {
          const existingUser = prev.remoteUsers.find(u => u.uid === user.uid);
          
          // Check if we actually have new track info
          if (existingUser) {
            const hasNewVideo = mediaType === 'video' && !existingUser.videoTrack && user.videoTrack;
            const hasNewAudio = mediaType === 'audio' && !existingUser.audioTrack && user.audioTrack;
            
            if (!hasNewVideo && !hasNewAudio) {
              agoraLog.debug('Events', 'No actual track change, skipping state update', { uid: user.uid });
              return prev; // No state change - prevents re-render
            }
          }
          
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
      safeSetState(prev => ({
        ...prev,
        remoteUsers: prev.remoteUsers.map(u => u.uid === user.uid ? user : u),
      }));
    });

    clientRef.current.on('user-left', (user, reason) => {
      agoraLog.info('Events', 'User left', { uid: user.uid, reason });
      safeSetState(prev => ({
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

    // Throttle user-info-updated events to prevent spam
    clientRef.current.on('user-info-updated', (uid, msg) => {
      const now = Date.now();
      const key = `${uid}-${msg}`;
      const lastUpdate = lastUserInfoUpdateRef.current.get(key) || 0;
      
      // Throttle: only log if 1000ms has passed since last update
      if (now - lastUpdate < 1000) {
        return;
      }
      
      lastUserInfoUpdateRef.current.set(key, now);
      agoraLog.debug('Events', 'User info updated', { uid, msg });
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
          body: JSON.stringify({ channel: channelName, uid: stableUid, role: 1 }),
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

  // Wait for client to be ready
  const waitForClientReady = useCallback(async (timeoutMs: number = 3000): Promise<boolean> => {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (isClientReadyRef.current && clientRef.current) {
        return true;
      }
      await new Promise(r => setTimeout(r, 50));
    }
    
    agoraLog.error('Join', 'Client not ready within timeout', { timeoutMs });
    return false;
  }, []);

  // Join channel
  const joinChannel = useCallback(async () => {
    const joinStartTime = Date.now();
    
    // Wait for client to be ready before proceeding
    if (!isClientReadyRef.current || !clientRef.current) {
      agoraLog.warn('Join', 'Client not ready, waiting...', { isReady: isClientReadyRef.current, hasClient: !!clientRef.current });
      
      const isReady = await waitForClientReady(3000);
      if (!isReady) {
        safeSetState(prev => ({ ...prev, isConnecting: false, error: 'Không thể khởi tạo kết nối. Vui lòng thử lại.' }));
        return;
      }
    }
    
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
    safeSetState(prev => ({ ...prev, isConnecting: true, error: null }));
    agoraLog.info('Join', '=== Starting join process ===', { channel: channelName, isVideoCall, retryCount: retryCountRef.current });

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
      
      // Wait for connection to stabilize before publishing
      await new Promise(r => setTimeout(r, 100));
      
      // Verify connection state before proceeding
      if (clientRef.current.connectionState !== 'CONNECTED') {
        agoraLog.warn('Join', 'Waiting for connection to stabilize...', { state: clientRef.current.connectionState });
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout after join')), 5000);
          const checkConnection = () => {
            if (clientRef.current?.connectionState === 'CONNECTED') {
              clearTimeout(timeout);
              resolve();
            } else if (!clientRef.current) {
              clearTimeout(timeout);
              reject(new Error('Client destroyed during connection'));
            } else {
              setTimeout(checkConnection, 100);
            }
          };
          checkConnection();
        });
      }
      
      agoraLog.success('Join', 'Joined channel and connection confirmed', { 
        uid: tokenUid, 
        joinApiTime: `${Date.now() - joinApiStart}ms`,
        totalTime: `${Date.now() - joinStartTime}ms`,
        connectionState: clientRef.current.connectionState
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
          safeSetState(prev => ({
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
        // Final guard: ensure we're connected before publishing
        if (!clientRef.current || clientRef.current.connectionState !== 'CONNECTED') {
          agoraLog.error('Tracks', 'Cannot publish - client not connected', { 
            state: clientRef.current?.connectionState 
          });
          throw new Error('Cannot publish tracks: client not connected');
        }
        
        const publishStart = Date.now();
        await clientRef.current.publish(tracks);
        agoraLog.success('Tracks', 'Published local tracks', { count: tracks.length, time: `${Date.now() - publishStart}ms` });
      } else {
        agoraLog.warn('Tracks', 'No tracks to publish');
      }

      agoraLog.success('Join', '=== Join process completed ===', { totalTime: `${Date.now() - joinStartTime}ms` });

      safeSetState(prev => ({
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
        totalTime: `${Date.now() - joinStartTime}ms`,
        retryCount: retryCountRef.current
      });
      hasJoinedRef.current = false;
      joinInProgressRef.current = false;
      
      // Auto-retry for INVALID_OPERATION (up to 2 retries)
      if (error.code === 'INVALID_OPERATION' && retryCountRef.current < 2) {
        retryCountRef.current += 1;
        agoraLog.warn('Join', `INVALID_OPERATION - auto retrying (${retryCountRef.current}/2)...`);
        
        // Wait a bit then retry
        await new Promise(r => setTimeout(r, 1000));
        
        // Check if still mounted and enabled
        if (isMountedRef.current && enabled && channelName) {
          return joinChannel();
        }
        return;
      }
      
      let errorMessage = 'Không thể kết nối cuộc gọi';
      
      // Handle specific Agora error codes with logging
      // Check for invalid appId first (most specific case of CAN_NOT_GET_GATEWAY_SERVER)
      const isInvalidAppId = error.message?.toLowerCase().includes('invalid vendor key') || 
                             error.message?.toLowerCase().includes('can not find appid') ||
                             error.code === 'INVALID_VENDOR_KEY';
      
      if (isInvalidAppId) {
        agoraLog.error('Join', '❌ INVALID AGORA APP ID - Worker is configured with wrong AGORA_APP_ID', {
          errorCode: error.code,
          errorMessage: error.message,
          hint: 'Check AGORA_APP_ID secret in Cloudflare Worker matches your Agora Console App ID'
        });
        errorMessage = 'Agora App ID không hợp lệ hoặc không tồn tại. Vui lòng kiểm tra cấu hình AGORA_APP_ID trong Worker.';
      } else if (error.code === 'CAN_NOT_GET_GATEWAY_SERVER') {
        agoraLog.error('Join', 'Gateway server unreachable - check network/token/appId');
        errorMessage = 'Không thể kết nối server Agora. Kiểm tra kết nối mạng hoặc cấu hình Agora.';
      } else if (error.code === 'UID_CONFLICT') {
        agoraLog.error('Join', 'UID conflict detected');
        errorMessage = 'Xung đột user ID. Vui lòng thử lại.';
      } else if (error.code === 'INVALID_OPERATION') {
        agoraLog.error('Join', 'Invalid operation - client state issue (max retries reached)');
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
      
      safeSetState(prev => ({
        ...prev,
        isConnecting: false,
        error: errorMessage,
      }));
    }
  }, [channelName, fetchToken, isVideoCall, setupEventListeners, waitForClientReady, enabled, safeSetState]);

  // Leave channel with full cleanup
  const leaveChannel = useCallback(async (options?: { skipStateReset?: boolean }) => {
    agoraLog.info('Leave', '=== Starting leave process ===', {
      hasJoined: hasJoinedRef.current,
      connectionState: clientRef.current?.connectionState,
      skipStateReset: !!options?.skipStateReset,
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
        isClientReadyRef.current = false;
        agoraLog.info('Leave', 'Client destroyed');
      }

      // Reset all refs
      hasJoinedRef.current = false;
      joinInProgressRef.current = false;
      eventListenersSetRef.current = false;
      retryCountRef.current = 0;

      // IMPORTANT: don't set state during unmount/cleanup (can trigger React "Should have a queue")
      if (!options?.skipStateReset && isMountedRef.current) {
        safeSetState({
          localVideoTrack: null,
          localAudioTrack: null,
          remoteUsers: [],
          isJoined: false,
          isMuted: false,
          isVideoOff: false,
          isConnecting: false,
          error: null,
        });
      }

      agoraLog.success('Leave', '=== Leave process completed ===');
    } catch (error: any) {
      agoraLog.error('Leave', 'Failed to leave channel', { error: error?.message });
      hasJoinedRef.current = false;
      joinInProgressRef.current = false;
      isClientReadyRef.current = false;
      clientRef.current = null;
    }
  }, [safeSetState]);

  // Retry connection
  const retryConnection = useCallback(async () => {
    hasJoinedRef.current = false;
    joinInProgressRef.current = false;
    retryCountRef.current = 0;
    await joinChannel();
  }, [joinChannel]);

  // Toggle mute
  const toggleMute = useCallback(async () => {
    if (localAudioTrackRef.current) {
      const newMutedState = !state.isMuted;
      await localAudioTrackRef.current.setEnabled(!newMutedState);
      safeSetState(prev => ({ ...prev, isMuted: newMutedState }));
      agoraLog.info('Controls', 'Audio mute toggled', { isMuted: newMutedState });
    }
  }, [state.isMuted, safeSetState]);

  // Toggle video
  const toggleVideo = useCallback(async () => {
    if (localVideoTrackRef.current) {
      const newVideoOffState = !state.isVideoOff;
      await localVideoTrackRef.current.setEnabled(!newVideoOffState);
      safeSetState(prev => ({ ...prev, isVideoOff: newVideoOffState }));
      agoraLog.info('Controls', 'Video toggled', { isVideoOff: newVideoOffState });
    }
  }, [state.isVideoOff, safeSetState]);

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

  // Auto join when enabled - with delay to ensure client is ready
  useEffect(() => {
    if (!enabled || !channelName || hasJoinedRef.current || joinInProgressRef.current) {
      return;
    }

    // Small delay to ensure client initialization effect has completed
    const timer = setTimeout(() => {
      if (enabled && channelName && !hasJoinedRef.current && !joinInProgressRef.current && isMountedRef.current) {
        agoraLog.info('AutoJoin', 'Triggering auto-join after delay', { channel: channelName, isClientReady: isClientReadyRef.current });
        joinChannel();
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [enabled, channelName, joinChannel]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Mark as unmounted early to prevent any state updates during cleanup
      isMountedRef.current = false;
      void leaveChannel({ skipStateReset: true });
    };
  }, [leaveChannel]);

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
