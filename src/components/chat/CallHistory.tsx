import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { 
  Phone, 
  Video, 
  Search, 
  PhoneIncoming, 
  PhoneOutgoing, 
  PhoneMissed,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
      } | null;
    }>;
  } | null;
}

export default function CallHistory() {
  const { profile } = useAuth();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

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
                  .select('id, username, display_name, avatar_url')
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
    
    if (!isOutgoing) {
      icon = isMissed ? PhoneMissed : PhoneIncoming;
      iconColor = isMissed ? 'text-destructive' : 'text-blue-500';
    }

    return { icon, iconColor, isOutgoing, isMissed };
  };

  const getContactInfo = (call: CallRecord) => {
    if (!call.conversation) {
      return { name: 'Unknown', avatar: undefined };
    }

    if (call.conversation.is_group) {
      return { 
        name: call.conversation.name || 'Nhóm', 
        avatar: undefined 
      };
    }

    const otherMember = call.conversation.members?.find(
      m => m.user_id !== profile?.id
    );
    
    return {
      name: otherMember?.profile?.display_name || otherMember?.profile?.username || 'Unknown',
      avatar: otherMember?.profile?.avatar_url
    };
  };

  const getCallDuration = (call: CallRecord) => {
    if (!call.started_at || !call.ended_at) return null;
    
    const start = new Date(call.started_at).getTime();
    const end = new Date(call.ended_at).getTime();
    const duration = Math.floor((end - start) / 1000);
    
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const filteredCalls = calls.filter(call => {
    const { name } = getContactInfo(call);
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="h-full flex flex-col bg-sidebar">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <h2 className="text-xl font-bold mb-4">Cuộc gọi</h2>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm cuộc gọi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10 rounded-xl bg-muted/50 border-0"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
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
            <div className="space-y-1">
              {filteredCalls.map((call) => {
                const { icon: StatusIcon, iconColor, isMissed } = getCallInfo(call);
                const { name, avatar } = getContactInfo(call);
                const duration = getCallDuration(call);

                return (
                  <button
                    key={call.id}
                    className="w-full p-3 rounded-xl flex items-center gap-3 hover:bg-sidebar-accent/50 transition-colors"
                  >
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={avatar || undefined} />
                      <AvatarFallback className="gradient-accent text-white font-semibold">
                        {name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-semibold truncate",
                          isMissed && "text-destructive"
                        )}>
                          {name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <StatusIcon className={cn("w-4 h-4", iconColor)} />
                        <span>
                          {formatDistanceToNow(new Date(call.created_at), {
                            addSuffix: true,
                            locale: vi
                          })}
                        </span>
                        {duration && (
                          <>
                            <span>•</span>
                            <Clock className="w-3 h-3" />
                            <span>{duration}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center",
                      "bg-primary/10 text-primary"
                    )}>
                      {call.call_type === 'video' ? (
                        <Video className="w-4 h-4" />
                      ) : (
                        <Phone className="w-4 h-4" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
