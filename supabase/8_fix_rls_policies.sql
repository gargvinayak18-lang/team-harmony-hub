-- FIX MISSING AND DROPPED RLS POLICIES
-- Run this in your Supabase SQL Editor.

-- Enable RLS on all dynamic tables
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- Drop existing ones just to be safe
DROP POLICY IF EXISTS "dept_select_org" ON public.departments;
DROP POLICY IF EXISTS "dept_all_org" ON public.departments;
DROP POLICY IF EXISTS "roles_select_org" ON public.roles;
DROP POLICY IF EXISTS "roles_all_org" ON public.roles;
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

-- 1. Departments
CREATE POLICY "dept_select_org" ON public.departments FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()));
CREATE POLICY "dept_all_org" ON public.departments FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_organization'))
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_organization'));

-- 2. Roles
CREATE POLICY "roles_select_org" ON public.roles FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()));
CREATE POLICY "roles_all_org" ON public.roles FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_organization'))
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_organization'));

-- 3. Tasks
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

-- 4. Attendance
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

-- 5. Admin Notes
CREATE POLICY "notes_select_org" ON public.admin_notes FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_notes'));

CREATE POLICY "notes_insert_org" ON public.admin_notes FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_notes'));

CREATE POLICY "notes_update_org" ON public.admin_notes FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_notes'));

CREATE POLICY "notes_delete_org" ON public.admin_notes FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.has_permission(auth.uid(), 'manage_notes'));
