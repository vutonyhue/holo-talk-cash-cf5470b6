import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useConversations } from '@/hooks/useConversations';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCallSignaling } from '@/hooks/useCallSignaling';
import AppSidebar from '@/components/layout/AppSidebar';
import BottomNav from '@/components/layout/BottomNav';
import ComingSoon from '@/components/layout/ComingSoon';
import ConversationList from '@/components/chat/ConversationList';
import ChatWindow from '@/components/chat/ChatWindow';
import CallHistory from '@/components/chat/CallHistory';
import SettingsMenu from '@/components/settings/SettingsMenu';
import NewChatDialog from '@/components/chat/NewChatDialog';
import VideoCallModal from '@/components/chat/VideoCallModal';
import { IncomingCallModal } from '@/components/chat/IncomingCallModal';
import { MessageCircle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

type SidebarTab = 'chat' | 'calls' | 'community' | 'ai' | 'settings';
type MobileTab = 'chat' | 'calls' | 'rewards' | 'settings' | 'profile';

export default function Chat() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, loading: authLoading, isEmailVerified } = useAuth();
  const { conversations, loading: convsLoading, createConversation, deleteConversation } = useConversations();
  const isMobile = useIsMobile();
  
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>('chat');
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');

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
    } else if (!authLoading && user && !isEmailVerified) {
      navigate('/verify-email');
    }
  }, [user, authLoading, isEmailVerified, navigate]);

  // Auto-select conversation when navigated from UserProfile
  useEffect(() => {
    const stateConversationId = (location.state as { conversationId?: string })?.conversationId;
    if (stateConversationId && !convsLoading) {
      setSelectedConversationId(stateConversationId);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, convsLoading]);

  // Handle mobile tab navigation
  const handleMobileTabChange = (tab: MobileTab) => {
    if (tab === 'rewards') {
      navigate('/rewards');
      return;
    }
    if (tab === 'profile') {
      navigate('/profile');
      return;
    }
    setMobileTab(tab);
    // Sync with sidebar tab
    if (tab === 'chat') setActiveTab('chat');
    if (tab === 'calls') setActiveTab('calls');
    if (tab === 'settings') setActiveTab('settings');
  };

  const handleNewChat = async (memberIds: string[], name?: string, isGroup?: boolean) => {
    const result = await createConversation(memberIds, name, isGroup);
    if (result.data) {
      setSelectedConversationId(result.data.id);
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    await deleteConversation(conversationId);
    if (selectedConversationId === conversationId) {
      setSelectedConversationId(null);
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

  // Render content panel based on active tab
  const renderContentPanel = () => {
    switch (activeTab) {
      case 'chat':
        return (
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversationId}
            onSelect={(conv) => setSelectedConversationId(conv.id)}
            onNewChat={() => setShowNewChat(true)}
          />
        );
      case 'calls':
        return <CallHistory />;
      case 'settings':
        return <SettingsMenu />;
      case 'community':
        return <ComingSoon type="community" />;
      case 'ai':
        return <ComingSoon type="ai" />;
      default:
        return null;
    }
  };

  // Render main view based on active tab
  const renderMainView = () => {
    // For community and ai tabs, show coming soon in main view too
    if (activeTab === 'community' || activeTab === 'ai') {
      return (
        <div className="flex-1 flex items-center justify-center gradient-chat">
          <div className="text-center max-w-md p-8">
            <div className="w-24 h-24 rounded-3xl gradient-primary flex items-center justify-center shadow-float animate-float mx-auto mb-6">
              <Sparkles className="w-12 h-12 text-primary-foreground" />
            </div>
            <h2 className="text-2xl font-bold text-gradient mb-2">
              {activeTab === 'community' ? 'Cộng đồng FunChat' : 'Meta AI'}
            </h2>
            <p className="text-muted-foreground">
              {activeTab === 'community' 
                ? 'Tính năng cộng đồng đang được phát triển. Bạn sẽ có thể tham gia nhóm và kênh sớm!' 
                : 'Trợ lý AI thông minh sẽ sớm có mặt để hỗ trợ bạn!'}
            </p>
          </div>
        </div>
      );
    }

    // For settings, show a placeholder or the settings content
    if (activeTab === 'settings') {
      return (
        <div className="flex-1 flex items-center justify-center gradient-chat">
          <div className="text-center max-w-md p-8">
            <div className="w-24 h-24 rounded-3xl gradient-accent flex items-center justify-center shadow-float animate-float mx-auto mb-6">
              <MessageCircle className="w-12 h-12 text-accent-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Cài đặt</h2>
            <p className="text-muted-foreground">
              Chọn một mục cài đặt từ menu bên trái để xem chi tiết
            </p>
          </div>
        </div>
      );
    }

    // For calls tab without selection
    if (activeTab === 'calls' && !selectedConversation) {
      return (
        <div className="flex-1 flex items-center justify-center gradient-chat">
          <div className="text-center max-w-md p-8">
            <div className="w-24 h-24 rounded-3xl gradient-warm flex items-center justify-center shadow-float animate-float mx-auto mb-6">
              <MessageCircle className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Lịch sử cuộc gọi</h2>
            <p className="text-muted-foreground">
              Chọn một cuộc gọi để xem chi tiết hoặc gọi lại
            </p>
          </div>
        </div>
      );
    }

    // Default: chat window or welcome screen
    if (selectedConversation) {
      return (
        <ChatWindow
          conversation={selectedConversation}
          conversations={conversations}
          onVideoCall={handleVideoCall}
          onVoiceCall={handleVoiceCall}
          onBack={isMobile ? () => setSelectedConversationId(null) : undefined}
          onDeleteConversation={handleDeleteConversation}
        />
      );
    }

    return (
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
    );
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
      {/* Desktop: Icon Sidebar */}
      <div className="hidden md:flex">
        <AppSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>

      {/* Content Panel - Desktop */}
      <div className={cn(
        "hidden md:flex border-r border-sidebar-border flex-shrink-0 w-80 lg:w-96"
      )}>
        {renderContentPanel()}
      </div>

      {/* Mobile: Content Panel */}
      <div className={cn(
        "md:hidden absolute inset-0 w-full z-10 bg-background transition-transform duration-300 ease-out pb-16",
        selectedConversation ? "-translate-x-full" : "translate-x-0"
      )}>
        {mobileTab === 'chat' && (
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversationId}
            onSelect={(conv) => setSelectedConversationId(conv.id)}
            onNewChat={() => setShowNewChat(true)}
          />
        )}
        {mobileTab === 'calls' && <CallHistory />}
        {mobileTab === 'settings' && <SettingsMenu />}
      </div>

      {/* Main Chat Area */}
      <div className={cn(
        "flex-1 flex flex-col transition-transform duration-300 ease-out",
        isMobile && cn(
          "absolute inset-0 w-full bg-background",
          selectedConversation ? "translate-x-0" : "translate-x-full"
        )
      )}>
        {renderMainView()}
      </div>

      {/* Mobile: Bottom Navigation */}
      <BottomNav
        activeTab={mobileTab}
        onTabChange={handleMobileTabChange}
      />

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

      {/* Video/Voice Call Modal */}
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
