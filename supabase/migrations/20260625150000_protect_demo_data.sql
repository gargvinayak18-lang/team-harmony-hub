-- Create a trigger function to block write operations on Demo Corp
CREATE OR REPLACE FUNCTION block_demo_data_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    (TG_OP = 'DELETE' AND OLD.organization_id = 'f74492a3-d823-4476-a127-0cde03381989') OR
    (TG_OP = 'INSERT' AND NEW.organization_id = 'f74492a3-d823-4476-a127-0cde03381989') OR
    (TG_OP = 'UPDATE' AND NEW.organization_id = 'f74492a3-d823-4476-a127-0cde03381989') OR
    auth.email() = 'demo@workdesk.local'
  ) THEN
    RAISE EXCEPTION 'Demo Mode: Modifying or deleting demo organization data is disabled.';
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tasks
CREATE OR REPLACE TRIGGER trigger_block_demo_tasks
BEFORE INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION block_demo_data_changes();

-- Apply trigger to attendance
CREATE OR REPLACE TRIGGER trigger_block_demo_attendance
BEFORE INSERT OR UPDATE OR DELETE ON attendance
FOR EACH ROW EXECUTE FUNCTION block_demo_data_changes();

-- Apply trigger to leave_requests
CREATE OR REPLACE TRIGGER trigger_block_demo_leave_requests
BEFORE INSERT OR UPDATE OR DELETE ON leave_requests
FOR EACH ROW EXECUTE FUNCTION block_demo_data_changes();

-- Apply trigger to leave_categories
CREATE OR REPLACE TRIGGER trigger_block_demo_leave_categories
BEFORE INSERT OR UPDATE OR DELETE ON leave_categories
FOR EACH ROW EXECUTE FUNCTION block_demo_data_changes();

-- Apply trigger to organization_wifis
CREATE OR REPLACE TRIGGER trigger_block_demo_organization_wifis
BEFORE INSERT OR UPDATE OR DELETE ON organization_wifis
FOR EACH ROW EXECUTE FUNCTION block_demo_data_changes();

-- Apply trigger to profiles
CREATE OR REPLACE TRIGGER trigger_block_demo_profiles
BEFORE INSERT OR UPDATE OR DELETE ON profiles
FOR EACH ROW EXECUTE FUNCTION block_demo_data_changes();

-- Apply trigger to user_roles
CREATE OR REPLACE TRIGGER trigger_block_demo_user_roles
BEFORE INSERT OR UPDATE OR DELETE ON user_roles
FOR EACH ROW EXECUTE FUNCTION block_demo_data_changes();

-- Apply trigger to departments
CREATE OR REPLACE TRIGGER trigger_block_demo_departments
BEFORE INSERT OR UPDATE OR DELETE ON departments
FOR EACH ROW EXECUTE FUNCTION block_demo_data_changes();

-- Apply trigger to roles
CREATE OR REPLACE TRIGGER trigger_block_demo_roles
BEFORE INSERT OR UPDATE OR DELETE ON roles
FOR EACH ROW EXECUTE FUNCTION block_demo_data_changes();
