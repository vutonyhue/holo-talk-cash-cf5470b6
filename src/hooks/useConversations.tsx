import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Conversation, Message, Profile } from '@/types';

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }

    fetchConversations();
  }, [user]);

  const fetchConversations = async () => {
    if (!user) return;

    setLoading(true);

    // Get conversation IDs where user is a member
    const { data: memberData, error: memberError } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', user.id);

    if (memberError) {
      console.error('Error fetching member data:', memberError);
      setLoading(false);
      return;
    }

    if (!memberData || memberData.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const conversationIds = memberData.map(m => m.conversation_id);

    // Get conversations with members
    const { data: convData, error: convError } = await supabase
      .from('conversations')
      .select(`
        *,
        conversation_members (
          id,
          user_id,
          role,
          joined_at
        )
      `)
      .in('id', conversationIds)
      .order('updated_at', { ascending: false });

    if (convError) {
      console.error('Error fetching conversations:', convError);
      setLoading(false);
      return;
    }

    // Get profiles for all members
    const allUserIds = new Set<string>();
    convData?.forEach(conv => {
      (conv.conversation_members as any[])?.forEach(m => {
        if (m.user_id) allUserIds.add(m.user_id);
      });
    });

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', Array.from(allUserIds));

    const profileMap = new Map<string, Profile>();
    profiles?.forEach(p => profileMap.set(p.id, p as Profile));

    // Get last message for each conversation
    const conversationsWithDetails = await Promise.all(
      (convData || []).map(async (conv) => {
        const { data: lastMessageData } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const members = (conv.conversation_members as any[])?.map(m => ({
          ...m,
          profile: profileMap.get(m.user_id),
        }));

        return {
          ...conv,
          members,
          last_message: lastMessageData as Message | undefined,
        } as Conversation;
      })
    );

    setConversations(conversationsWithDetails);
    setLoading(false);
  };

  const createConversation = async (memberIds: string[], name?: string, isGroup = false) => {
    if (!user) return { error: new Error('Not logged in') };

    // For 1-on-1 chats, check if conversation already exists
    if (!isGroup && memberIds.length === 1) {
      const otherUserId = memberIds[0];
      
      // Check in current state first
      const existingConv = conversations.find(conv => {
        if (conv.is_group) return false;
        const memberUserIds = conv.members?.map(m => m.user_id) || [];
        return memberUserIds.length === 2 && 
               memberUserIds.includes(user.id) && 
               memberUserIds.includes(otherUserId);
      });
      
      if (existingConv) {
        return { data: existingConv, error: null };
      }

      // Check in database if not found in state
      const { data: memberData } = await supabase
        .from('conversation_members')
        .select('conversation_id, user_id')
        .in('user_id', [user.id, otherUserId]);

      if (memberData && memberData.length > 0) {
        // Group by conversation_id and find ones with both users
        const convMap = new Map<string, Set<string>>();
        memberData.forEach(m => {
          if (!convMap.has(m.conversation_id!)) {
            convMap.set(m.conversation_id!, new Set());
          }
          convMap.get(m.conversation_id!)!.add(m.user_id!);
        });

        const candidateIds: string[] = [];
        convMap.forEach((users, convId) => {
          if (users.size === 2 && users.has(user.id) && users.has(otherUserId)) {
            candidateIds.push(convId);
          }
        });

        if (candidateIds.length > 0) {
          // Find existing 1-on-1 conversation
          const { data: existingConvData } = await supabase
            .from('conversations')
            .select('*')
            .in('id', candidateIds)
            .eq('is_group', false)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingConvData) {
            await fetchConversations();
            return { data: existingConvData, error: null };
          }
        }
      }
    }

    // Create new conversation
    const { data: convData, error: convError } = await supabase
      .from('conversations')
      .insert({
        name: isGroup ? name : null,
        is_group: isGroup,
        created_by: user.id,
      })
      .select()
      .single();

    if (convError) return { error: convError };

    // Add members including current user
    const allMembers = [...new Set([user.id, ...memberIds])];
    const memberInserts = allMembers.map(userId => ({
      conversation_id: convData.id,
      user_id: userId,
      role: userId === user.id ? 'admin' : 'member',
    }));

    const { error: memberError } = await supabase
      .from('conversation_members')
      .insert(memberInserts);

    if (memberError) return { error: memberError };

    await fetchConversations();
    return { data: convData, error: null };
  };

  const deleteConversation = async (conversationId: string) => {
    if (!user) return { error: new Error('Not logged in') };

    const { error } = await supabase
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);

    if (!error) {
      setConversations(prev => prev.filter(c => c.id !== conversationId));
    }

    return { error };
  };

  return {
    conversations,
    loading,
    fetchConversations,
    createConversation,
    deleteConversation,
  };
}
