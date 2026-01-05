
-- Delete duplicate 1-on-1 conversations (keep the most recent one)
-- First delete related records in conversation_members
DELETE FROM conversation_members 
WHERE conversation_id IN (
  'cd37965a-4793-4dcc-97e5-e597d9f84a45',
  'f0ca4212-f2f9-4e59-b808-0134da8650e9',
  '62405dab-84de-466b-8397-ac7d9e387f36',
  '78f45a93-987f-47ba-adf8-928bc0ab0f32'
);

-- Delete any messages in these conversations
DELETE FROM messages 
WHERE conversation_id IN (
  'cd37965a-4793-4dcc-97e5-e597d9f84a45',
  'f0ca4212-f2f9-4e59-b808-0134da8650e9',
  '62405dab-84de-466b-8397-ac7d9e387f36',
  '78f45a93-987f-47ba-adf8-928bc0ab0f32'
);

-- Delete calls in these conversations
DELETE FROM calls 
WHERE conversation_id IN (
  'cd37965a-4793-4dcc-97e5-e597d9f84a45',
  'f0ca4212-f2f9-4e59-b808-0134da8650e9',
  '62405dab-84de-466b-8397-ac7d9e387f36',
  '78f45a93-987f-47ba-adf8-928bc0ab0f32'
);

-- Finally delete the duplicate conversations
DELETE FROM conversations 
WHERE id IN (
  'cd37965a-4793-4dcc-97e5-e597d9f84a45',
  'f0ca4212-f2f9-4e59-b808-0134da8650e9',
  '62405dab-84de-466b-8397-ac7d9e387f36',
  '78f45a93-987f-47ba-adf8-928bc0ab0f32'
);
