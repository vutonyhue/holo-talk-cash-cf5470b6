-- Add is_deleted column for soft delete
ALTER TABLE public.messages 
ADD COLUMN is_deleted boolean DEFAULT false,
ADD COLUMN deleted_at timestamp with time zone DEFAULT NULL;

-- Allow users to update (delete) their own messages
CREATE POLICY "Users can delete their own messages" 
ON public.messages 
FOR UPDATE 
USING (sender_id = auth.uid())
WITH CHECK (sender_id = auth.uid());