-- Run this script in your Supabase SQL editor to add attendance rules to departments.

ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS attendance_rules JSONB NOT NULL DEFAULT '{"expected_clock_in": "09:00", "expected_clock_out": "17:00", "late_tolerance_mins": 15}'::jsonb;
