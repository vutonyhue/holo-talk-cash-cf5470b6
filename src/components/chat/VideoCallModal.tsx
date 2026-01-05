import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  PhoneOff,
  Users,
  Maximize,
  ScreenShare,
  MessageCircle
} from 'lucide-react';

interface VideoCallModalProps {
  open: boolean;
  onClose: () => void;
  callType: 'video' | 'voice';
  participantName: string;
  participantAvatar?: string;
  isGroup?: boolean;
}

export default function VideoCallModal({
  open,
  onClose,
  callType,
  participantName,
  participantAvatar,
  isGroup = false,
}: VideoCallModalProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === 'voice');
  const [callDuration, setCallDuration] = useState(0);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (open && callType === 'video') {
      startLocalVideo();
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [open, callType]);

  useEffect(() => {
    if (!open) return;

    const interval = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [open]);

  const startLocalVideo = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setStream(mediaStream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Error accessing media devices:', error);
    }
  };

  const toggleMute = () => {
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEndCall = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    setStream(null);
    setCallDuration(0);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Remote Video / Avatar Background */}
      <div className="flex-1 relative flex items-center justify-center">
        {/* Gradient background with animated effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-violet-900 to-pink-900">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-20 left-20 w-64 h-64 rounded-full bg-purple-500 blur-3xl animate-pulse" />
            <div className="absolute bottom-20 right-20 w-80 h-80 rounded-full bg-pink-500 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-cyan-500 blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
          </div>
        </div>

        {/* Participant info */}
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
          
          {/* Calling indicator */}
          <div className="mt-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-white/60 text-sm">Đang gọi...</span>
          </div>
        </div>

        {/* Local video (picture-in-picture) */}
        {callType === 'video' && !isVideoOff && (
          <div className="absolute bottom-24 right-6 w-40 h-56 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          </div>
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
