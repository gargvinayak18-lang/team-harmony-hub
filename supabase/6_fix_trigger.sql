-- Fix the handle_new_user trigger function to match the dynamic roles schema
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  org_id UUID;
BEGIN
  -- Safe cast, will return NULL if organization_id isn't present in meta data
  org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;

  -- Insert the bare minimum profile data. We no longer set 'department' or 'role' here
  -- because those are now handled via dynamic IDs in the UI.
  INSERT INTO public.profiles (id, name, email, custom_id, organization_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'custom_id',
    org_id
  );
  
  RETURN NEW;
END;
$$;
