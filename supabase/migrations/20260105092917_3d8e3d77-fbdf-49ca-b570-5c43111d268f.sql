-- Create storage bucket for avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- Policy to allow users to upload their own avatar
CREATE POLICY "Users can upload own avatar"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy to allow users to update their own avatar
CREATE POLICY "Users can update own avatar"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy to allow users to delete their own avatar
CREATE POLICY "Users can delete own avatar"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy to allow public access to avatars
CREATE POLICY "Avatars are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'avatars');