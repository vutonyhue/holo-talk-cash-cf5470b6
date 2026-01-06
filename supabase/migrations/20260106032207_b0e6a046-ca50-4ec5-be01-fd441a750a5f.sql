-- Create table to track message read status
CREATE TABLE public.message_reads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Enable RLS
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

-- Users can mark messages as read in their conversations
CREATE POLICY "Users can mark messages as read"
ON public.message_reads
FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.id = message_reads.message_id AND cm.user_id = auth.uid()
  )
);

-- Users can view read receipts for messages in their conversations
CREATE POLICY "Users can view read receipts"
ON public.message_reads
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.id = message_reads.message_id AND cm.user_id = auth.uid()
  )
);

-- Add index for performance
CREATE INDEX idx_message_reads_message_id ON public.message_reads(message_id);
CREATE INDEX idx_message_reads_user_id ON public.message_reads(user_id);

-- Enable realtime for message_reads
ALTER TABLE public.message_reads REPLICA IDENTITY FULL;