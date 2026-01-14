import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { format, formatDistanceToNow, isToday, isYesterday, isThisWeek } from 'date-fns';
import { vi } from 'date-fns/locale';
import { 
  Phone, 
  Video, 
  Search, 
  PhoneIncoming, 
  PhoneOutgoing, 
  PhoneMissed,
  UserPlus,
  Lock,
  PhoneCall
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DialPad } from '@/components/call/DialPad';
import { PhoneCallDialog } from '@/components/call/PhoneCallDialog';
import { useUserSearch } from '@/hooks/useUserSearch';
import { toast } from 'sonner';

interface CallRecord {
  id: string;
  call_type: 'video' | 'voice';
  caller_id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  conversation: {
    id: string;
    name: string | null;
    is_group: boolean;
    members: Array<{
      user_id: string;
      profile: {
        id: string;
        username: string;
        display_name: string | null;
        avatar_url: string | null;
        phone_number?: string | null;
      } | null;
    }>;
  } | null;
}

interface CallHistoryProps {
  onStartCall?: (conversationId: string, callType: 'video' | 'voice') => void;
}

export default function CallHistory({ onStartCall }: CallHistoryProps) {
  const { profile } = useAuth();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // DialPad state
  const [showDialPad, setShowDialPad] = useState(false);
  const [showCallConfirm, setShowCallConfirm] = useState(false);
  const [foundProfile, setFoundProfile] = useState<any>(null);
  const [pendingCallType, setPendingCallType] = useState<'voice' | 'video'>('voice');
  const [isConnecting, setIsConnecting] = useState(false);
  
  // User search state
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  
  const { searchUsers, isSearching, error: searchError, clearError } = useUserSearch();

  useEffect(() => {
    const fetchCalls = async () => {
      if (!profile?.id) return;

      const { data, error } = await supabase
        .from('call_sessions')
        .select(`
          id,
          call_type,
          caller_id,
          status,
          created_at,
          started_at,
          ended_at,
          conversation_id
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        // Fetch conversation details separately
        const callsWithConversations = await Promise.all(
          data.map(async (call) => {
            const { data: convData } = await supabase
              .from('conversations')
              .select(`
                id,
                name,
                is_group
              `)
              .eq('id', call.conversation_id)
              .single();

            const { data: membersData } = await supabase
              .from('conversation_members')
              .select('user_id')
              .eq('conversation_id', call.conversation_id);

            let members: CallRecord['conversation']['members'] = [];
            if (membersData) {
              const profilesPromises = membersData.map(async (m) => {
                const { data: profileData } = await supabase
                  .from('profiles')
                  .select('id, username, display_name, avatar_url, phone_number')
                  .eq('id', m.user_id)
                  .single();
                return {
                  user_id: m.user_id,
                  profile: profileData
                };
              });
              members = await Promise.all(profilesPromises);
            }

            return {
              ...call,
              call_type: call.call_type as 'video' | 'voice',
              conversation: convData ? {
                ...convData,
                members
              } : null
            } as CallRecord;
          })
        );

        setCalls(callsWithConversations);
      }
      setLoading(false);
    };

    fetchCalls();
  }, [profile?.id]);

  const getCallInfo = (call: CallRecord) => {
    const isOutgoing = call.caller_id === profile?.id;
    const isMissed = call.status === 'missed' || call.status === 'rejected';
    
    let icon = PhoneOutgoing;
    let iconColor = 'text-green-500';
    let statusText = 'Đi';
    
    if (!isOutgoing) {
      if (isMissed) {
        icon = PhoneMissed;
        iconColor = 'text-destructive';
        statusText = 'Nhỡ';
      } else {
        icon = PhoneIncoming;
        iconColor = 'text-blue-500';
        statusText = 'Đến';
      }
    }

    return { icon, iconColor, isOutgoing, isMissed, statusText };
  };

  const getContactInfo = (call: CallRecord) => {
    if (!call.conversation) {
      return { name: 'Unknown', avatar: undefined, phone: undefined };
    }

    if (call.conversation.is_group) {
      return { 
        name: call.conversation.name || 'Nhóm', 
        avatar: undefined,
        phone: undefined
      };
    }

    const otherMember = call.conversation.members?.find(
      m => m.user_id !== profile?.id
    );
    
    return {
      name: otherMember?.profile?.display_name || otherMember?.profile?.username || 'Unknown',
      avatar: otherMember?.profile?.avatar_url,
      phone: otherMember?.profile?.phone_number
    };
  };

  const formatCallDate = (dateStr: string) => {
    const date = new Date(dateStr);
    
    if (isToday(date)) {
      return format(date, 'HH:mm');
    } else if (isYesterday(date)) {
      return 'Hôm qua';
    } else if (isThisWeek(date)) {
      return format(date, 'EEEE', { locale: vi });
    } else {
      return format(date, 'dd/MM/yyyy');
    }
  };

  // Debounced user search (supports phone, username, display_name)
  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    
    // Reset if query is too short (minimum 2 characters)
    if (trimmedQuery.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    
    // Debounce the search
    const timer = setTimeout(async () => {
      clearError();
      const results = await searchUsers(searchQuery);
      // Filter out current user from results
      const filteredResults = results.filter(user => user.id !== profile?.id);
      setSearchResults(filteredResults);
      setHasSearched(true);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, profile?.id]);

  const filteredCalls = calls.filter(call => {
    const { name, phone } = getContactInfo(call);
    const query = searchQuery.toLowerCase();
    return name.toLowerCase().includes(query) || 
           (phone && phone.includes(searchQuery));
  });

  // Handle call from search result
  const handleCallFromSearch = (searchedProfile: any, callType: 'voice' | 'video') => {
    if (searchedProfile.id === profile?.id) {
      toast.error('Không thể gọi cho chính mình');
      return;
    }
    setFoundProfile(searchedProfile);
    setPendingCallType(callType);
    setShowCallConfirm(true);
  };

  // Handle phone dial
  const handlePhoneDial = async (phoneNumber: string, callType: 'voice' | 'video') => {
    clearError();
    
    // Check if calling self - use type assertion since phone_number is new column
    const currentPhoneNumber = (profile as any)?.phone_number;
    if (currentPhoneNumber === phoneNumber) {
      toast.error('Không thể gọi cho chính mình');
      return;
    }
    
    const results = await searchUsers(phoneNumber);
    const result = results.length > 0 ? results[0] : null;
    
    if (result) {
      if (result.id === profile?.id) {
        toast.error('Không thể gọi cho chính mình');
        return;
      }
      setFoundProfile(result);
      setPendingCallType(callType);
      setShowDialPad(false);
      setShowCallConfirm(true);
    } else if (searchError) {
      toast.error(searchError);
    }
  };

  // Handle confirm call
  const handleConfirmCall = async () => {
    if (!foundProfile || !onStartCall) return;
    
    setIsConnecting(true);
    
    try {
      // Find or create conversation with this user
      const { data: existingConv } = await supabase
        .from('conversations')
        .select(`
          id,
          conversation_members!inner(user_id)
        `)
        .eq('is_group', false)
        .eq('conversation_members.user_id', foundProfile.id)
        .limit(1)
        .single();

      let conversationId: string;

      if (existingConv) {
        conversationId = existingConv.id;
      } else {
        // Create new conversation
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            is_group: false,
            created_by: profile?.id
          })
          .select()
          .single();

        if (convError) throw convError;

        // Add both members
        await supabase
          .from('conversation_members')
          .insert([
            { conversation_id: newConv.id, user_id: profile?.id },
            { conversation_id: newConv.id, user_id: foundProfile.id }
          ]);

        conversationId = newConv.id;
      }

      // Start the call
      onStartCall(conversationId, pendingCallType);
      setShowCallConfirm(false);
      setFoundProfile(null);
    } catch (err: any) {
      console.error('Error starting call:', err);
      toast.error('Không thể bắt đầu cuộc gọi');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleAddFavourite = () => {
    toast.info('Tính năng yêu thích sẽ sớm ra mắt');
  };

  return (
    <div className="h-full w-full flex flex-col bg-sidebar">
      {/* Header - WhatsApp style */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Cuộc gọi</h2>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setShowDialPad(true)}
            className="h-9 w-9 rounded-full hover:bg-muted"
          >
            <PhoneCall className="w-5 h-5 text-primary" />
          </Button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Tìm tên hoặc số điện thoại"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10 rounded-xl bg-muted/50 border-0"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {/* Search Result Section */}
        {hasSearched && searchQuery.trim().length >= 2 && (
          <div className="px-2 py-3">
            <p className="text-sm text-muted-foreground mb-2 px-2">
              Kết quả tìm kiếm {searchResults.length > 0 && `(${searchResults.length})`}
            </p>
            
            {isSearching ? (
              <div className="flex items-center gap-3 p-2">
                <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
                <span className="text-sm text-muted-foreground">Đang tìm kiếm...</span>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="space-y-1">
                {searchResults.map((user) => (
                  <div 
                    key={user.id}
                    className="w-full p-2 rounded-lg flex items-center gap-3 hover:bg-muted/50 transition-colors"
                  >
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback className="gradient-accent text-white text-sm font-semibold">
                        {(user.display_name || user.username).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left min-w-0">
                      <span className="font-medium block truncate">
                        {user.display_name || user.username}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        @{user.username}{user.phone_number && ` • ${user.phone_number}`}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-9 w-9 rounded-full hover:bg-primary/10"
                        onClick={() => handleCallFromSearch(user, 'voice')}
                      >
                        <Phone className="w-4 h-4 text-primary" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-9 w-9 rounded-full hover:bg-primary/10"
                        onClick={() => handleCallFromSearch(user, 'video')}
                      >
                        <Video className="w-4 h-4 text-primary" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-2 text-sm text-muted-foreground">
                Không tìm thấy người dùng
              </div>
            )}
            
            <Separator className="mt-3 mx-2" />
          </div>
        )}

        {/* Favourites Section */}
        <div className="px-2 py-3">
          <p className="text-sm text-muted-foreground mb-2 px-2">Ưa thích</p>
          <button 
            onClick={handleAddFavourite}
            className="flex items-center gap-3 p-2 w-full hover:bg-muted rounded-lg transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-primary" />
            </div>
            <span className="text-sm font-medium">Thêm yêu thích</span>
          </button>
        </div>

        <Separator className="mx-4" />

        {/* Recent Section */}
        <div className="px-2 py-3">
          <p className="text-sm text-muted-foreground mb-2 px-2">Gần đây</p>
          
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Chưa có cuộc gọi nào</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredCalls.map((call) => {
                const { icon: StatusIcon, iconColor, isMissed, statusText } = getCallInfo(call);
                const { name, avatar, phone } = getContactInfo(call);
                const displayName = phone && !name.includes(phone) ? phone : name;

                return (
                  <button
                    key={call.id}
                    className="w-full p-2 rounded-lg flex items-center gap-3 hover:bg-muted transition-colors"
                    onClick={() => {
                      if (call.conversation && onStartCall) {
                        onStartCall(call.conversation.id, call.call_type);
                      }
                    }}
                  >
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={avatar || undefined} />
                      <AvatarFallback className="gradient-accent text-white text-sm font-semibold">
                        {name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn(
                          "font-medium truncate",
                          isMissed && "text-destructive"
                        )}>
                          {displayName}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatCallDate(call.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-sm">
                        <StatusIcon className={cn("w-4 h-4", iconColor)} />
                        <span className={cn(
                          "text-muted-foreground",
                          isMissed && "text-destructive"
                        )}>
                          {statusText}
                        </span>
                        {call.call_type === 'video' && (
                          <Video className="w-3 h-3 ml-1 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer - Encryption notice */}
      <div className="p-4 text-center border-t border-sidebar-border">
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          <Lock className="w-3 h-3" />
          Cuộc gọi của bạn được <span className="text-primary">mã hóa đầu cuối</span>
        </p>
      </div>

      {/* DialPad Dialog */}
      <Dialog open={showDialPad} onOpenChange={setShowDialPad}>
        <DialogContent className="sm:max-w-md p-0 h-[600px] max-h-[90vh]">
          <DialPad
            onCall={handlePhoneDial}
            onClose={() => setShowDialPad(false)}
            isSearching={isSearching}
          />
        </DialogContent>
      </Dialog>

      {/* Call Confirmation Dialog */}
      <PhoneCallDialog
        open={showCallConfirm}
        onOpenChange={setShowCallConfirm}
        profile={foundProfile}
        callType={pendingCallType}
        onConfirmCall={handleConfirmCall}
        isLoading={isConnecting}
      />
    </div>
  );
}
