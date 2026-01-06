-- Create call_sessions table for call signaling
CREATE TABLE public.call_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  caller_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  call_type TEXT NOT NULL DEFAULT 'video' CHECK (call_type IN ('video', 'voice')),
  status TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'accepted', 'rejected', 'ended', 'missed')),
  channel_name TEXT NOT NULL,
  agora_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE
);

-- Enable Row Level Security
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies for call_sessions
CREATE POLICY "Users can view calls in their conversations"
ON public.call_sessions
FOR SELECT
USING (
  conversation_id IN (SELECT get_my_conversation_ids())
);

CREATE POLICY "Users can create calls in their conversations"
ON public.call_sessions
FOR INSERT
WITH CHECK (
  conversation_id IN (SELECT get_my_conversation_ids())
);

CREATE POLICY "Users can update calls in their conversations"
ON public.call_sessions
FOR UPDATE
USING (
  conversation_id IN (SELECT get_my_conversation_ids())
);

-- Enable realtime for call_sessions
ALTER TABLE public.call_sessions REPLICA IDENTITY FULL;

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_sessions;