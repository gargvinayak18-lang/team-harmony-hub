-- ==========================================
-- STEP 1: Add the enum value (Must be run and committed FIRST)
-- ==========================================
ALTER TYPE public.app_role ADD VALUE 'supervisor';

-- ==========================================
-- STEP 2: Recreate functions and policies (Run after Step 1 commits)
-- ==========================================
-- 2. Update can_view_task to allow supervisors to view all tasks
CREATE OR REPLACE FUNCTION public.can_view_task(_user UUID, _assignee UUID, _assigner UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_dept public.department;
  assignee_dept public.department;
BEGIN
  IF _user = _assignee OR _user = _assigner THEN RETURN TRUE; END IF;
  IF public.is_admin(_user) THEN RETURN TRUE; END IF;
  IF public.has_role(_user, 'supervisor') THEN RETURN TRUE; END IF; -- Allow supervisor to view any task

  user_dept := public.get_department(_user);
  assignee_dept := public.get_department(_assignee);
  IF user_dept IS NULL OR user_dept != assignee_dept THEN RETURN FALSE; END IF;

  IF public.has_role(_user, 'tech_pm') AND user_dept = 'tech' THEN RETURN TRUE; END IF;
  IF public.has_role(_user, 'marketing_head') AND user_dept = 'marketing' THEN RETURN TRUE; END IF;
  IF public.has_role(_user, 'hr_head') AND user_dept = 'hr' THEN RETURN TRUE; END IF;
  RETURN FALSE;
END;
$$;

-- 3. Update can_assign to allow supervisors to assign tasks to anyone
CREATE OR REPLACE FUNCTION public.can_assign(_assigner UUID, _assignee UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  assignee_dept public.department;
  assignee_roles public.app_role[];
BEGIN
  IF _assigner = _assignee THEN RETURN FALSE; END IF;
  IF public.is_admin(_assigner) THEN RETURN TRUE; END IF;
  IF public.has_role(_assigner, 'supervisor') THEN RETURN TRUE; END IF; -- Allow supervisor to assign tasks to anyone

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

-- 4. Recreate attendance select policy to allow supervisors
DROP POLICY IF EXISTS "att_select_own_or_lead" ON public.attendance;
CREATE POLICY "att_select_own_or_lead" ON public.attendance
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'supervisor') -- Allow supervisor to view all attendance
    OR (
      public.get_department(auth.uid()) = public.get_department(employee_id)
      AND (
        public.has_role(auth.uid(), 'tech_pm')
        OR public.has_role(auth.uid(), 'marketing_head')
        OR public.has_role(auth.uid(), 'hr_head')
      )
    )
  );

-- 5. Recreate admin_notes policies to allow supervisors
DROP POLICY IF EXISTS "admin_notes_select" ON public.admin_notes;
DROP POLICY IF EXISTS "admin_notes_insert" ON public.admin_notes;
DROP POLICY IF EXISTS "admin_notes_update" ON public.admin_notes;
DROP POLICY IF EXISTS "admin_notes_delete" ON public.admin_notes;

CREATE POLICY "admin_notes_select" ON public.admin_notes
  FOR SELECT TO authenticated USING (
    auth.uid() = employee_id 
    OR public.is_admin(auth.uid()) 
    OR public.has_role(auth.uid(), 'hr_head')
    OR public.has_role(auth.uid(), 'supervisor') -- Allow supervisor to view notes
  );

CREATE POLICY "admin_notes_insert" ON public.admin_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "admin_notes_update" ON public.admin_notes
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR public.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "admin_notes_delete" ON public.admin_notes
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head') OR public.has_role(auth.uid(), 'supervisor'));
