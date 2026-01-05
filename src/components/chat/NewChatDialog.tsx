import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Profile } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Search, Users, MessageCircle, Loader2 } from 'lucide-react';

interface NewChatDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (memberIds: string[], name?: string, isGroup?: boolean) => Promise<void>;
}

export default function NewChatDialog({ open, onClose, onCreate }: NewChatDialogProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingUserId, setCreatingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      searchUsers();
    }
  }, [open, searchQuery]);

  const searchUsers = async () => {
    if (!user) return;
    
    setLoading(true);
    
    let query = supabase
      .from('profiles')
      .select('*')
      .neq('id', user.id)
      .limit(20);

    if (searchQuery) {
      query = query.or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query;

    if (!error && data) {
      setUsers(data as Profile[]);
    }
    
    setLoading(false);
  };

  const handleDirectChat = async (userId: string) => {
    setCreatingUserId(userId);
    await onCreate([userId], undefined, false);
    setCreatingUserId(null);
    setSearchQuery('');
    onClose();
  };

  const handleClose = () => {
    setSearchQuery('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            Cuộc trò chuyện mới
          </DialogTitle>
          <DialogDescription>
            Chọn người bạn muốn trò chuyện
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm người dùng..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 rounded-xl"
            />
          </div>

          {/* User list */}
          <ScrollArea className="h-64">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Users className="w-10 h-10 mb-2 opacity-50" />
                <p>Không tìm thấy người dùng</p>
              </div>
            ) : (
              <div className="space-y-1">
                {users.map((userItem) => (
                  <button
                    key={userItem.id}
                    onClick={() => handleDirectChat(userItem.id)}
                    disabled={creatingUserId !== null}
                    className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all hover:bg-muted ${
                      creatingUserId !== null ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={userItem.avatar_url || undefined} />
                      <AvatarFallback className="gradient-accent text-white font-semibold">
                        {userItem.display_name?.slice(0, 2).toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-left">
                      <p className="font-medium">{userItem.display_name}</p>
                      <p className="text-sm text-muted-foreground">@{userItem.username}</p>
                    </div>
                    {creatingUserId === userItem.id && (
                      <Loader2 className="ml-auto w-5 h-5 animate-spin text-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="w-full">
            Hủy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
