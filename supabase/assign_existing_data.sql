DO $$
DECLARE
  target_org_id UUID;
BEGIN
  -- Get the first created organization (which should be "GargAndSons")
  SELECT id INTO target_org_id FROM public.organizations ORDER BY created_at ASC LIMIT 1;

  IF target_org_id IS NOT NULL THEN
    -- Assign all unassigned users to this main organization
    UPDATE public.profiles SET organization_id = target_org_id WHERE organization_id IS NULL;
    UPDATE public.user_roles SET organization_id = target_org_id WHERE organization_id IS NULL;
    
    -- Assign all unassigned historical data to this main organization
    UPDATE public.tasks SET organization_id = target_org_id WHERE organization_id IS NULL;
    UPDATE public.attendance SET organization_id = target_org_id WHERE organization_id IS NULL;
    UPDATE public.admin_notes SET organization_id = target_org_id WHERE organization_id IS NULL;
  END IF;
END;
$$;
