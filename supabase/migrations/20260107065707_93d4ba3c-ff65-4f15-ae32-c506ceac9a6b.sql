-- Handle duplicate usernames after lowercase conversion by adding random suffix
-- First update duplicates with suffix
UPDATE public.profiles p1
SET username = lower(p1.username) || '_' || substr(md5(p1.id::text), 1, 4)
WHERE EXISTS (
  SELECT 1 FROM public.profiles p2 
  WHERE lower(p2.username) = lower(p1.username) 
  AND p2.id != p1.id
  AND p2.created_at < p1.created_at
);

-- Then lowercase the remaining ones
UPDATE public.profiles 
SET username = lower(username)
WHERE username ~ '[A-Z]';

-- Create index for faster case-insensitive username lookups
CREATE INDEX IF NOT EXISTS profiles_username_lower_idx 
ON public.profiles (lower(username));

-- Add CHECK constraint for username format (international standard)
-- Rules: 3-20 chars, lowercase alphanumeric + underscore, no leading/trailing/consecutive underscores
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_username_format_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_username_format_check 
CHECK (
  username ~ '^[a-z0-9]+(_[a-z0-9]+)*$' 
  AND length(username) >= 3 
  AND length(username) <= 20
);