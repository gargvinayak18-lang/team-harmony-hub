-- Update public.can_assign to allow admins to assign tasks to themselves and other admins,
-- and clean up supervisor and senior developer roles.
CREATE OR REPLACE FUNCTION public.can_assign(_assigner UUID, _assignee UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  assignee_dept public.department;
  assignee_roles public.app_role[];
BEGIN
  -- If assigner is admin, they can assign tasks to anyone, including themselves or other admins
  IF public.is_admin(_assigner) THEN RETURN TRUE; END IF;
  
  -- For non-admins, self-assignment is not allowed
  IF _assigner = _assignee THEN RETURN FALSE; END IF;

  SELECT department INTO assignee_dept FROM public.profiles WHERE id = _assignee;
  SELECT array_agg(role) INTO assignee_roles FROM public.user_roles WHERE user_id = _assignee;

  -- Tech PM -> Developer (tech_jr_dev)
  IF public.has_role(_assigner, 'tech_pm') AND assignee_dept = 'tech'
     AND ('tech_jr_dev' = ANY(assignee_roles)) THEN
    RETURN TRUE;
  END IF;
  -- Marketing head -> marketing staff/head
  IF public.has_role(_assigner, 'marketing_head') AND assignee_dept = 'marketing' THEN
    RETURN TRUE;
  END IF;
  -- HR head -> hr staff/head
  IF public.has_role(_assigner, 'hr_head') AND assignee_dept = 'hr' THEN
    RETURN TRUE;
  END IF;
  RETURN FALSE;
END;
$$;
