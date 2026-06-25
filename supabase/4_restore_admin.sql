-- Run this in your Supabase SQL Editor to restore your Global Admin privileges.

-- This will find the very first user created in the system (you) and set their account back to global admin.
UPDATE public.user_roles
SET is_global_admin = true
WHERE user_id = (
  SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 1
);

-- If for some reason the above doesn't target the correct account, you can uncomment and use this specific query instead (replace with your actual email):
-- UPDATE public.user_roles
-- SET is_global_admin = true
-- WHERE user_id = (SELECT id FROM public.profiles WHERE email = 'your-email@example.com' LIMIT 1);
