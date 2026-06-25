-- Run this script in your Supabase SQL editor to migrate roles under departments.
-- This will wipe existing custom roles as agreed in the plan.

-- 1. Unassign all roles from users
DELETE FROM public.user_roles WHERE role_id IS NOT NULL;

-- 2. Clear all roles to allow adding a NOT NULL constraint cleanly
DELETE FROM public.roles;

-- 3. Add department_id to roles
ALTER TABLE public.roles ADD COLUMN department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE;
