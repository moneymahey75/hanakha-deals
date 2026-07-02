import { createClient } from 'jsr:@supabase/supabase-js@2';
import { adminHasPermission } from '../_shared/adminSession.ts';

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
        tau_permissions,
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

    if (!adminHasPermission(admin, 'payments', 'read')) {
      return new Response(JSON.stringify({ success: false, error: 'Permission denied: payments.read' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const dummyFilterRaw = String(body?.dummyFilter ?? body?.accountScope ?? 'all').trim().toLowerCase();
    const dummyFilter = ['all', 'real', 'dummy'].includes(dummyFilterRaw) ? dummyFilterRaw : 'all';
    // stuckOnly=true returns only payments flagged as stuck; default returns all pending
    const stuckOnly = body?.stuckOnly === true;

    const selectFields = `
      tp_id,
      tp_user_id,
      tp_amount,
      tp_currency,
      tp_payment_method,
      tp_payment_status,
      tp_transaction_id,
      tp_error_message,
      tp_gateway_response,
      tp_wallet_error_code,
      tp_wallet_error_raw,
      tp_device_info,
      tp_is_stuck,
      tp_stuck_at,
      tp_wallet_address,
      tp_to_address,
      tp_network,
      tp_chain_id,
      tp_expected_amount,
      tp_created_at,
      tp_updated_at,
      tp_verified_at,
      tp_processed_by_admin_id,
      tp_processed_by_admin_email,
      tp_processed_by_admin_name,
      user:tp_user_id(tu_email, tu_is_dummy),
      subscription:tp_subscription_id(
        tus_id,
        tus_plan_phase,
        plan:tus_plan_id(tsp_name, tsp_type, tsp_price, tsp_plan_phase)
      )
    `;

    let query = supabase
      .from('tbl_payments')
      .select(selectFields)
      .eq('tp_payment_status', 'pending')
      .order('tp_stuck_at', { ascending: false, nullsFirst: false })
      .order('tp_created_at', { ascending: false });

    if (stuckOnly) {
      query = query.eq('tp_is_stuck', true);
    }

    if (dummyFilter === 'real') query = query.eq('user.tu_is_dummy', false);
    if (dummyFilter === 'dummy') query = query.eq('user.tu_is_dummy', true);

    const { data, error } = await query;
    if (error) throw error;

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

    // Split into stuck vs normal pending — returned under data so adminApi.post unwraps correctly
    const all = rows;
    const stuck = all.filter((p: any) => p.tp_is_stuck === true);
    const pending = all.filter((p: any) => p.tp_is_stuck !== true);

    return new Response(JSON.stringify({ success: true, data: { all, stuck, pending } }), {
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
