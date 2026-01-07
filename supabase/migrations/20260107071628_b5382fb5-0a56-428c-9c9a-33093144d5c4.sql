-- Add email column to profiles if not exists
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email text;

-- Create rate_limits table for server-side rate limiting
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  action_type text NOT NULL,
  count integer DEFAULT 1,
  window_start timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(identifier, action_type)
);

-- Enable RLS on rate_limits
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Create rate limit check function (security definer)
CREATE OR REPLACE FUNCTION public.rl_increment(
  p_identifier text,
  p_action_type text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_window_start timestamptz;
BEGIN
  -- Get current record
  SELECT count, window_start INTO v_count, v_window_start
  FROM rate_limits
  WHERE identifier = p_identifier AND action_type = p_action_type;

  -- If no record or window expired, create/reset
  IF v_window_start IS NULL OR v_window_start < (now() - (p_window_seconds || ' seconds')::interval) THEN
    INSERT INTO rate_limits (identifier, action_type, count, window_start)
    VALUES (p_identifier, p_action_type, 1, now())
    ON CONFLICT (identifier, action_type) 
    DO UPDATE SET count = 1, window_start = now();
    RETURN true;
  END IF;

  -- Check if limit exceeded
  IF v_count >= p_limit THEN
    RETURN false;
  END IF;

  -- Increment count
  UPDATE rate_limits 
  SET count = count + 1
  WHERE identifier = p_identifier AND action_type = p_action_type;
  
  RETURN true;
END;
$$;

-- Update trigger to include email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url, email)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    new.email
  );
  RETURN new;
END;
$$;