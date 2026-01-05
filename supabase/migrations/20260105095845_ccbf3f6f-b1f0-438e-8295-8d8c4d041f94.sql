-- Fix: Allow conversation creator to SELECT their newly created conversation
-- This is needed because when creating a conversation, the user is not yet a member

DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;

CREATE POLICY "Users can view their conversations" ON public.conversations
  FOR SELECT USING (
    id IN (SELECT public.get_my_conversation_ids()) 
    OR created_by = auth.uid()
  );