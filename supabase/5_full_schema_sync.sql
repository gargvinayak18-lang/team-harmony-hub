-- MASTER UPGRADE SCRIPT: Force Schema Sync & Restore Admin
-- Please run this ENTIRE script in your Supabase SQL Editor.

-- 1. Ensure organizations exist
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Ensure ALL tables have organization_id
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

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

-- 3. Create departments and roles tables
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  level INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Alter profiles and user_roles to match the dynamic structure
ALTER TABLE public.profiles DROP COLUMN IF EXISTS department;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

ALTER TABLE public.user_roles DROP COLUMN IF EXISTS role;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS is_global_admin BOOLEAN NOT NULL DEFAULT false;

-- 5. Restore Global Admin to the first created user
UPDATE public.user_roles
SET is_global_admin = true
WHERE user_id = (
  SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 1
);

-- 6. Helper Functions
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
  is_adm := public.is_admin(_user_id);
  IF is_adm THEN RETURN true; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = _user_id AND r.permissions ? _perm
  ) INTO perm_exists;
  RETURN perm_exists;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.profiles WHERE id = _user_id LIMIT 1;
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

-- 7. Drop old policies
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

-- 8. Recreate core policies
CREATE POLICY "profiles_select_org" ON public.profiles FOR SELECT TO authenticated 
  USING (organization_id = public.get_user_organization(auth.uid()) OR id = auth.uid());
CREATE POLICY "profiles_all_org" ON public.profiles FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_employees'))
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_employees'));

CREATE POLICY "user_roles_select_org" ON public.user_roles FOR SELECT TO authenticated 
  USING (organization_id = public.get_user_organization(auth.uid()));
CREATE POLICY "user_roles_all_org" ON public.user_roles FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_employees'))
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_employees'));
