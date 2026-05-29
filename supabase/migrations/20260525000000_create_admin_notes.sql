-- Create admin_notes table to store weekly/monthly manager reviews
CREATE TABLE IF NOT EXISTS public.admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('weekly', 'monthly')),
  period_start DATE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, period_type, period_start)
);

-- Enable RLS
ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

-- Select policy: Allow employees to view notes written about them, and let admins/HR view all notes
CREATE POLICY "admin_notes_select" ON public.admin_notes
  FOR SELECT TO authenticated USING (
    auth.uid() = employee_id 
    OR public.is_admin(auth.uid()) 
    OR public.has_role(auth.uid(), 'hr_head')
  );

-- Insert/Update/Delete policies: Only allow admins and HR to write notes
CREATE POLICY "admin_notes_insert" ON public.admin_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head'));

CREATE POLICY "admin_notes_update" ON public.admin_notes
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head'));

CREATE POLICY "admin_notes_delete" ON public.admin_notes
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr_head'));
