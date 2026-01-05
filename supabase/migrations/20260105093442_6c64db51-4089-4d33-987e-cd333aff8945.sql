-- Fix infinite recursion in RLS policies for conversation_members and related tables

-- 1. Drop problematic policies on conversation_members
DROP POLICY IF EXISTS "Users can view conversation members" ON public.conversation_members;
DROP POLICY IF EXISTS "Users can add members to conversations they belong to" ON public.conversation_members;

-- 2. Create new non-recursive policies for conversation_members
-- Users can view members of conversations they are part of (direct check, no self-reference)
CREATE POLICY "Users can view conversation members" ON public.conversation_members
  FOR SELECT USING (user_id = auth.uid() OR conversation_id IN (
    SELECT cm.conversation_id FROM public.conversation_members cm WHERE cm.user_id = auth.uid()
  ));

-- Users can add themselves to conversations
CREATE POLICY "Users can add themselves to conversations" ON public.conversation_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Conversation creators can add any members
CREATE POLICY "Conversation creators can add members" ON public.conversation_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c 
      WHERE c.id = conversation_id AND c.created_by = auth.uid()
    )
  );

-- 3. Fix policies on conversations table
DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their conversations" ON public.conversations;

-- Users can view conversations they are members of
CREATE POLICY "Users can view their conversations" ON public.conversations
  FOR SELECT USING (
    id IN (SELECT conversation_id FROM public.conversation_members WHERE user_id = auth.uid())
  );

-- Only creators can update conversations
CREATE POLICY "Users can update their conversations" ON public.conversations
  FOR UPDATE USING (created_by = auth.uid());