-- Migration: Fix Attendance and Tasks RLS Policies and Stale Functions
-- Description: Drops legacy functions and RLS policies that referenced the deleted "department" column on public.profiles.

-- 1. Drop stale functions and their dependent objects (including old policies like "att_select_own_or_lead" and "tasks_select_own_or_assigned")
DROP FUNCTION IF EXISTS public.get_department(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.can_view_task(UUID, UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.can_assign(UUID, UUID) CASCADE;

-- 2. Ensure RLS is enabled on attendance table
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- 3. Recreate clean, dynamic RLS policies on attendance table
DROP POLICY IF EXISTS "att_select_org" ON public.attendance;
DROP POLICY IF EXISTS "att_insert_org" ON public.attendance;
DROP POLICY IF EXISTS "att_update_org" ON public.attendance;

CREATE POLICY "att_select_org" ON public.attendance
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.has_permission(auth.uid(), 'view_attendance_all')
    OR (
      public.has_permission(auth.uid(), 'view_attendance_dept')
      AND public.get_user_department_id(auth.uid()) = public.get_user_department_id(employee_id)
    )
  );

CREATE POLICY "att_insert_org" ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());

CREATE POLICY "att_update_org" ON public.attendance
  FOR UPDATE TO authenticated
  USING (employee_id = auth.uid())
  WITH CHECK (employee_id = auth.uid());

-- 4. Ensure RLS is enabled on tasks table
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 5. Recreate clean, dynamic RLS policies on tasks table
DROP POLICY IF EXISTS "tasks_select_org" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert_org" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update_org" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_org" ON public.tasks;

CREATE POLICY "tasks_select_org" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    assignee_id = auth.uid()
    OR assigner_id = auth.uid()
    OR public.has_permission(auth.uid(), 'assign_tasks_all')
    OR (
      public.has_permission(auth.uid(), 'assign_tasks_dept')
      AND public.get_user_department_id(auth.uid()) = public.get_user_department_id(assignee_id)
      AND public.get_user_max_role_level(auth.uid()) >= public.get_user_max_role_level(assignee_id)
    )
  );

CREATE POLICY "tasks_insert_org" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    assigner_id = auth.uid()
    AND (
      assignee_id = auth.uid()
      OR public.has_permission(auth.uid(), 'assign_tasks_all')
      OR (
        public.has_permission(auth.uid(), 'assign_tasks_dept')
        AND public.get_user_department_id(auth.uid()) = public.get_user_department_id(assignee_id)
        AND public.get_user_max_role_level(auth.uid()) >= public.get_user_max_role_level(assignee_id)
      )
    )
  );

CREATE POLICY "tasks_update_org" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    assignee_id = auth.uid()
    OR assigner_id = auth.uid()
    OR public.has_permission(auth.uid(), 'assign_tasks_all')
    OR (
      public.has_permission(auth.uid(), 'assign_tasks_dept')
      AND public.get_user_department_id(auth.uid()) = public.get_user_department_id(assignee_id)
      AND public.get_user_max_role_level(auth.uid()) >= public.get_user_max_role_level(assignee_id)
    )
  )
  WITH CHECK (
    assignee_id = auth.uid()
    OR assigner_id = auth.uid()
    OR public.has_permission(auth.uid(), 'assign_tasks_all')
    OR (
      public.has_permission(auth.uid(), 'assign_tasks_dept')
      AND public.get_user_department_id(auth.uid()) = public.get_user_department_id(assignee_id)
      AND public.get_user_max_role_level(auth.uid()) >= public.get_user_max_role_level(assignee_id)
    )
  );

CREATE POLICY "tasks_delete_org" ON public.tasks
  FOR DELETE TO authenticated
  USING (
    assigner_id = auth.uid()
    OR public.has_permission(auth.uid(), 'assign_tasks_all')
  );
