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
import { IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';

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

  // Play remote videos
  useEffect(() => {
    remoteUsers.forEach((user) => {
      const container = remoteVideoRefs.current.get(String(user.uid));
      if (container && user.videoTrack) {
        user.videoTrack.play(container);
      }
    });
  }, [remoteUsers]);

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

  const setRemoteVideoRef = useCallback((uid: string) => (el: HTMLDivElement | null) => {
    if (el) {
      remoteVideoRefs.current.set(uid, el);
    } else {
      remoteVideoRefs.current.delete(uid);
    }
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Remote Video / Avatar Background */}
      <div className="flex-1 relative flex items-center justify-center">
        {/* If there are remote users with video, show their video */}
        {remoteUsers.length > 0 && remoteUsers[0].videoTrack ? (
          <div className="absolute inset-0">
            <div 
              ref={setRemoteVideoRef(String(remoteUsers[0].uid))}
              className="w-full h-full"
            />
          </div>
        ) : (
          /* Gradient background with animated effects */
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
                ref={setRemoteVideoRef(String(user.uid))}
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
