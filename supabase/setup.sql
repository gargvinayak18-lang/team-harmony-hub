-- ==========================================
-- CONSOLIDATED SCHEMAS FOR ADMIN PORTAL (MULTI-TENANT)
-- ==========================================

-- 1. Enums
CREATE TYPE public.department AS ENUM ('tech', 'marketing', 'hr');
CREATE TYPE public.app_role AS ENUM (
  'global_admin',
  'tech_pm', 'tech_sr_dev', 'tech_jr_dev',
  'marketing_head', 'marketing_staff',
  'hr_head', 'hr_staff'
);
CREATE TYPE public.task_status AS ENUM ('todo', 'in_progress', 'done');

-- 2. Organizations Table (New)
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 3. Profiles Table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  department public.department,
  custom_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, custom_id) -- custom_id is unique per org
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. User Roles Table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role, organization_id)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. Tasks Table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.task_status NOT NULL DEFAULT 'todo',
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tasks_assignee ON public.tasks(assignee_id);
CREATE INDEX idx_tasks_assigner ON public.tasks(assigner_id);
CREATE INDEX idx_tasks_organization ON public.tasks(organization_id);

-- 6. Attendance Table
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, date, organization_id)
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_attendance_employee ON public.attendance(employee_id);
CREATE INDEX idx_attendance_date ON public.attendance(date);
CREATE INDEX idx_attendance_organization ON public.attendance(organization_id);

-- 7. Admin Notes Table (Assuming it existed but wasn't in original dump, adding it here for completeness)
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


-- 8. Helper Functions (Security Definer)

CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.profiles WHERE id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'global_admin')
$$;

CREATE OR REPLACE FUNCTION public.get_department(_user_id UUID)
RETURNS public.department LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT department FROM public.profiles WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.get_roles(_user_id UUID)
RETURNS SETOF public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
$$;

-- Can assigner assign to assignee?
CREATE OR REPLACE FUNCTION public.can_assign(_assigner UUID, _assignee UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  assignee_dept public.department;
  assignee_roles public.app_role[];
  assigner_org UUID;
  assignee_org UUID;
BEGIN
  IF _assigner = _assignee THEN RETURN FALSE; END IF;
  
  assigner_org := public.get_user_organization(_assigner);
  assignee_org := public.get_user_organization(_assignee);
  
  IF assigner_org IS NULL OR assigner_org != assignee_org THEN RETURN FALSE; END IF;

  IF public.is_admin(_assigner) THEN RETURN TRUE; END IF;

  SELECT department INTO assignee_dept FROM public.profiles WHERE id = _assignee;
  SELECT array_agg(role) INTO assignee_roles FROM public.user_roles WHERE user_id = _assignee;

  -- Tech PM -> sr or jr dev
  IF public.has_role(_assigner, 'tech_pm') AND assignee_dept = 'tech'
     AND ('tech_sr_dev' = ANY(assignee_roles) OR 'tech_jr_dev' = ANY(assignee_roles)) THEN
    RETURN TRUE;
  END IF;
  -- Sr Dev -> jr dev
  IF public.has_role(_assigner, 'tech_sr_dev') AND 'tech_jr_dev' = ANY(assignee_roles) THEN
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

-- Can user view a given task
CREATE OR REPLACE FUNCTION public.can_view_task(_user UUID, _assignee UUID, _assigner UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_dept public.department;
  assignee_dept public.department;
  user_org UUID;
  assignee_org UUID;
BEGIN
  IF _user = _assignee OR _user = _assigner THEN RETURN TRUE; END IF;

  user_org := public.get_user_organization(_user);
  assignee_org := public.get_user_organization(_assignee);

  IF user_org IS NULL OR user_org != assignee_org THEN RETURN FALSE; END IF;
  IF public.is_admin(_user) THEN RETURN TRUE; END IF;

  user_dept := public.get_department(_user);
  assignee_dept := public.get_department(_assignee);
  IF user_dept IS NULL OR user_dept != assignee_dept THEN RETURN FALSE; END IF;

  IF public.has_role(_user, 'tech_pm') AND user_dept = 'tech' THEN RETURN TRUE; END IF;
  IF public.has_role(_user, 'marketing_head') AND user_dept = 'marketing' THEN RETURN TRUE; END IF;
  IF public.has_role(_user, 'hr_head') AND user_dept = 'hr' THEN RETURN TRUE; END IF;
  RETURN FALSE;
END;
$$;

-- Auto-create profile on signup
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

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

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

-- updated_at trigger for tasks
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE OR REPLACE TRIGGER tasks_touch BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Resolve custom_id to email helper function
CREATE OR REPLACE FUNCTION public.resolve_custom_id_to_email(_custom_id TEXT, _org_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  resolved_email TEXT;
BEGIN
  SELECT email INTO resolved_email FROM public.profiles WHERE custom_id = _custom_id AND organization_id = _org_id;
  RETURN resolved_email;
END;
$$;

-- ============== RLS POLICIES ==============

-- Organizations
CREATE POLICY "org_select_member" ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.get_user_organization(auth.uid()));

CREATE POLICY "org_insert_auth" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Profiles
CREATE POLICY "profiles_select_org" ON public.profiles
  FOR SELECT TO authenticated 
  USING (organization_id = public.get_user_organization(auth.uid()) OR id = auth.uid());

CREATE POLICY "profiles_insert_org" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head')));

CREATE POLICY "profiles_update_org" ON public.profiles
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR id = auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR id = auth.uid()));

CREATE POLICY "profiles_delete_org" ON public.profiles
  FOR DELETE TO authenticated 
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.is_admin(auth.uid()));

-- User roles
CREATE POLICY "roles_select_org" ON public.user_roles
  FOR SELECT TO authenticated 
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "roles_insert_org" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head')));

CREATE POLICY "roles_delete_org" ON public.user_roles
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head')));

-- Tasks
CREATE POLICY "tasks_select_org" ON public.tasks
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.can_view_task(auth.uid(), assignee_id, assigner_id));

CREATE POLICY "tasks_insert_org" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid())
    AND assigner_id = auth.uid()
    AND public.can_assign(auth.uid(), assignee_id)
  );

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

CREATE POLICY "tasks_delete_org" ON public.tasks
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND (assigner_id = auth.uid() OR public.is_admin(auth.uid())));

-- Attendance
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

CREATE POLICY "att_insert_org" ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND employee_id = auth.uid());

CREATE POLICY "att_update_org" ON public.attendance
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND employee_id = auth.uid())
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND employee_id = auth.uid());

-- Admin Notes
CREATE POLICY "notes_select_org" ON public.admin_notes
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR public.has_role(auth.uid(), 'tech_pm') OR public.has_role(auth.uid(), 'marketing_head')));

CREATE POLICY "notes_insert_org" ON public.admin_notes
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR public.has_role(auth.uid(), 'tech_pm') OR public.has_role(auth.uid(), 'marketing_head')));

CREATE POLICY "notes_update_org" ON public.admin_notes
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR public.has_role(auth.uid(), 'tech_pm') OR public.has_role(auth.uid(), 'marketing_head')))
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR public.has_role(auth.uid(), 'tech_pm') OR public.has_role(auth.uid(), 'marketing_head')));

CREATE POLICY "notes_delete_org" ON public.admin_notes
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR public.has_role(auth.uid(), 'tech_pm') OR public.has_role(auth.uid(), 'marketing_head')));

