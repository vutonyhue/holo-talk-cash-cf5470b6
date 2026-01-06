import { Phone, PhoneOff, Video } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { CallSession } from '@/hooks/useCallSignaling';

interface IncomingCallModalProps {
  call: CallSession;
  onAccept: () => void;
  onReject: () => void;
}

export const IncomingCallModal = ({ call, onAccept, onReject }: IncomingCallModalProps) => {
  const callerName = call.caller_profile?.display_name || call.caller_profile?.username || 'Unknown';
  const callerAvatar = call.caller_profile?.avatar_url;
  const isVideoCall = call.call_type === 'video';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-card rounded-2xl p-8 flex flex-col items-center gap-6 shadow-2xl animate-in fade-in zoom-in duration-300 max-w-sm w-full mx-4">
        {/* Caller Avatar with pulse animation */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
          <Avatar className="w-24 h-24 border-4 border-primary">
            <AvatarImage src={callerAvatar || undefined} alt={callerName} />
            <AvatarFallback className="text-3xl bg-primary text-primary-foreground">
              {callerName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Caller Info */}
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground">{callerName}</h2>
          <p className="text-muted-foreground flex items-center justify-center gap-2 mt-1">
            {isVideoCall ? (
              <>
                <Video className="w-4 h-4" />
                Cuộc gọi video đến...
              </>
            ) : (
              <>
                <Phone className="w-4 h-4" />
                Cuộc gọi thoại đến...
              </>
            )}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-8">
          {/* Reject Button */}
          <Button
            onClick={onReject}
            variant="destructive"
            size="lg"
            className="w-16 h-16 rounded-full p-0 hover:scale-110 transition-transform"
          >
            <PhoneOff className="w-7 h-7" />
          </Button>

          {/* Accept Button */}
          <Button
            onClick={onAccept}
            size="lg"
            className="w-16 h-16 rounded-full p-0 bg-green-500 hover:bg-green-600 hover:scale-110 transition-transform"
          >
            {isVideoCall ? (
              <Video className="w-7 h-7" />
            ) : (
              <Phone className="w-7 h-7" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
