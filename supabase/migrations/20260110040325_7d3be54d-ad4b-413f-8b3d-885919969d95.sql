-- =============================================
-- PHASE 1: FunChat Production-Ready API Platform
-- Database Schema Updates
-- =============================================

-- 1. Update api_keys table with salt-based hashing and scopes
-- First add new columns
ALTER TABLE public.api_keys 
  ADD COLUMN IF NOT EXISTS key_salt text,
  ADD COLUMN IF NOT EXISTS scopes text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allowed_origins text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS app_id text;

-- Rename api_key to key_hash for clarity (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'api_keys' AND column_name = 'api_key') THEN
    ALTER TABLE public.api_keys RENAME COLUMN api_key TO key_hash;
  END IF;
END $$;

-- Add unique constraint on app_id
ALTER TABLE public.api_keys 
  ADD CONSTRAINT api_keys_app_id_unique UNIQUE (app_id);

-- Create index for fast key lookup
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_app_id ON public.api_keys(app_id);

-- Update existing keys with default salt and scopes (migration)
UPDATE public.api_keys 
SET 
  key_salt = encode(gen_random_bytes(16), 'hex'),
  scopes = CASE 
    WHEN permissions->>'chat' = 'true' THEN array_append(scopes, 'chat:read')
    ELSE scopes
  END,
  app_id = COALESCE(app_id, 'app_' || encode(gen_random_bytes(8), 'hex'))
WHERE key_salt IS NULL;

-- Make key_salt NOT NULL after migration
ALTER TABLE public.api_keys 
  ALTER COLUMN key_salt SET NOT NULL,
  ALTER COLUMN scopes SET DEFAULT ARRAY['chat:read', 'users:read'];

-- 2. Create webhooks table
CREATE TABLE IF NOT EXISTS public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text NOT NULL,
  events text[] DEFAULT ARRAY['message.created']::text[],
  is_active boolean DEFAULT true,
  failure_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  last_triggered_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on webhooks
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

-- RLS policies for webhooks
CREATE POLICY "Users can view their webhooks"
  ON public.webhooks FOR SELECT
  USING (
    api_key_id IN (
      SELECT id FROM public.api_keys WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create webhooks"
  ON public.webhooks FOR INSERT
  WITH CHECK (
    api_key_id IN (
      SELECT id FROM public.api_keys WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their webhooks"
  ON public.webhooks FOR UPDATE
  USING (
    api_key_id IN (
      SELECT id FROM public.api_keys WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their webhooks"
  ON public.webhooks FOR DELETE
  USING (
    api_key_id IN (
      SELECT id FROM public.api_keys WHERE user_id = auth.uid()
    )
  );

-- Create indexes for webhooks
CREATE INDEX IF NOT EXISTS idx_webhooks_api_key_id ON public.webhooks(api_key_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_is_active ON public.webhooks(is_active);

-- 3. Create webhook_deliveries table for logging
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  response_status integer,
  response_body text,
  attempt_count integer DEFAULT 1,
  delivered_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on webhook_deliveries
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- RLS policy for webhook_deliveries
CREATE POLICY "Users can view their webhook deliveries"
  ON public.webhook_deliveries FOR SELECT
  USING (
    webhook_id IN (
      SELECT w.id FROM public.webhooks w
      JOIN public.api_keys ak ON w.api_key_id = ak.id
      WHERE ak.user_id = auth.uid()
    )
  );

-- Create indexes for webhook_deliveries
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON public.webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON public.webhook_deliveries(created_at DESC);

-- 4. Create widget_tokens table for secure widget embedding
CREATE TABLE IF NOT EXISTS public.widget_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  scopes text[] DEFAULT ARRAY['chat:read', 'chat:write']::text[],
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on widget_tokens
ALTER TABLE public.widget_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies for widget_tokens
CREATE POLICY "Users can view their widget tokens"
  ON public.widget_tokens FOR SELECT
  USING (
    api_key_id IN (
      SELECT id FROM public.api_keys WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create widget tokens"
  ON public.widget_tokens FOR INSERT
  WITH CHECK (
    api_key_id IN (
      SELECT id FROM public.api_keys WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their widget tokens"
  ON public.widget_tokens FOR DELETE
  USING (
    api_key_id IN (
      SELECT id FROM public.api_keys WHERE user_id = auth.uid()
    )
  );

-- Create indexes for widget_tokens
CREATE INDEX IF NOT EXISTS idx_widget_tokens_hash ON public.widget_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_widget_tokens_expires_at ON public.widget_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_widget_tokens_api_key_id ON public.widget_tokens(api_key_id);

-- 5. Create function to verify API key with salt
CREATE OR REPLACE FUNCTION public.verify_api_key(
  p_key_hash text,
  p_key_prefix text
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  app_id text,
  scopes text[],
  allowed_origins text[],
  rate_limit integer,
  is_active boolean,
  expires_at timestamptz,
  key_salt text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ak.id,
    ak.user_id,
    ak.app_id,
    ak.scopes,
    ak.allowed_origins,
    ak.rate_limit,
    ak.is_active,
    ak.expires_at,
    ak.key_salt
  FROM public.api_keys ak
  WHERE ak.key_prefix = p_key_prefix
    AND ak.is_active = true
  LIMIT 1;
END;
$$;

-- 6. Create function to update webhook timestamp
CREATE OR REPLACE FUNCTION public.update_webhook_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for webhook updates
DROP TRIGGER IF EXISTS update_webhooks_updated_at ON public.webhooks;
CREATE TRIGGER update_webhooks_updated_at
  BEFORE UPDATE ON public.webhooks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_webhook_timestamp();

-- 7. Create function to clean up expired widget tokens
CREATE OR REPLACE FUNCTION public.cleanup_expired_widget_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.widget_tokens
  WHERE expires_at < now() - interval '1 hour';
END;
$$;