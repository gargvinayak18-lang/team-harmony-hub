-- ==========================================
-- CONSOLIDATED SCHEMAS FOR ADMIN PORTAL
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

-- 2. Profiles Table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  department public.department,
  custom_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. User Roles Table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Tasks Table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- 5. Attendance Table
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, date)
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_attendance_employee ON public.attendance(employee_id);
CREATE INDEX idx_attendance_date ON public.attendance(date);

-- 6. Helper Functions (Security Definer)
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
BEGIN
  IF _assigner = _assignee THEN RETURN FALSE; END IF;
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
BEGIN
  IF _user = _assignee OR _user = _assigner THEN RETURN TRUE; END IF;
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

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger for tasks
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE OR REPLACE TRIGGER tasks_touch BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Resolve custom_id to email helper function
CREATE OR REPLACE FUNCTION public.resolve_custom_id_to_email(_custom_id TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  resolved_email TEXT;
BEGIN
  SELECT email INTO resolved_email FROM public.profiles WHERE custom_id = _custom_id;
  RETURN resolved_email;
END;
$$;

-- ============== RLS POLICIES ==============

-- Profiles
CREATE POLICY "profiles_select_auth" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_admin_hr" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head'));
CREATE POLICY "profiles_update_admin_hr_or_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR id = auth.uid())
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR id = auth.uid());
CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- User roles
CREATE POLICY "roles_select_auth" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_insert_admin_hr" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head'));
CREATE POLICY "roles_delete_admin_hr" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head'));

-- Tasks
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (public.can_view_task(auth.uid(), assignee_id, assigner_id));

CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    assigner_id = auth.uid()
    AND public.can_assign(auth.uid(), assignee_id)
  );

CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    assignee_id = auth.uid()
    OR assigner_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.can_view_task(auth.uid(), assignee_id, assigner_id)
  )
  WITH CHECK (
    assignee_id = auth.uid()
    OR assigner_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.can_view_task(auth.uid(), assignee_id, assigner_id)
  );

CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE TO authenticated
  USING (assigner_id = auth.uid() OR public.is_admin(auth.uid()));

-- Attendance
CREATE POLICY "att_select_own_or_lead" ON public.attendance
  FOR SELECT TO authenticated
  USING (
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
  );
CREATE POLICY "att_insert_own" ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());
CREATE POLICY "att_update_own" ON public.attendance
  FOR UPDATE TO authenticated
  USING (employee_id = auth.uid())
  WITH CHECK (employee_id = auth.uid());
