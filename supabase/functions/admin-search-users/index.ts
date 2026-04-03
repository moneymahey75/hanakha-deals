import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
};

const getAdminBySession = async (supabase: ReturnType<typeof createClient>, token: string) => {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('tbl_admin_sessions')
    .select(
      `
      tas_admin_id,
      admin:tas_admin_id(
        tau_id,
        tau_email,
        tau_role,
        tau_is_active
      )
    `
    )
    .eq('tas_session_token', token)
    .gt('tas_expires_at', nowIso)
    .maybeSingle();

  if (error || !data?.admin || !data.admin.tau_is_active) return null;
  return data.admin;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const adminSessionToken = req.headers.get('X-Admin-Session');
    if (!adminSessionToken) {
      return new Response(JSON.stringify({ success: false, error: 'Missing admin session token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = await getAdminBySession(supabase, adminSessionToken);
    if (!admin) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid admin session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { query } = await req.json();
    const searchQuery = String(query || '').trim();
    if (!searchQuery) {
      return new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: usersData } = await supabase
      .from('tbl_users')
      .select(
        `
        tu_id,
        tu_email,
        tu_user_type,
        tbl_user_profiles (
          tup_first_name,
          tup_last_name
        )
      `
      )
      .ilike('tu_email', `%${searchQuery}%`)
      .limit(10);

    const { data: profileUsersData } = await supabase
      .from('tbl_user_profiles')
      .select(
        `
        tup_first_name,
        tup_last_name,
        tbl_users (
          tu_id,
          tu_email,
          tu_user_type
        )
      `
      )
      .or(`tup_first_name.ilike.%${searchQuery}%,tup_last_name.ilike.%${searchQuery}%`)
      .limit(10);

    const allUsers = [...(usersData || [])];
    if (profileUsersData) {
      profileUsersData.forEach((profile: any) => {
        if (profile.tbl_users && !allUsers.some((u: any) => u.tu_id === profile.tbl_users.tu_id)) {
          allUsers.push({
            ...profile.tbl_users,
            tbl_user_profiles: [
              {
                tup_first_name: profile.tup_first_name,
                tup_last_name: profile.tup_last_name
              }
            ]
          });
        }
      });
    }

    const userIds = allUsers.map((user: any) => user.tu_id);
    let companiesMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: companiesData } = await supabase
        .from('tbl_companies')
        .select('tc_user_id, tc_company_name')
        .in('tc_user_id', userIds);

      if (companiesData) {
        companiesData.forEach((company: any) => {
          companiesMap.set(company.tc_user_id, company.tc_company_name);
        });
      }
    }

    const formattedUsers = allUsers.map((user: any) => ({
      tu_id: user.tu_id,
      tu_email: user.tu_email,
      tu_user_type: user.tu_user_type,
      tup_first_name: user.tbl_user_profiles?.[0]?.tup_first_name,
      tup_last_name: user.tbl_user_profiles?.[0]?.tup_last_name,
      company_name: companiesMap.get(user.tu_id)
    }));

    return new Response(JSON.stringify({ success: true, data: formattedUsers }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
