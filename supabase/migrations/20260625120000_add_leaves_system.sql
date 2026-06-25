-- Migration: Add Leave Management System
-- Run this in your Supabase SQL Editor.

-- 1. Create leave_categories table
CREATE TABLE IF NOT EXISTS public.leave_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  max_days INTEGER, -- Optional yearly limit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_category_per_org UNIQUE (organization_id, name)
);

-- Enable RLS on leave_categories
ALTER TABLE public.leave_categories ENABLE ROW LEVEL SECURITY;

-- 2. Create leave_requests table
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.leave_categories(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_date_range CHECK (start_date <= end_date)
);

-- Enable RLS on leave_requests
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for leave_categories

-- Allow all authenticated users in the organization to select categories
CREATE POLICY "select_leave_categories" ON public.leave_categories FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()));

-- Allow admins (manage_organization permission or global admin) to manage categories
CREATE POLICY "manage_leave_categories" ON public.leave_categories FOR ALL TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid()) AND (
      public.is_admin(auth.uid()) OR 
      public.has_permission(auth.uid(), 'manage_organization')
    )
  )
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid()) AND (
      public.is_admin(auth.uid()) OR 
      public.has_permission(auth.uid(), 'manage_organization')
    )
  );

-- 4. RLS Policies for leave_requests

-- Select leaves: users can select their own leaves, OR admins/managers can select all leaves in their organization
CREATE POLICY "select_leave_requests" ON public.leave_requests FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid()) AND (
      employee_id = auth.uid() OR 
      public.is_admin(auth.uid()) OR 
      public.has_permission(auth.uid(), 'manage_employees')
    )
  );

-- Insert leaves: employees can insert their own leaves in their organization
CREATE POLICY "insert_leave_requests" ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid()) AND 
    employee_id = auth.uid()
  );

-- Update leaves: users can update/cancel their own pending leaves, OR managers can update statuses (approve/reject)
CREATE POLICY "update_leave_requests" ON public.leave_requests FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid()) AND (
      (employee_id = auth.uid() AND status = 'pending') OR 
      public.is_admin(auth.uid()) OR 
      public.has_permission(auth.uid(), 'manage_employees')
    )
  );

-- Delete leaves: users can delete/cancel their own pending leaves
CREATE POLICY "delete_leave_requests" ON public.leave_requests FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid()) AND 
    employee_id = auth.uid() AND 
    status = 'pending'
  );

-- 5. Triggers for updated_at
CREATE TRIGGER handle_updated_at_leave_categories
  BEFORE UPDATE ON public.leave_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER handle_updated_at_leave_requests
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- 6. Insert default categories for existing organizations
INSERT INTO public.leave_categories (organization_id, name, description, max_days)
SELECT id, 'Sick Leave', 'Standard sick leave allowance', 12 FROM public.organizations
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO public.leave_categories (organization_id, name, description, max_days)
SELECT id, 'Casual Leave', 'Casual leave allowance', 15 FROM public.organizations
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO public.leave_categories (organization_id, name, description, max_days)
SELECT id, 'Annual Leave', 'Annual vacation allowance', 20 FROM public.organizations
ON CONFLICT (organization_id, name) DO NOTHING;
