Promise.all([
  fetch('https://dxwpotqdgabzkjtafikw.supabase.co/rest/v1/attendance?select=*&limit=1', { headers: { 'apikey': 'sb_secret_2RUu0Jtmy4v4f2NeRbfgLA_Bg362CXo', 'Authorization': 'Bearer sb_secret_2RUu0Jtmy4v4f2NeRbfgLA_Bg362CXo' } }).then(res => res.json()),
  fetch('https://dxwpotqdgabzkjtafikw.supabase.co/rest/v1/admin_notes?select=*&limit=1', { headers: { 'apikey': 'sb_secret_2RUu0Jtmy4v4f2NeRbfgLA_Bg362CXo', 'Authorization': 'Bearer sb_secret_2RUu0Jtmy4v4f2NeRbfgLA_Bg362CXo' } }).then(res => res.json())
]).then(data => console.log(JSON.stringify(data, null, 2))).catch(err => console.error(err));
