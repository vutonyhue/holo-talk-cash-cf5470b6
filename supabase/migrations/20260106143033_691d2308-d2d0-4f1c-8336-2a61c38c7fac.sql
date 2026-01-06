-- Drop existing policy if exists
DROP POLICY IF EXISTS "Users can mark messages as read" ON message_reads;
DROP POLICY IF EXISTS "Users can insert read receipts" ON message_reads;
DROP POLICY IF EXISTS "Users can update own read receipts" ON message_reads;
DROP POLICY IF EXISTS "Users can view read receipts" ON message_reads;

-- Create SELECT policy - users can view read receipts for messages in their conversations
CREATE POLICY "Users can view read receipts"
ON message_reads
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.id = message_reads.message_id
    AND cm.user_id = auth.uid()
  )
);

-- Create INSERT policy - users can only insert their own read receipts
CREATE POLICY "Users can insert read receipts"
ON message_reads
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM messages m
    JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.id = message_id
    AND cm.user_id = auth.uid()
  )
);