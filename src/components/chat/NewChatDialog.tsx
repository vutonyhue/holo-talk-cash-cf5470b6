import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Profile } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Search, Users, MessageCircle } from 'lucide-react';

interface NewChatDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (memberIds: string[], name?: string, isGroup?: boolean) => Promise<void>;
}

export default function NewChatDialog({ open, onClose, onCreate }: NewChatDialogProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isGroup, setIsGroup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

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

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleCreate = async () => {
    if (selectedUsers.length === 0) return;

    setCreating(true);
    await onCreate(selectedUsers, isGroup ? groupName : undefined, isGroup || selectedUsers.length > 1);
    setCreating(false);
    
    // Reset state
    setSelectedUsers([]);
    setGroupName('');
    setIsGroup(false);
    setSearchQuery('');
    onClose();
  };

  const handleClose = () => {
    setSelectedUsers([]);
    setGroupName('');
    setIsGroup(false);
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

          {/* Group option */}
          {selectedUsers.length > 1 && (
            <div className="space-y-3 p-3 rounded-xl bg-muted/50">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="isGroup" 
                  checked={isGroup}
                  onCheckedChange={(checked) => setIsGroup(checked as boolean)}
                />
                <Label htmlFor="isGroup" className="flex items-center gap-2 cursor-pointer">
                  <Users className="w-4 h-4" />
                  Tạo nhóm chat
                </Label>
              </div>
              
              {isGroup && (
                <Input
                  placeholder="Tên nhóm..."
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="h-10"
                />
              )}
            </div>
          )}

          {/* Selected users */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedUsers.map(userId => {
                const selectedUser = users.find(u => u.id === userId);
                return (
                  <div 
                    key={userId}
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-sm"
                  >
                    <span>{selectedUser?.display_name || selectedUser?.username}</span>
                    <button 
                      onClick={() => toggleUser(userId)}
                      className="w-4 h-4 rounded-full hover:bg-primary/20 flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}

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
                    onClick={() => toggleUser(userItem.id)}
                    className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all ${
                      selectedUsers.includes(userItem.id)
                        ? 'bg-primary/10 ring-2 ring-primary'
                        : 'hover:bg-muted'
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
                    {selectedUsers.includes(userItem.id) && (
                      <div className="ml-auto w-5 h-5 rounded-full gradient-primary flex items-center justify-center">
                        <span className="text-white text-xs">✓</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="flex-1">
            Hủy
          </Button>
          <Button 
            onClick={handleCreate}
            disabled={selectedUsers.length === 0 || creating}
            className="flex-1 gradient-primary btn-3d"
          >
            {creating ? 'Đang tạo...' : 'Bắt đầu chat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
