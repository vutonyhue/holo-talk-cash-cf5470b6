-- Create reward_tasks table
CREATE TABLE public.reward_tasks (
  id text PRIMARY KEY,
  name_vi text NOT NULL,
  name_en text NOT NULL,
  description_vi text NOT NULL,
  description_en text NOT NULL,
  reward_amount numeric NOT NULL,
  icon text DEFAULT 'gift',
  category text DEFAULT 'onboarding',
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  requires_verification boolean DEFAULT false,
  max_claims integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Insert 5 default tasks
INSERT INTO public.reward_tasks (id, name_vi, name_en, description_vi, description_en, reward_amount, icon, category, sort_order, is_active, requires_verification, max_claims) VALUES
  ('register', 'Đăng ký tài khoản', 'Register account', 'Tạo tài khoản FunChat để bắt đầu', 'Create a FunChat account to get started', 50000, 'user-plus', 'onboarding', 1, true, false, 1),
  ('complete_profile', 'Hoàn thiện hồ sơ', 'Complete profile', 'Thêm avatar và thông tin cá nhân', 'Add avatar and personal information', 10000, 'user-check', 'onboarding', 2, true, false, 1),
  ('first_message', 'Gửi tin nhắn đầu tiên', 'Send first message', 'Gửi tin nhắn cho một người bạn', 'Send a message to a friend', 5000, 'message-circle', 'engagement', 3, true, false, 1),
  ('invite_friends', 'Mời 3 bạn bè', 'Invite 3 friends', 'Mời 3 người bạn đăng ký FunChat', 'Invite 3 friends to join FunChat', 20000, 'users', 'social', 4, true, true, 1),
  ('send_feedback', 'Gửi feedback', 'Send feedback', 'Chia sẻ ý kiến để cải thiện FunChat', 'Share your thoughts to improve FunChat', 7500, 'message-square', 'engagement', 5, true, true, 1);

-- Enable RLS
ALTER TABLE public.reward_tasks ENABLE ROW LEVEL SECURITY;

-- Anyone can view active tasks
CREATE POLICY "Anyone can view active tasks" ON public.reward_tasks
  FOR SELECT USING (is_active = true);

-- Create user_rewards table
CREATE TABLE public.user_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id text NOT NULL REFERENCES public.reward_tasks(id),
  status text NOT NULL DEFAULT 'pending',
  progress jsonb DEFAULT '{}',
  completed_at timestamptz,
  claimed_at timestamptz,
  paid_at timestamptz,
  tx_hash text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, task_id)
);

-- Enable RLS
ALTER TABLE public.user_rewards ENABLE ROW LEVEL SECURITY;

-- Users can view their own rewards
CREATE POLICY "Users can view own rewards" ON public.user_rewards
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own rewards
CREATE POLICY "Users can insert own rewards" ON public.user_rewards
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own rewards
CREATE POLICY "Users can update own rewards" ON public.user_rewards
  FOR UPDATE USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX user_rewards_user_id_idx ON public.user_rewards(user_id);
CREATE INDEX user_rewards_status_idx ON public.user_rewards(status);

-- Trigger to update updated_at
CREATE TRIGGER update_user_rewards_updated_at
  BEFORE UPDATE ON public.user_rewards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to auto-complete register task when user signs up
CREATE OR REPLACE FUNCTION public.handle_register_reward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_rewards (user_id, task_id, status, completed_at)
  VALUES (NEW.id, 'register', 'completed', now())
  ON CONFLICT (user_id, task_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Trigger on profiles (runs after handle_new_user)
CREATE TRIGGER on_profile_created_reward
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_register_reward();