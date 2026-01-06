import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Profile } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Search, Users, Loader2, UsersRound, X, ArrowLeft } from 'lucide-react';

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
  
  // Group chat states
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [selectedUsers, setSelectedUsers] = useState<Profile[]>([]);
  const [groupName, setGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

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
    resetState();
    onClose();
  };

  const toggleUserSelection = (userItem: Profile) => {
    setSelectedUsers(prev => {
      const isSelected = prev.some(u => u.id === userItem.id);
      if (isSelected) {
        return prev.filter(u => u.id !== userItem.id);
      } else {
        return [...prev, userItem];
      }
    });
  };

  const removeSelectedUser = (userId: string) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== userId));
  };

  const handleCreateGroup = async () => {
    if (selectedUsers.length < 2 || !groupName.trim()) return;
    
    setCreatingGroup(true);
    const memberIds = selectedUsers.map(u => u.id);
    await onCreate(memberIds, groupName.trim(), true);
    setCreatingGroup(false);
    
    resetState();
    onClose();
  };

  const resetState = () => {
    setSearchQuery('');
    setSelectedUsers([]);
    setGroupName('');
    setMode('direct');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleBackToDirectMode = () => {
    setMode('direct');
    setSelectedUsers([]);
    setGroupName('');
  };

  const isUserSelected = (userId: string) => selectedUsers.some(u => u.id === userId);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-0 gap-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-3 text-xl font-bold">
            {mode === 'group' && (
              <button 
                onClick={handleBackToDirectMode}
                className="p-1 hover:bg-muted rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            {mode === 'direct' ? 'Tin nhắn mới' : 'Tạo nhóm mới'}
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Tìm tên hoặc username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 rounded-full border-muted-foreground/30"
            />
          </div>

          {/* Create group link (Direct mode only) */}
          {mode === 'direct' && (
            <button 
              onClick={() => setMode('group')}
              className="flex items-center gap-3 w-full py-3 text-primary hover:bg-muted/50 rounded-lg transition-colors px-2"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <UsersRound className="w-5 h-5 text-primary" />
              </div>
              <span className="font-medium">Tạo nhóm</span>
            </button>
          )}

          {/* Selected users badges (Group mode only) */}
          {mode === 'group' && selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-2">
              {selectedUsers.map(u => (
                <Badge 
                  key={u.id} 
                  variant="secondary" 
                  className="flex items-center gap-1 pr-1 rounded-full"
                >
                  {u.display_name}
                  <button 
                    onClick={() => removeSelectedUser(u.id)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
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
              <div className="divide-y divide-border">
                {users.map((userItem) => (
                  <button
                    key={userItem.id}
                    onClick={() => mode === 'direct' ? handleDirectChat(userItem.id) : toggleUserSelection(userItem)}
                    disabled={mode === 'direct' && creatingUserId !== null}
                    className={`w-full py-3 px-2 flex items-center gap-3 transition-all hover:bg-muted/50 ${
                      mode === 'direct' && creatingUserId !== null ? 'opacity-50 cursor-not-allowed' : ''
                    } ${mode === 'group' && isUserSelected(userItem.id) ? 'bg-primary/5' : ''}`}
                  >
                    {mode === 'group' && (
                      <Checkbox 
                        checked={isUserSelected(userItem.id)}
                        className="pointer-events-none"
                      />
                    )}
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={userItem.avatar_url || undefined} />
                      <AvatarFallback className="bg-muted text-foreground font-semibold">
                        {userItem.display_name?.slice(0, 2).toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-left flex-1 min-w-0">
                      <p className="font-semibold truncate">{userItem.display_name}</p>
                      <p className="text-sm text-muted-foreground truncate">@{userItem.username}</p>
                    </div>
                    {mode === 'direct' && creatingUserId === userItem.id && (
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Group name input (Group mode only) */}
          {mode === 'group' && (
            <div className="space-y-3 pt-3 border-t">
              <Input
                placeholder="Tên nhóm..."
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="h-11 rounded-full"
              />
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Đã chọn: {selectedUsers.length} người {selectedUsers.length < 2 && '(cần ít nhất 2)'}
                </p>
                <Button 
                  onClick={handleCreateGroup}
                  disabled={selectedUsers.length < 2 || !groupName.trim() || creatingGroup}
                  className="rounded-full"
                  size="sm"
                >
                  {creatingGroup ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Đang tạo...
                    </>
                  ) : (
                    'Tạo nhóm'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}