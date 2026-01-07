-- Add mute columns to conversation_members
ALTER TABLE public.conversation_members 
ADD COLUMN IF NOT EXISTS is_muted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS muted_at timestamptz;