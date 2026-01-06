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
  }, []);

  // Fetch token from edge function
  const fetchToken = useCallback(async () => {
    try {
      console.log('Fetching Agora token for channel:', channelName);
      const { data, error } = await supabase.functions.invoke('agora-token', {
        body: { channelName, uid: uid || 0, role: 1 },
      });

      if (error) {
        console.error('Error fetching token:', error);
        throw error;
      }

      console.log('Token fetched successfully');
      return data;
    } catch (error) {
      console.error('Failed to fetch Agora token:', error);
      throw error;
    }
  }, [channelName, uid]);

  // Join channel
  const joinChannel = useCallback(async () => {
    if (!clientRef.current || !channelName || state.isJoined) return;

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      const { token, appId, uid: tokenUid } = await fetchToken();
      
      console.log('Joining channel with appId:', appId, 'channel:', channelName);
      
      // Set up event handlers
      clientRef.current.on('user-published', async (user, mediaType) => {
        console.log('User published:', user.uid, mediaType);
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

      // Join the channel
      await clientRef.current.join(appId, channelName, token || null, tokenUid);
      console.log('Joined channel successfully');

      // Create and publish local tracks
      const tracks: (ICameraVideoTrack | IMicrophoneAudioTrack)[] = [];
      
      // Always create audio track
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      localAudioTrackRef.current = audioTrack;
      tracks.push(audioTrack);
      
      // Create video track only for video calls
      if (isVideoCall) {
        const videoTrack = await AgoraRTC.createCameraVideoTrack();
        localVideoTrackRef.current = videoTrack;
        tracks.push(videoTrack);
      }

      await clientRef.current.publish(tracks);
      console.log('Published local tracks');

      setState(prev => ({
        ...prev,
        localAudioTrack: localAudioTrackRef.current,
        localVideoTrack: localVideoTrackRef.current,
        isJoined: true,
        isConnecting: false,
      }));
    } catch (error: any) {
      console.error('Failed to join channel:', error);
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: error.message || 'Failed to join call',
      }));
    }
  }, [channelName, fetchToken, state.isJoined, isVideoCall]);

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

      await clientRef.current.leave();
      console.log('Left channel');

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
    if (enabled && channelName && !state.isJoined && !state.isConnecting) {
      joinChannel();
    }
  }, [enabled, channelName, state.isJoined, state.isConnecting, joinChannel]);

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
    toggleMute,
    toggleVideo,
    setLocalVideoContainer,
  };
};
