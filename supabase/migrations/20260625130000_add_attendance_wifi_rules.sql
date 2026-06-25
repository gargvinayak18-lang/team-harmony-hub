-- Migration: Add Wifi-based Attendance Rules (Multiple WiFi SSIDs version)
-- Run this in your Supabase SQL Editor.

-- Drop old column if created in prior attempts
ALTER TABLE public.organizations DROP COLUMN IF EXISTS office_wifi_ssid;

-- 1. Create public.organization_wifis table
CREATE TABLE IF NOT EXISTS public.organization_wifis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ssid TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure unique constraint exists even if table was created previously without it
DELETE FROM public.organization_wifis a USING public.organization_wifis b
WHERE a.id < b.id AND a.organization_id = b.organization_id AND a.ssid = b.ssid;

ALTER TABLE public.organization_wifis DROP CONSTRAINT IF EXISTS unique_wifi_per_org;
ALTER TABLE public.organization_wifis ADD CONSTRAINT unique_wifi_per_org UNIQUE (organization_id, ssid);


-- Enable RLS on organization_wifis
ALTER TABLE public.organization_wifis ENABLE ROW LEVEL SECURITY;

-- Drop old policies if any
DROP POLICY IF EXISTS "select_org_wifis" ON public.organization_wifis;
DROP POLICY IF EXISTS "manage_org_wifis" ON public.organization_wifis;

-- Policies for organization_wifis
CREATE POLICY "select_org_wifis" ON public.organization_wifis FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "manage_org_wifis" ON public.organization_wifis FOR ALL TO authenticated
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

-- 2. Alter public.attendance to add attendance_type and clock_in_wifi_ssid
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS attendance_type TEXT CHECK (attendance_type IN ('on_site', 'work_from_home')) DEFAULT 'on_site';
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS clock_in_wifi_ssid TEXT;

-- 3. Seed default wifi SSIDs for existing organizations
INSERT INTO public.organization_wifis (organization_id, ssid)
SELECT id, 'Office-WiFi' FROM public.organizations
ON CONFLICT (organization_id, ssid) DO NOTHING;
