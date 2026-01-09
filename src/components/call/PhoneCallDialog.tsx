import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, Video, User } from 'lucide-react';

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  phone_number: string | null;
}

interface PhoneCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile | null;
  callType: 'voice' | 'video';
  onConfirmCall: () => void;
  isLoading?: boolean;
}

export const PhoneCallDialog = ({
  open,
  onOpenChange,
  profile,
  callType,
  onConfirmCall,
  isLoading,
}: PhoneCallDialogProps) => {
  if (!profile) return null;

  const displayName = profile.display_name || profile.username;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">
            {callType === 'video' ? 'Gọi video' : 'Gọi thoại'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-6">
          <Avatar className="w-24 h-24">
            <AvatarImage src={profile.avatar_url || undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="text-center">
            <h3 className="text-xl font-semibold">{displayName}</h3>
            <p className="text-sm text-muted-foreground">@{profile.username}</p>
            {profile.phone_number && (
              <p className="text-sm text-muted-foreground mt-1">
                {profile.phone_number}
              </p>
            )}
          </div>

          <p className="text-sm text-muted-foreground text-center">
            Bạn có muốn {callType === 'video' ? 'gọi video' : 'gọi thoại'} cho {displayName}?
          </p>
        </div>

        <div className="flex justify-center gap-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Hủy
          </Button>
          <Button
            onClick={onConfirmCall}
            disabled={isLoading}
            className={callType === 'video' 
              ? 'bg-primary hover:bg-primary/90' 
              : 'bg-green-500 hover:bg-green-600'
            }
          >
            {callType === 'video' ? (
              <Video className="w-4 h-4 mr-2" />
            ) : (
              <Phone className="w-4 h-4 mr-2" />
            )}
            {isLoading ? 'Đang kết nối...' : 'Gọi ngay'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
