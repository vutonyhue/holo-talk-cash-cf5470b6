import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  PhoneOff,
  Users,
  ScreenShare,
  MessageCircle,
  Loader2
} from 'lucide-react';
import { useAgoraCall } from '@/hooks/useAgoraCall';
import { IAgoraRTCRemoteUser, IRemoteVideoTrack } from 'agora-rtc-sdk-ng';

interface VideoCallModalProps {
  open: boolean;
  onClose: () => void;
  callType: 'video' | 'voice';
  participantName: string;
  participantAvatar?: string;
  isGroup?: boolean;
  channelName?: string;
}

export default function VideoCallModal({
  open,
  onClose,
  callType,
  participantName,
  participantAvatar,
  isGroup = false,
  channelName,
}: VideoCallModalProps) {
  const [callDuration, setCallDuration] = useState(0);
  const localVideoContainerRef = useRef<HTMLDivElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const playedTracksRef = useRef<Set<string>>(new Set());

  const {
    localVideoTrack,
    remoteUsers,
    isJoined,
    isMuted,
    isVideoOff,
    isConnecting,
    error,
    toggleMute,
    toggleVideo,
    leaveChannel,
    retryConnection,
    setLocalVideoContainer,
  } = useAgoraCall({
    channelName: channelName || '',
    enabled: open && !!channelName,
    isVideoCall: callType === 'video',
  });

  // Set up local video container
  useEffect(() => {
    if (localVideoContainerRef.current && localVideoTrack) {
      localVideoTrack.play(localVideoContainerRef.current);
    }
  }, [localVideoTrack]);

  // Log remote users for debugging
  useEffect(() => {
    console.log('VideoCallModal: Remote users changed:', remoteUsers.length, 
      remoteUsers.map(u => ({ 
        uid: u.uid, 
        hasVideo: !!u.videoTrack, 
        hasAudio: !!u.audioTrack 
      }))
    );
  }, [remoteUsers]);

  // Play remote video tracks - triggered by remoteUsers changes
  // Use requestAnimationFrame to batch DOM operations and prevent blocking
  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      remoteUsers.forEach((user) => {
        const uidKey = String(user.uid);
        const container = remoteVideoRefs.current.get(uidKey);
        
        if (container && user.videoTrack) {
          const trackId = user.videoTrack.getTrackId?.() || 'unknown';
          const trackKey = `${uidKey}-${trackId}`;
          if (!playedTracksRef.current.has(trackKey)) {
            console.log('Playing remote video for user:', user.uid);
            try {
              user.videoTrack.play(container);
              playedTracksRef.current.add(trackKey);
            } catch (err) {
              console.error('Error playing remote video:', err);
            }
          }
        }
      });
    });
    
    return () => cancelAnimationFrame(frameId);
  }, [remoteUsers]);

  // Reset refs when modal closes
  useEffect(() => {
    if (!open) {
      playedTracksRef.current.clear();
      remoteVideoRefs.current.clear();
    }
  }, [open]);

  // Track call duration
  useEffect(() => {
    if (!open || !isJoined) {
      setCallDuration(0);
      return;
    }

    const interval = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [open, isJoined]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEndCall = async () => {
    await leaveChannel();
    setCallDuration(0);
    onClose();
  };

  // Callback ref that plays video immediately when DOM element is available
  const setRemoteVideoRef = useCallback((uid: string, videoTrack?: IRemoteVideoTrack) => {
    return (el: HTMLDivElement | null) => {
      if (el) {
        remoteVideoRefs.current.set(uid, el);
        // Play immediately when element mounts and track is available
        if (videoTrack) {
          const trackKey = `${uid}-${videoTrack.getTrackId()}`;
          if (!playedTracksRef.current.has(trackKey)) {
            console.log('Callback ref: Playing remote video for user:', uid);
            try {
              videoTrack.play(el);
              playedTracksRef.current.add(trackKey);
            } catch (err) {
              console.error('Callback ref: Error playing remote video:', err);
            }
          }
        }
      } else {
        remoteVideoRefs.current.delete(uid);
      }
    };
  }, []);

  if (!open) return null;

  // Check if any remote user has video
  const hasRemoteVideo = remoteUsers.some(u => u.videoTrack);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Remote Video / Avatar Background */}
      <div className="flex-1 relative flex items-center justify-center">
        {/* If there are remote users with video, show their video */}
        {remoteUsers.length > 0 && hasRemoteVideo ? (
          <div className="absolute inset-0">
            {remoteUsers.filter(u => u.videoTrack).map((user) => (
              <div 
                key={user.uid}
                ref={setRemoteVideoRef(String(user.uid), user.videoTrack)}
                className="w-full h-full"
              />
            ))}
          </div>
        ) : remoteUsers.length > 0 && !hasRemoteVideo ? (
          /* Remote user connected but camera off */
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-violet-900 to-pink-900">
            <div className="absolute inset-0 opacity-30">
              <div className="absolute top-20 left-20 w-64 h-64 rounded-full bg-purple-500 blur-3xl animate-pulse" />
              <div className="absolute bottom-20 right-20 w-80 h-80 rounded-full bg-pink-500 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Avatar className="w-32 h-32 ring-4 ring-white/20 shadow-2xl mb-6">
                <AvatarImage src={participantAvatar} />
                <AvatarFallback className="text-4xl font-bold gradient-primary text-white">
                  {participantName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <h2 className="text-2xl font-bold text-white mb-2">{participantName}</h2>
              <span className="text-lg text-white/80">{formatDuration(callDuration)}</span>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <p className="text-white/60 text-sm">
                  {callType === 'video' ? 'Đã tắt camera' : 'Cuộc gọi thoại'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* No remote users - waiting or gradient background */
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-violet-900 to-pink-900">
            <div className="absolute inset-0 opacity-30">
              <div className="absolute top-20 left-20 w-64 h-64 rounded-full bg-purple-500 blur-3xl animate-pulse" />
              <div className="absolute bottom-20 right-20 w-80 h-80 rounded-full bg-pink-500 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-cyan-500 blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
            </div>
          </div>
        )}

        {/* Participant info (shown when no remote video) */}
        {remoteUsers.length === 0 || !remoteUsers[0].videoTrack ? (
          <div className="relative z-10 flex flex-col items-center">
            <Avatar className="w-32 h-32 ring-4 ring-white/20 shadow-2xl mb-6">
              <AvatarImage src={participantAvatar} />
              <AvatarFallback className="text-4xl font-bold gradient-primary text-white">
                {participantName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <h2 className="text-2xl font-bold text-white mb-2">{participantName}</h2>
            
            <div className="flex items-center gap-2 text-white/80">
              {isGroup && <Users className="w-4 h-4" />}
              <span className="text-lg">{formatDuration(callDuration)}</span>
            </div>
            
            {/* Status indicator */}
            <div className="mt-4 flex flex-col items-center gap-2">
              {isConnecting ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                  <span className="text-white/60 text-sm">Đang kết nối...</span>
                </div>
              ) : isJoined ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-white/60 text-sm">
                    {remoteUsers.length > 0 ? 'Đã kết nối' : 'Đang chờ người khác tham gia...'}
                  </span>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-red-400 text-sm text-center">{error}</span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={retryConnection}
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                  >
                    Thử lại
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                  <span className="text-white/60 text-sm">Đang gọi...</span>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Additional remote users (for group calls) */}
        {remoteUsers.length > 1 && (
          <div className="absolute top-4 right-4 flex flex-col gap-2">
            {remoteUsers.slice(1).map((user) => (
              <div 
                key={user.uid}
                ref={setRemoteVideoRef(String(user.uid), user.videoTrack)}
                className="w-32 h-24 rounded-lg overflow-hidden bg-black/50"
              />
            ))}
          </div>
        )}

        {/* Local video (picture-in-picture) */}
        {callType === 'video' && !isVideoOff && (
          <div 
            ref={localVideoContainerRef}
            className="absolute bottom-24 right-6 w-40 h-56 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20 bg-black"
          />
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 pb-12 pt-8 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full ${
              isMuted 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </Button>

          {callType === 'video' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleVideo}
              className={`w-14 h-14 rounded-full ${
                isVideoOff 
                  ? 'bg-red-500 hover:bg-red-600 text-white' 
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <ScreenShare className="w-6 h-6" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <MessageCircle className="w-6 h-6" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleEndCall}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white"
          >
            <PhoneOff className="w-7 h-7" />
          </Button>
        </div>
      </div>
    </div>
  );
}
