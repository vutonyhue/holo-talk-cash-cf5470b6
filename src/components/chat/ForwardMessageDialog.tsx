import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Send, Loader2 } from 'lucide-react';
import { Conversation, Message } from '@/types';
import { useAuth } from '@/hooks/useAuth';

interface ForwardMessageDialogProps {
  open: boolean;
  onClose: () => void;
  message: Message | null;
  conversations: Conversation[];
  onForward: (conversationIds: string[], message: Message) => Promise<void>;
}

export default function ForwardMessageDialog({
  open,
  onClose,
  message,
  conversations,
  onForward,
}: ForwardMessageDialogProps) {
  const { profile } = useAuth();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);

  const getConversationName = (conv: Conversation) => {
    if (conv.is_group) return conv.name;
    const otherMember = conv.members?.find(m => m.user_id !== profile?.id);
    return otherMember?.profile?.display_name || otherMember?.profile?.username || 'Unknown';
  };

  const getConversationAvatar = (conv: Conversation) => {
    if (conv.is_group) return conv.avatar_url;
    const otherMember = conv.members?.find(m => m.user_id !== profile?.id);
    return otherMember?.profile?.avatar_url;
  };

  const filteredConversations = conversations.filter(conv => {
    const name = getConversationName(conv)?.toLowerCase() || '';
    return name.includes(search.toLowerCase());
  });

  const toggleSelection = (convId: string) => {
    setSelectedIds(prev =>
      prev.includes(convId)
        ? prev.filter(id => id !== convId)
        : [...prev, convId]
    );
  };

  const handleForward = async () => {
    if (!message || selectedIds.length === 0) return;
    
    setSending(true);
    await onForward(selectedIds, message);
    setSending(false);
    setSelectedIds([]);
    setSearch('');
    onClose();
  };

  const handleClose = () => {
    if (!sending) {
      setSelectedIds([]);
      setSearch('');
      onClose();
    }
  };

  const getMessagePreview = () => {
    if (!message) return '';
    if (message.message_type === 'image') return '📷 Hình ảnh';
    if (message.message_type === 'file') return '📎 File';
    if (message.message_type === 'crypto') return '💰 Crypto';
    return message.content?.slice(0, 100) || '';
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chuyển tiếp tin nhắn</DialogTitle>
        </DialogHeader>

        {/* Message Preview */}
        <div className="p-3 bg-muted/50 rounded-lg border">
          <p className="text-xs text-muted-foreground mb-1">Tin nhắn sẽ chuyển tiếp:</p>
          <p className="text-sm truncate">{getMessagePreview()}</p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm cuộc trò chuyện..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Conversation List */}
        <ScrollArea className="h-[300px] -mx-2 px-2">
          <div className="space-y-1">
            {filteredConversations.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Không tìm thấy cuộc trò chuyện
              </p>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = selectedIds.includes(conv.id);
                const name = getConversationName(conv);
                const avatar = getConversationAvatar(conv);

                return (
                  <div
                    key={conv.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => toggleSelection(conv.id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelection(conv.id)}
                    />
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={avatar || undefined} />
                      <AvatarFallback className={`font-semibold text-white ${
                        conv.is_group ? 'gradient-warm' : 'gradient-primary'
                      }`}>
                        {name?.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        {conv.is_group
                          ? `${conv.members?.length} thành viên`
                          : 'Chat riêng'}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-sm text-muted-foreground">
            Đã chọn: {selectedIds.length}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={sending}>
              Hủy
            </Button>
            <Button
              onClick={handleForward}
              disabled={selectedIds.length === 0 || sending}
              className="gradient-primary"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Gửi
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
