-- Alter table profiles to add custom_id column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_id TEXT UNIQUE;

-- Re-define the handle_new_user function to include custom_id
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, department, custom_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'department', '')::public.department,
    NEW.raw_user_meta_data->>'custom_id'
  );
  
  IF NEW.raw_user_meta_data->>'role' IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, (NEW.raw_user_meta_data->>'role')::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Create resolve_custom_id_to_email helper function
CREATE OR REPLACE FUNCTION public.resolve_custom_id_to_email(_custom_id TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  resolved_email TEXT;
BEGIN
  SELECT email INTO resolved_email FROM public.profiles WHERE custom_id = _custom_id;
  RETURN resolved_email;
END;
$$;
