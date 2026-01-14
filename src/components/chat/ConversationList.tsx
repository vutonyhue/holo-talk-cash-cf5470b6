import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Conversation } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { 
  MessageCircle, 
  Plus, 
  Search, 
  MoreVertical,
  Users,
  Star,
  CheckSquare,
  CheckCheck,
  Lock,
  LogOut
} from 'lucide-react';
import { toast } from 'sonner';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
  onNewChat: () => void;
}

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onNewChat,
}: ConversationListProps) {
  const { profile, signOut } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  const handleLogout = async () => {
    await signOut();
    toast.success('Đã đăng xuất');
  };

  const handleMarkAllAsRead = () => {
    toast.success('Đã đánh dấu tất cả là đã đọc');
  };

  const handleCreateGroup = () => {
    onNewChat();
    toast.info('Tạo nhóm mới - chọn nhiều người để tạo nhóm');
  };

  const getConversationName = (conv: Conversation) => {
    if (conv.is_group && conv.name) return conv.name;
    
    const otherMember = conv.members?.find(m => m.user_id !== profile?.id);
    return otherMember?.profile?.display_name || otherMember?.profile?.username || 'Unknown';
  };

  const getConversationAvatar = (conv: Conversation) => {
    if (conv.is_group) return conv.avatar_url;
    
    const otherMember = conv.members?.find(m => m.user_id !== profile?.id);
    return otherMember?.profile?.avatar_url;
  };

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };

  const filteredConversations = conversations.filter(conv => {
    const name = getConversationName(conv).toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="h-full w-full flex flex-col bg-sidebar">
      {/* Header - WhatsApp style */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Đoạn chat</h2>
          
          <div className="flex items-center gap-1">
            {/* New chat button */}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onNewChat}
              className="h-9 w-9 rounded-full hover:bg-muted"
            >
              <Plus className="w-5 h-5" />
            </Button>
            
            {/* More options menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-9 w-9 rounded-full hover:bg-muted"
                >
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-popover">
                <DropdownMenuItem onClick={handleCreateGroup} className="cursor-pointer">
                  <Users className="w-4 h-4 mr-3" />
                  Nhóm mới
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  <Star className="w-4 h-4 mr-3" />
                  Tin nhắn đánh dấu
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  <CheckSquare className="w-4 h-4 mr-3" />
                  Chọn cuộc trò chuyện
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleMarkAllAsRead} className="cursor-pointer">
                  <CheckCheck className="w-4 h-4 mr-3" />
                  Đánh dấu đã đọc tất cả
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer">
                  <Lock className="w-4 h-4 mr-3" />
                  Khóa ứng dụng
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="w-4 h-4 mr-3" />
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm cuộc trò chuyện..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10 rounded-xl bg-muted/50 border-0"
          />
        </div>
      </div>

      {/* Conversation List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredConversations.map((conv) => {
            const name = getConversationName(conv);
            const avatar = getConversationAvatar(conv);
            const isSelected = selectedId === conv.id;

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all duration-200 ${
                  isSelected 
                    ? 'bg-sidebar-accent shadow-card' 
                    : 'hover:bg-sidebar-accent/50'
                }`}
              >
                <Avatar className="w-12 h-12 ring-2 ring-offset-2 ring-offset-sidebar ring-primary/20">
                  <AvatarImage src={avatar || undefined} />
                  <AvatarFallback className={`font-semibold ${
                    conv.is_group ? 'gradient-warm' : 'gradient-accent'
                  } text-white`}>
                    {getInitials(name)}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold truncate ${isSelected ? 'text-sidebar-accent-foreground' : ''}`}>
                      {name}
                    </span>
                    {conv.last_message && (
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(conv.last_message.created_at), { 
                          addSuffix: false,
                          locale: vi 
                        })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {conv.last_message?.content || 'Chưa có tin nhắn'}
                  </p>
                </div>
              </button>
            );
          })}

          {filteredConversations.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Chưa có cuộc trò chuyện nào</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
