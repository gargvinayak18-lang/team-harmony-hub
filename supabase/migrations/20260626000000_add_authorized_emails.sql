-- Create authorized_emails table to store pre-authorized email addresses
CREATE TABLE IF NOT EXISTS public.authorized_emails (
  email TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  role_id UUID REFERENCES public.roles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.authorized_emails ENABLE ROW LEVEL SECURITY;

-- Policies for authorized_emails (only Admins or HR roles can manage it)
CREATE POLICY "admins_manage_authorized_emails" ON public.authorized_emails
  FOR ALL TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid()) 
    AND (public.is_admin(auth.uid()) OR public.has_permission(auth.uid(), 'manage_employees'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid()) 
    AND (public.is_admin(auth.uid()) OR public.has_permission(auth.uid(), 'manage_employees'))
  );

-- Create a security definer function to check if an email is authorized
-- This bypasses RLS so anonymous signups can check their signup eligibility safely
CREATE OR REPLACE FUNCTION public.is_email_authorized(_email TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.authorized_emails WHERE LOWER(email) = LOWER(_email));
END;
$$;
