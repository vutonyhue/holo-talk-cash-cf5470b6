-- Trigger: Auto-complete 'complete_profile' when user updates profile with avatar and display_name
CREATE OR REPLACE FUNCTION public.handle_profile_complete_reward()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if profile is now complete (has avatar_url and display_name)
  IF NEW.avatar_url IS NOT NULL AND NEW.display_name IS NOT NULL 
     AND (OLD.avatar_url IS NULL OR OLD.display_name IS NULL) THEN
    INSERT INTO public.user_rewards (user_id, task_id, status, completed_at)
    VALUES (NEW.id, 'complete_profile', 'completed', now())
    ON CONFLICT (user_id, task_id) DO UPDATE 
    SET status = 'completed', completed_at = now()
    WHERE user_rewards.status = 'pending' OR user_rewards.status = 'locked';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on profiles table
DROP TRIGGER IF EXISTS on_profile_updated_check_reward ON public.profiles;
CREATE TRIGGER on_profile_updated_check_reward
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_complete_reward();

-- Trigger: Auto-complete 'first_message' when user sends their first message
CREATE OR REPLACE FUNCTION public.handle_first_message_reward()
RETURNS TRIGGER AS $$
BEGIN
  -- Only insert if this is the user's first message
  IF NOT EXISTS (
    SELECT 1 FROM public.messages 
    WHERE sender_id = NEW.sender_id AND id != NEW.id
  ) THEN
    INSERT INTO public.user_rewards (user_id, task_id, status, completed_at)
    VALUES (NEW.sender_id, 'first_message', 'completed', now())
    ON CONFLICT (user_id, task_id) DO UPDATE 
    SET status = 'completed', completed_at = now()
    WHERE user_rewards.status = 'pending' OR user_rewards.status = 'locked';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on messages table
DROP TRIGGER IF EXISTS on_message_created_check_reward ON public.messages;
CREATE TRIGGER on_message_created_check_reward
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_first_message_reward();