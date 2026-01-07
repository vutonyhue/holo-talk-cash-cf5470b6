import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useConversations } from '@/hooks/useConversations';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, MessageCircle, Loader2 } from 'lucide-react';
import { Profile } from '@/types';

export default function UserProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { createConversation } = useConversations();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!userId) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setProfile(data as Profile);
      }
      setLoading(false);
    };

    fetchProfile();
  }, [userId]);

  const handleStartChat = async () => {
    if (!userId || !user) return;

    setStartingChat(true);
    const { data, error } = await createConversation([userId]);
    setStartingChat(false);

    if (!error && data) {
      navigate('/chat', { state: { conversationId: data.id } });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <p className="text-muted-foreground mb-4">Không tìm thấy người dùng</p>
        <Button onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Quay lại
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="h-16 px-4 flex items-center border-b bg-card/50 backdrop-blur-sm">
        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-xl mr-3"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold">Hồ sơ</h1>
      </div>

      {/* Profile Content */}
      <div className="p-4 max-w-lg mx-auto">
        <Card className="overflow-hidden">
          {/* Cover/Banner area */}
          <div className="h-24 gradient-primary" />
          
          <CardContent className="relative pt-0 pb-6">
            {/* Avatar */}
            <div className="flex justify-center -mt-12 mb-4">
              <Avatar className="w-24 h-24 ring-4 ring-background">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="text-2xl font-bold gradient-primary text-white">
                  {(profile.display_name || profile.username)?.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>

            {/* Info */}
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold">
                {profile.display_name || profile.username}
              </h2>
              <p className="text-muted-foreground">@{profile.username}</p>
              
              {profile.status && (
                <p className="text-sm text-muted-foreground">{profile.status}</p>
              )}

              {profile.wallet_address && (
                <p className="text-xs text-muted-foreground font-mono truncate px-4">
                  {profile.wallet_address}
                </p>
              )}
            </div>

            {/* Action Button */}
            {user && userId !== user.id && (
              <div className="mt-6 flex justify-center">
                <Button 
                  onClick={handleStartChat}
                  disabled={startingChat}
                  className="gradient-primary text-white"
                >
                  {startingChat ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <MessageCircle className="w-4 h-4 mr-2" />
                  )}
                  Nhắn tin
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}