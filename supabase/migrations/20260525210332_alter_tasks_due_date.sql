-- Alter the due_date column data type to TIMESTAMPTZ to support time values
ALTER TABLE public.tasks 
  ALTER COLUMN due_date TYPE TIMESTAMPTZ 
  USING due_date::TIMESTAMPTZ;
