import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useConversations } from '@/hooks/useConversations';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCallSignaling } from '@/hooks/useCallSignaling';
import { supabase } from '@/integrations/supabase/client';
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
import AIChatPanel from '@/components/ai/AIChatPanel';
import AIChatWindow from '@/components/ai/AIChatWindow';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { MessageCircle, Sparkles, PhoneCall, Link, Keyboard, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CallActionCard } from '@/components/call/CallActionCard';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DialPad } from '@/components/call/DialPad';
import { PhoneCallDialog } from '@/components/call/PhoneCallDialog';
import { useUserSearch } from '@/hooks/useUserSearch';
import { toast } from 'sonner';

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
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);

  // DialPad state for calls panel
  const [showDialPad, setShowDialPad] = useState(false);
  const [showCallConfirm, setShowCallConfirm] = useState(false);
  const [foundProfile, setFoundProfile] = useState<any>(null);
  const [pendingCallType, setPendingCallType] = useState<'voice' | 'video'>('voice');
  const [isConnecting, setIsConnecting] = useState(false);
  
  const { searchUsers, isSearching, error: searchError, clearError } = useUserSearch();

  const handleAiSuggestion = useCallback((suggestion: string) => {
    setAiSuggestion(suggestion);
  }, []);

  const clearAiSuggestion = useCallback(() => {
    setAiSuggestion(null);
  }, []);

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

  // Handler for starting call from DialPad/CallHistory
  const handleStartCall = async (conversationId: string, callType: 'video' | 'voice') => {
    await startCall(conversationId, callType);
  };

  // Handle phone dial from right panel
  const handlePhoneDial = async (phoneNumber: string, callType: 'voice' | 'video') => {
    clearError();
    
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

  // Handle confirm call from right panel
  const handleConfirmCall = async () => {
    if (!foundProfile) return;
    
    setIsConnecting(true);
    
    try {
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
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            is_group: false,
            created_by: profile?.id
          })
          .select()
          .single();

        if (convError) throw convError;

        await supabase
          .from('conversation_members')
          .insert([
            { conversation_id: newConv.id, user_id: profile?.id },
            { conversation_id: newConv.id, user_id: foundProfile.id }
          ]);

        conversationId = newConv.id;
      }

      await startCall(conversationId, pendingCallType);
      setShowCallConfirm(false);
      setFoundProfile(null);
    } catch (err: any) {
      console.error('Error starting call:', err);
      toast.error('Không thể bắt đầu cuộc gọi');
    } finally {
      setIsConnecting(false);
    }
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
        return <CallHistory onStartCall={handleStartCall} />;
      case 'settings':
        return <SettingsMenu />;
      case 'community':
        return <ComingSoon type="community" />;
      case 'ai':
        return <AIChatPanel onSuggestionClick={handleAiSuggestion} />;
      default:
        return null;
    }
  };

  // Render main view based on active tab
  const renderMainView = () => {
    // For AI tab, show AI chat window
    if (activeTab === 'ai') {
      return (
        <AIChatWindow 
          onSuggestion={aiSuggestion}
          onSuggestionUsed={clearAiSuggestion}
        />
      );
    }

    // For community tab, show coming soon
    if (activeTab === 'community') {
      return (
        <div className="flex-1 flex items-center justify-center gradient-chat">
          <div className="text-center max-w-md p-8">
            <div className="w-24 h-24 rounded-3xl gradient-primary flex items-center justify-center shadow-float animate-float mx-auto mb-6">
              <Sparkles className="w-12 h-12 text-primary-foreground" />
            </div>
            <h2 className="text-2xl font-bold text-gradient mb-2">Cộng đồng FunChat</h2>
            <p className="text-muted-foreground">
              Tính năng cộng đồng đang được phát triển. Bạn sẽ có thể tham gia nhóm và kênh sớm!
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

    // For calls tab without selection - WhatsApp style action cards
    if (activeTab === 'calls' && !selectedConversation) {
      return (
        <div className="flex-1 flex items-center justify-center gradient-chat">
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <CallActionCard 
              icon={<PhoneCall className="w-6 h-6" />} 
              title="Bắt đầu cuộc gọi"
              onClick={() => setShowDialPad(true)}
            />
            <CallActionCard 
              icon={<Link className="w-6 h-6" />} 
              title="Liên kết cuộc gọi"
              onClick={() => toast.info('Tính năng sẽ sớm ra mắt')}
            />
            <CallActionCard 
              icon={<Keyboard className="w-6 h-6" />} 
              title="Gọi số điện thoại"
              onClick={() => setShowDialPad(true)}
            />
            <CallActionCard 
              icon={<Calendar className="w-6 h-6" />} 
              title="Lên lịch cuộc gọi"
              onClick={() => toast.info('Tính năng sẽ sớm ra mắt')}
            />
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

      {/* Desktop: Resizable Panels */}
      <div className="hidden md:flex flex-1 h-full">
        <ResizablePanelGroup direction="horizontal">
          {/* Content Panel - Resizable */}
          <ResizablePanel 
            defaultSize={25} 
            minSize={15} 
            maxSize={40}
            className="border-r border-sidebar-border"
          >
            {renderContentPanel()}
          </ResizablePanel>

          {/* Resize Handle */}
          <ResizableHandle withHandle className="hover:bg-primary/20 transition-colors" />

          {/* Main Chat Area */}
          <ResizablePanel defaultSize={75} minSize={50}>
            <div className="h-full flex flex-col">
              {renderMainView()}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
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

      {/* Mobile: Main Chat Area */}
      <div className={cn(
        "md:hidden flex-1 flex flex-col transition-transform duration-300 ease-out",
        "absolute inset-0 w-full bg-background pb-16",
        selectedConversation ? "translate-x-0" : "translate-x-full"
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

      {/* DialPad Dialog for Calls Tab */}
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
