-- Fix infinite recursion by using SECURITY DEFINER function

-- 1. Create helper function to get user's conversation IDs (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_my_conversation_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT conversation_id
  FROM public.conversation_members
  WHERE user_id = auth.uid();
$$;

-- 2. Drop and recreate conversation_members SELECT policy using the function
DROP POLICY IF EXISTS "Users can view conversation members" ON public.conversation_members;

CREATE POLICY "Users can view conversation members" ON public.conversation_members
  FOR SELECT USING (
    user_id = auth.uid() OR conversation_id IN (SELECT public.get_my_conversation_ids())
  );

-- 3. Drop and recreate conversations SELECT policy using the function
DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;

CREATE POLICY "Users can view their conversations" ON public.conversations
  FOR SELECT USING (
    id IN (SELECT public.get_my_conversation_ids())
  );