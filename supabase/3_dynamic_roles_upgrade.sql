-- DYNAMIC ROLES AND DEPARTMENTS UPGRADE SCRIPT
-- Run this in your Supabase SQL Editor.

-- STEP 1: DROP ALL EXISTING POLICIES AND OLD FUNCTIONS
-- We must drop policies first because they depend on columns we are about to drop.
DROP POLICY IF EXISTS "profiles_select_org" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_org" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_org" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_org" ON public.profiles;

DROP POLICY IF EXISTS "roles_select_org" ON public.user_roles;
DROP POLICY IF EXISTS "roles_insert_org" ON public.user_roles;
DROP POLICY IF EXISTS "roles_delete_org" ON public.user_roles;

DROP POLICY IF EXISTS "tasks_select_org" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert_org" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update_org" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_org" ON public.tasks;

DROP POLICY IF EXISTS "att_select_org" ON public.attendance;
DROP POLICY IF EXISTS "att_insert_org" ON public.attendance;
DROP POLICY IF EXISTS "att_update_org" ON public.attendance;

DROP POLICY IF EXISTS "notes_select_org" ON public.admin_notes;
DROP POLICY IF EXISTS "notes_insert_org" ON public.admin_notes;
DROP POLICY IF EXISTS "notes_update_org" ON public.admin_notes;
DROP POLICY IF EXISTS "notes_delete_org" ON public.admin_notes;

-- Drop old helper functions that rely on enums
DROP FUNCTION IF EXISTS public.can_assign(UUID, UUID);
DROP FUNCTION IF EXISTS public.can_view_task(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.get_department(UUID);
DROP FUNCTION IF EXISTS public.get_roles(UUID);
DROP FUNCTION IF EXISTS public.has_role(UUID, public.app_role);

-- STEP 2: CREATE NEW TABLES FOR DYNAMIC RBAC
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  level INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- STEP 3: MODIFY PROFILES AND USER_ROLES
ALTER TABLE public.profiles DROP COLUMN IF EXISTS department;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

ALTER TABLE public.user_roles DROP COLUMN IF EXISTS role;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS is_global_admin BOOLEAN NOT NULL DEFAULT false;

-- STEP 4: RECREATE HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND is_global_admin = true) INTO admin_exists;
  RETURN admin_exists;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _perm TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_adm BOOLEAN;
  perm_exists BOOLEAN;
BEGIN
  -- Global admin override
  is_adm := public.is_admin(_user_id);
  IF is_adm THEN
    RETURN true;
  END IF;

  -- Check if any of user's roles has the permission in its JSONB array
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = _user_id 
    AND r.permissions ? _perm
  ) INTO perm_exists;

  RETURN perm_exists;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_department_id(_user_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT department_id FROM public.profiles WHERE id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_max_role_level(_user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MAX(r.level), -1) 
  FROM public.user_roles ur
  JOIN public.roles r ON ur.role_id = r.id
  WHERE ur.user_id = _user_id;
$$;

-- STEP 5: REWRITE SYSTEM FUNCTIONS (create_organization, handle_new_user)
CREATE OR REPLACE FUNCTION public.create_organization(_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org_id UUID;
BEGIN
  INSERT INTO public.organizations (name) VALUES (_name) RETURNING id INTO new_org_id;
  UPDATE public.profiles SET organization_id = new_org_id WHERE id = auth.uid();
  -- The creator gets a global_admin role assignment
  INSERT INTO public.user_roles (user_id, organization_id, is_global_admin) VALUES (auth.uid(), new_org_id, true);
  RETURN new_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  org_id UUID;
BEGIN
  org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;

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

-- STEP 6: RECREATE ALL POLICIES WITH DYNAMIC PERMISSIONS

-- Organizations (No changes needed, already uses get_user_organization)
-- Departments
CREATE POLICY "dept_select_org" ON public.departments FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()));
CREATE POLICY "dept_all_org" ON public.departments FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_organization'))
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_organization'));

-- Roles
CREATE POLICY "roles_select_org" ON public.roles FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()));
CREATE POLICY "roles_all_org" ON public.roles FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_organization'))
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_organization'));

-- Profiles
CREATE POLICY "profiles_select_org" ON public.profiles FOR SELECT TO authenticated 
  USING (organization_id = public.get_user_organization(auth.uid()) OR id = auth.uid());
CREATE POLICY "profiles_all_org" ON public.profiles FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_employees'))
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_employees'));

-- User roles
CREATE POLICY "user_roles_select_org" ON public.user_roles FOR SELECT TO authenticated 
  USING (organization_id = public.get_user_organization(auth.uid()));
CREATE POLICY "user_roles_all_org" ON public.user_roles FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_employees'))
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_employees'));

-- Tasks
CREATE POLICY "tasks_select_org" ON public.tasks FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid()) AND (
      assignee_id = auth.uid() OR assigner_id = auth.uid() 
      OR public.has_permission(auth.uid(), 'view_tasks_all')
    )
  );

CREATE POLICY "tasks_insert_org" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid()) AND assigner_id = auth.uid() AND (
      public.has_permission(auth.uid(), 'assign_tasks_all') OR 
      (public.has_permission(auth.uid(), 'assign_tasks_dept') AND public.get_user_department_id(auth.uid()) = public.get_user_department_id(assignee_id) AND public.get_user_max_role_level(auth.uid()) >= public.get_user_max_role_level(assignee_id))
    )
  );

CREATE POLICY "tasks_update_org" ON public.tasks FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid()) AND (
      assignee_id = auth.uid() OR assigner_id = auth.uid() 
      OR public.has_permission(auth.uid(), 'assign_tasks_all')
    )
  );

CREATE POLICY "tasks_delete_org" ON public.tasks FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND (assigner_id = auth.uid() OR public.has_permission(auth.uid(), 'assign_tasks_all')));

-- Attendance
CREATE POLICY "att_select_org" ON public.attendance FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid()) AND (
      employee_id = auth.uid() 
      OR public.has_permission(auth.uid(), 'view_attendance_all')
      OR (public.has_permission(auth.uid(), 'view_attendance_dept') AND public.get_user_department_id(auth.uid()) = public.get_user_department_id(employee_id))
    )
  );

CREATE POLICY "att_insert_org" ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND employee_id = auth.uid());

CREATE POLICY "att_update_org" ON public.attendance FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND employee_id = auth.uid());

-- Admin Notes
CREATE POLICY "notes_select_org" ON public.admin_notes FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_notes'));

CREATE POLICY "notes_insert_org" ON public.admin_notes FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_notes'));

CREATE POLICY "notes_update_org" ON public.admin_notes FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_notes'));

CREATE POLICY "notes_delete_org" ON public.admin_notes FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_notes'));
