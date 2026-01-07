-- Bảng quản lý API Keys
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  permissions JSONB DEFAULT '{"chat": true, "users": true, "calls": true, "crypto": true}'::jsonb,
  rate_limit INTEGER DEFAULT 60,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Bảng log API usage
CREATE TABLE public.api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies cho api_keys
CREATE POLICY "Users can view own API keys"
  ON public.api_keys FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own API keys"
  ON public.api_keys FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own API keys"
  ON public.api_keys FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own API keys"
  ON public.api_keys FOR DELETE
  USING (user_id = auth.uid());

-- RLS Policies cho api_usage_logs
CREATE POLICY "Users can view own usage logs"
  ON public.api_usage_logs FOR SELECT
  USING (api_key_id IN (SELECT id FROM public.api_keys WHERE user_id = auth.uid()));

-- Index cho performance
CREATE INDEX idx_api_keys_api_key ON public.api_keys(api_key);
CREATE INDEX idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX idx_api_usage_logs_api_key_id ON public.api_usage_logs(api_key_id);
CREATE INDEX idx_api_usage_logs_created_at ON public.api_usage_logs(created_at DESC);