import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Fetching profiles...");
  const { data: profiles, error: profileErr } = await supabase.from('profiles').select('id, organization_id');
  if (profileErr) {
    console.error("Error fetching profiles:", profileErr);
    return;
  }
  
  // Find an admin's organization_id to use as default for orphans
  let defaultOrgId = null;
  for (const p of profiles) {
    if (p.organization_id) {
      defaultOrgId = p.organization_id;
      break;
    }
  }

  console.log(`Default Org ID: ${defaultOrgId}`);

  if (defaultOrgId) {
    const orphans = profiles.filter(p => !p.organization_id);
    console.log(`Found ${orphans.length} orphan profiles. Updating...`);
    for (const p of orphans) {
      await supabase.from('profiles').update({ organization_id: defaultOrgId }).eq('id', p.id);
      await supabase.from('user_roles').update({ organization_id: defaultOrgId }).eq('user_id', p.id).is('organization_id', null);
      console.log(`Updated ${p.id}`);
    }
  } else {
    console.log("No organization_id found in any profile.");
  }
}

run();
