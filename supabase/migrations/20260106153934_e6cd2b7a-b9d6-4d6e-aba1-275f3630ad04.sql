-- Enable REPLICA IDENTITY FULL to capture complete row data during updates
ALTER TABLE message_reads REPLICA IDENTITY FULL;

-- Add table to supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE message_reads;