-- Create referral_codes table
CREATE TABLE public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  uses_count integer DEFAULT 0,
  max_uses integer DEFAULT 100,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- Users can view their own referral code
CREATE POLICY "Users can view own referral code" ON public.referral_codes
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own referral code
CREATE POLICY "Users can create own referral code" ON public.referral_codes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role can update (for uses_count)
CREATE POLICY "Service role can update referral codes" ON public.referral_codes
  FOR UPDATE USING (true);

-- Anyone can view codes for lookup (needed for use-referral-code)
CREATE POLICY "Anyone can lookup codes" ON public.referral_codes
  FOR SELECT USING (true);

-- Indexes
CREATE INDEX referral_codes_user_id_idx ON public.referral_codes(user_id);

-- Create referral_uses table
CREATE TABLE public.referral_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id uuid NOT NULL REFERENCES public.referral_codes(id),
  referred_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(referred_user_id)
);

-- Enable RLS
ALTER TABLE public.referral_uses ENABLE ROW LEVEL SECURITY;

-- Users can view referrals they made (as referrer)
CREATE POLICY "Users can view referrals they made" ON public.referral_uses
  FOR SELECT USING (auth.uid() = referrer_user_id);

-- Service role can insert
CREATE POLICY "Service role can insert referral uses" ON public.referral_uses
  FOR INSERT WITH CHECK (true);

-- Add referred_by to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.referral_codes(id);

-- Trigger function to handle referral use
CREATE OR REPLACE FUNCTION public.handle_referral_use()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id uuid;
  v_current_count integer;
  v_task_id text := 'invite_friends';
BEGIN
  -- Get referrer user_id
  SELECT user_id INTO v_referrer_id 
  FROM public.referral_codes 
  WHERE id = NEW.referral_code_id;

  -- Update referral_codes uses_count
  UPDATE public.referral_codes 
  SET uses_count = uses_count + 1, updated_at = now()
  WHERE id = NEW.referral_code_id
  RETURNING uses_count INTO v_current_count;

  -- Upsert user_rewards for invite_friends
  INSERT INTO public.user_rewards (user_id, task_id, status, progress)
  VALUES (
    v_referrer_id, 
    v_task_id, 
    CASE WHEN v_current_count >= 3 THEN 'completed' ELSE 'pending' END,
    jsonb_build_object('invited', v_current_count, 'required', 3)
  )
  ON CONFLICT (user_id, task_id) 
  DO UPDATE SET 
    progress = jsonb_build_object('invited', v_current_count, 'required', 3),
    status = CASE WHEN v_current_count >= 3 THEN 'completed' ELSE user_rewards.status END,
    completed_at = CASE WHEN v_current_count >= 3 AND user_rewards.status != 'completed' 
                   THEN now() ELSE user_rewards.completed_at END,
    updated_at = now();

  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER on_referral_used
  AFTER INSERT ON public.referral_uses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_referral_use();