import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useConversations } from '@/hooks/useConversations';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCallSignaling } from '@/hooks/useCallSignaling';
import ConversationList from '@/components/chat/ConversationList';
import ChatWindow from '@/components/chat/ChatWindow';
import NewChatDialog from '@/components/chat/NewChatDialog';
import VideoCallModal from '@/components/chat/VideoCallModal';
import { IncomingCallModal } from '@/components/chat/IncomingCallModal';
import { MessageCircle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Chat() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const { conversations, loading: convsLoading, createConversation } = useConversations();
  const isMobile = useIsMobile();
  
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);

  // Call signaling
  const {
    incomingCall,
    activeCall,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
  } = useCallSignaling();

  // Derive selectedConversation from ID
  const selectedConversation = selectedConversationId 
    ? conversations.find(c => c.id === selectedConversationId) || null 
    : null;

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  const handleNewChat = async (memberIds: string[], name?: string, isGroup?: boolean) => {
    const result = await createConversation(memberIds, name, isGroup);
    if (result.data) {
      setSelectedConversationId(result.data.id);
    }
  };

  const handleVideoCall = async () => {
    if (!selectedConversation) return;
    await startCall(selectedConversation.id, 'video');
  };

  const handleVoiceCall = async () => {
    if (!selectedConversation) return;
    await startCall(selectedConversation.id, 'voice');
  };

  const handleAcceptCall = async () => {
    if (incomingCall) {
      await acceptCall(incomingCall.id);
    }
  };

  const handleRejectCall = async () => {
    if (incomingCall) {
      await rejectCall(incomingCall.id);
    }
  };

  const handleEndCall = async () => {
    await endCall();
  };

  const getParticipantInfo = () => {
    const conv = activeCall 
      ? conversations.find(c => c.id === activeCall.conversation_id) 
      : selectedConversation;
    
    if (!conv) return { name: '', avatar: undefined };
    
    if (conv.is_group) {
      return { 
        name: conv.name || 'Nhóm chat', 
        avatar: conv.avatar_url || undefined 
      };
    }
    
    const otherMember = conv.members?.find(m => m.user_id !== profile?.id);
    return { 
      name: otherMember?.profile?.display_name || otherMember?.profile?.username || 'Unknown',
      avatar: otherMember?.profile?.avatar_url || undefined
    };
  };

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center gradient-chat">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-3d animate-float mx-auto mb-4">
            <MessageCircle className="w-8 h-8 text-primary-foreground" />
          </div>
          <p className="text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden relative">
      {/* Sidebar - Conversation List */}
      <div className={cn(
        "border-r flex-shrink-0 transition-transform duration-300 ease-out",
        isMobile 
          ? cn(
              "absolute inset-0 w-full z-10 bg-background",
              selectedConversation ? "-translate-x-full" : "translate-x-0"
            )
          : "w-80 lg:w-96"
      )}>
        <ConversationList
          conversations={conversations}
          selectedId={selectedConversationId}
          onSelect={(conv) => setSelectedConversationId(conv.id)}
          onNewChat={() => setShowNewChat(true)}
        />
      </div>

      {/* Main Chat Area */}
      <div className={cn(
        "flex-1 flex flex-col transition-transform duration-300 ease-out",
        isMobile && cn(
          "absolute inset-0 w-full bg-background",
          selectedConversation ? "translate-x-0" : "translate-x-full"
        )
      )}>
        {selectedConversation ? (
          <ChatWindow
            conversation={selectedConversation}
            conversations={conversations}
            onVideoCall={handleVideoCall}
            onVoiceCall={handleVoiceCall}
            onBack={isMobile ? () => setSelectedConversationId(null) : undefined}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gradient-chat">
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-3xl gradient-primary flex items-center justify-center shadow-float animate-float">
                <MessageCircle className="w-12 h-12 text-primary-foreground" />
              </div>
              <Sparkles 
                className="absolute -top-3 -right-3 w-8 h-8" 
                style={{ color: 'hsl(var(--fun-yellow))' }} 
              />
            </div>
            
            <h2 className="text-2xl font-bold text-gradient mb-2">FunChat</h2>
            <p className="text-muted-foreground text-center max-w-sm">
              Chọn một cuộc trò chuyện hoặc bắt đầu cuộc trò chuyện mới để nhắn tin
            </p>
            
            <div className="flex flex-wrap justify-center gap-3 mt-8">
              <div className="px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
                💬 Nhắn tin
              </div>
              <div className="px-4 py-2 rounded-full bg-secondary/10 text-secondary text-sm font-medium">
                📹 Video Call
              </div>
              <div className="px-4 py-2 rounded-full gradient-warm text-white text-sm font-medium">
                💰 Gửi Crypto
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New Chat Dialog */}
      <NewChatDialog
        open={showNewChat}
        onClose={() => setShowNewChat(false)}
        onCreate={handleNewChat}
      />

      {/* Incoming Call Modal */}
      {incomingCall && (
        <IncomingCallModal
          call={incomingCall}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      )}

      {/* Video/Voice Call Modal - key forces remount on new call */}
      <VideoCallModal
        key={activeCall?.channel_name || 'no-call'}
        open={!!activeCall}
        onClose={handleEndCall}
        callType={activeCall?.call_type || 'video'}
        participantName={getParticipantInfo().name}
        participantAvatar={getParticipantInfo().avatar}
        isGroup={selectedConversation?.is_group}
        channelName={activeCall?.channel_name}
      />
    </div>
  );
}
