-- 1. Create organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 2. Add organization_id to existing tables
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Create admin_notes if it doesn't exist
CREATE TABLE IF NOT EXISTS public.admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

-- 3. Create or replace helper functions
CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id UUID)
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  org_id UUID;
BEGIN
  SELECT organization_id INTO org_id FROM public.profiles WHERE id = _user_id LIMIT 1;
  RETURN org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  role_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) INTO role_exists;
  RETURN role_exists;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'global_admin') INTO admin_exists;
  RETURN admin_exists;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_organization(_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- Insert the organization
  INSERT INTO public.organizations (name) VALUES (_name) RETURNING id INTO new_org_id;
  
  -- Update the caller's profile to belong to this organization
  UPDATE public.profiles SET organization_id = new_org_id WHERE id = auth.uid();
  
  -- Assign global_admin role to the creator for this new organization
  INSERT INTO public.user_roles (user_id, organization_id, role) VALUES (auth.uid(), new_org_id, 'global_admin');
  
  RETURN new_org_id;
END;
$$;

-- 4. Update the trigger to auto-assign organization_id on signup if provided in metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  org_id UUID;
BEGIN
  org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;

  INSERT INTO public.profiles (id, name, email, department, custom_id, organization_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'department', '')::public.department,
    NEW.raw_user_meta_data->>'custom_id',
    org_id
  );
  
  IF NEW.raw_user_meta_data->>'role' IS NOT NULL AND org_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, organization_id)
    VALUES (NEW.id, (NEW.raw_user_meta_data->>'role')::public.app_role, org_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Apply new RLS Policies for Multi-Tenancy

-- Organizations
DROP POLICY IF EXISTS "org_select_member" ON public.organizations;
CREATE POLICY "org_select_member" ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "org_insert_auth" ON public.organizations;
CREATE POLICY "org_insert_auth" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Profiles
DROP POLICY IF EXISTS "profiles_select_auth" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_org" ON public.profiles;
CREATE POLICY "profiles_select_org" ON public.profiles
  FOR SELECT TO authenticated 
  USING (organization_id = public.get_user_organization(auth.uid()) OR id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert_org" ON public.profiles;
CREATE POLICY "profiles_insert_org" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head')));

DROP POLICY IF EXISTS "profiles_update_org" ON public.profiles;
CREATE POLICY "profiles_update_org" ON public.profiles
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR id = auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR id = auth.uid()));

DROP POLICY IF EXISTS "profiles_delete_org" ON public.profiles;
CREATE POLICY "profiles_delete_org" ON public.profiles
  FOR DELETE TO authenticated 
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.is_admin(auth.uid()));

-- User roles
DROP POLICY IF EXISTS "roles_select_auth" ON public.user_roles;
DROP POLICY IF EXISTS "roles_select_org" ON public.user_roles;
CREATE POLICY "roles_select_org" ON public.user_roles
  FOR SELECT TO authenticated 
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "roles_insert_org" ON public.user_roles;
CREATE POLICY "roles_insert_org" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head')));

DROP POLICY IF EXISTS "roles_delete_org" ON public.user_roles;
CREATE POLICY "roles_delete_org" ON public.user_roles
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head')));

-- Tasks
DROP POLICY IF EXISTS "tasks_select_org" ON public.tasks;
CREATE POLICY "tasks_select_org" ON public.tasks
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.can_view_task(auth.uid(), assignee_id, assigner_id));

DROP POLICY IF EXISTS "tasks_insert_org" ON public.tasks;
CREATE POLICY "tasks_insert_org" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid())
    AND assigner_id = auth.uid()
    AND public.can_assign(auth.uid(), assignee_id)
  );

DROP POLICY IF EXISTS "tasks_update_org" ON public.tasks;
CREATE POLICY "tasks_update_org" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid()) AND (
      assignee_id = auth.uid()
      OR assigner_id = auth.uid()
      OR public.is_admin(auth.uid())
      OR public.can_view_task(auth.uid(), assignee_id, assigner_id)
    )
  )
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid()) AND (
      assignee_id = auth.uid()
      OR assigner_id = auth.uid()
      OR public.is_admin(auth.uid())
      OR public.can_view_task(auth.uid(), assignee_id, assigner_id)
    )
  );

DROP POLICY IF EXISTS "tasks_delete_org" ON public.tasks;
CREATE POLICY "tasks_delete_org" ON public.tasks
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND (assigner_id = auth.uid() OR public.is_admin(auth.uid())));

-- Attendance
DROP POLICY IF EXISTS "att_select_org" ON public.attendance;
CREATE POLICY "att_select_org" ON public.attendance
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid()) AND (
      employee_id = auth.uid()
      OR public.is_admin(auth.uid())
      OR (
        public.get_department(auth.uid()) = public.get_department(employee_id)
        AND (
          public.has_role(auth.uid(), 'tech_pm')
          OR public.has_role(auth.uid(), 'marketing_head')
          OR public.has_role(auth.uid(), 'hr_head')
        )
      )
    )
  );

DROP POLICY IF EXISTS "att_insert_org" ON public.attendance;
CREATE POLICY "att_insert_org" ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND employee_id = auth.uid());

DROP POLICY IF EXISTS "att_update_org" ON public.attendance;
CREATE POLICY "att_update_org" ON public.attendance
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND employee_id = auth.uid())
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND employee_id = auth.uid());

-- Admin Notes
DROP POLICY IF EXISTS "notes_select_org" ON public.admin_notes;
CREATE POLICY "notes_select_org" ON public.admin_notes
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR public.has_role(auth.uid(), 'tech_pm') OR public.has_role(auth.uid(), 'marketing_head')));

DROP POLICY IF EXISTS "notes_insert_org" ON public.admin_notes;
CREATE POLICY "notes_insert_org" ON public.admin_notes
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR public.has_role(auth.uid(), 'tech_pm') OR public.has_role(auth.uid(), 'marketing_head')));

DROP POLICY IF EXISTS "notes_update_org" ON public.admin_notes;
CREATE POLICY "notes_update_org" ON public.admin_notes
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR public.has_role(auth.uid(), 'tech_pm') OR public.has_role(auth.uid(), 'marketing_head')))
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR public.has_role(auth.uid(), 'tech_pm') OR public.has_role(auth.uid(), 'marketing_head')));

DROP POLICY IF EXISTS "notes_delete_org" ON public.admin_notes;
CREATE POLICY "notes_delete_org" ON public.admin_notes
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR public.has_role(auth.uid(), 'tech_pm') OR public.has_role(auth.uid(), 'marketing_head')));
