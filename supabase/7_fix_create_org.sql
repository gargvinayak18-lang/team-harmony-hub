-- Fix the create_organization function to match the dynamic roles schema
CREATE OR REPLACE FUNCTION public.create_organization(_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- 1. Create the new organization
  INSERT INTO public.organizations (name) VALUES (_name) RETURNING id INTO new_org_id;
  
  -- 2. Link the current user to this new organization
  UPDATE public.profiles SET organization_id = new_org_id WHERE id = auth.uid();
  
  -- 3. Assign the user as a global admin. 
  -- We use is_global_admin = true instead of the deleted role enum column.
  INSERT INTO public.user_roles (user_id, organization_id, is_global_admin) 
  VALUES (auth.uid(), new_org_id, true);
  
  RETURN new_org_id;
END;
$$;
