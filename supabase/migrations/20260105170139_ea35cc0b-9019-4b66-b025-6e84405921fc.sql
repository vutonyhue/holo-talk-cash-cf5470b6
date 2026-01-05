-- Tạo bucket cho chat attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true);

-- RLS: Cho phép user đã đăng nhập upload file
CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-attachments');

-- RLS: Cho phép mọi người xem file (public bucket)
CREATE POLICY "Anyone can view chat attachments"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chat-attachments');

-- RLS: Cho phép user xóa file của mình
CREATE POLICY "Users can delete own chat attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);