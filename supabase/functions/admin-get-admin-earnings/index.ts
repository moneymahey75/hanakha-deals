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

    const { adminId, startDate, endDate, dummyFilter: dummyFilterInput, accountScope } = await req.json();
    const dummyFilterRaw = String(dummyFilterInput ?? accountScope ?? 'all').trim().toLowerCase();
    const dummyFilter = ['all', 'real', 'dummy'].includes(dummyFilterRaw) ? dummyFilterRaw : 'all';

    let query = supabase
      .from('tbl_payments')
      .select(
        `
        tp_id,
        tp_user_id,
        tp_transaction_id,
        tp_amount,
        tp_currency,
        tp_payment_status,
        tp_created_at,
        tp_verified_at,
        tp_gateway_response,
        tp_processed_by_admin_id,
        tp_processed_by_admin_email,
        tp_processed_by_admin_name,
        user:tp_user_id(tu_email, tu_is_dummy),
        subscription:tp_subscription_id(
          tus_id,
          tus_plan_phase,
          plan:tus_plan_id(tsp_name, tsp_type, tsp_price, tsp_plan_phase)
        )
      `
      )
      .eq('tp_payment_status', 'completed')
      .order('tp_verified_at', { ascending: false });

    if (dummyFilter === 'real') query = query.eq('user.tu_is_dummy', false);
    if (dummyFilter === 'dummy') query = query.eq('user.tu_is_dummy', true);

    if (adminId && adminId !== 'all') {
      query = query.eq('tp_processed_by_admin_id', adminId);
    }

    if (startDate) {
      query = query.gte('tp_verified_at', `${startDate}T00:00:00.000Z`);
    }

    if (endDate) {
      query = query.lte('tp_verified_at', `${endDate}T23:59:59.999Z`);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const rows = data || [];
    const userIds = Array.from(new Set(rows.map((row: any) => row.tp_user_id).filter(Boolean)));
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('tbl_user_profiles')
        .select('tup_user_id, tup_sponsorship_number')
        .in('tup_user_id', userIds);

      if (profilesError) throw profilesError;

      const sponsorshipByUserId = new Map(
        (profiles || []).map((profile: any) => [
          String(profile.tup_user_id),
          profile.tup_sponsorship_number || null,
        ])
      );

      rows.forEach((row: any) => {
        row.user = {
          ...(row.user || {}),
          tup_sponsorship_number: sponsorshipByUserId.get(String(row.tp_user_id)) || null,
        };
      });
    }

    return new Response(JSON.stringify({ success: true, data: rows }), {
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
