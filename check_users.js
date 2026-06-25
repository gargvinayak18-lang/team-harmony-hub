import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    }
    env[match[1]] = value;
  }
});

const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Checking organizations...");
  const { data: orgs, error: orgErr } = await supabase.from('organizations').select('*');
  if (orgErr) {
    console.error("Orgs error:", orgErr);
  } else {
    console.log("Orgs:", orgs);
  }

  console.log("Checking profiles...");
  const { data: profiles, error: profErr } = await supabase.from('profiles').select('*');
  if (profErr) {
    console.error("Profiles error:", profErr);
  } else {
    console.log("Profiles (first 5):", profiles.slice(0, 5));
  }
}

run();
