import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
};

type RecentActivityItem = {
  id: string;
  type: 'user' | 'payment' | 'withdrawal' | 'company';
  message: string;
  timestamp: string;
};

const readSum = (res: { data: any } | null | undefined) => {
  const data = (res as any)?.data;
  if (!data) return 0;
  if (Array.isArray(data)) {
    const first = data?.[0];
    const sum =
      first?.sum ??
      first?.tp_amount?.sum ??
      first?.tp_amount_sum ??
      first?.tp_amount;
    const n = Number(sum ?? 0);
    return Number.isFinite(n) ? n : 0;
  }
  const sum =
    data?.sum ??
    data?.tp_amount?.sum ??
    data?.tp_amount_sum ??
    data?.tp_amount;
  const n = Number(sum ?? 0);
  return Number.isFinite(n) ? n : 0;
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

    const [
      usersCountRes,
      companiesCountRes,
      pendingWithdrawalsCountRes,
      totalEarningsRes,
      completedPaymentsCountRes,
      recentUsersRes,
      recentPaymentsRes,
      recentWithdrawalsRes,
      recentCompaniesRes,
    ] = await Promise.all([
      supabase.from('tbl_users').select('tu_id', { count: 'exact', head: true }),
      supabase.from('tbl_companies').select('tc_id', { count: 'exact', head: true }),
      supabase
        .from('tbl_withdrawal_requests')
        .select('twr_id', { count: 'exact', head: true })
        .in('twr_status', ['pending', 'processing', 'approved']),
      supabase
        .from('tbl_payments')
        .select('tp_amount.sum()')
        .eq('tp_payment_status', 'completed')
        .maybeSingle(),
      supabase
        .from('tbl_payments')
        .select('tp_id', { count: 'exact', head: true })
        .eq('tp_payment_status', 'completed'),
      supabase
        .from('tbl_users')
        .select('tu_id, tu_email, tu_created_at')
        .order('tu_created_at', { ascending: false })
        .limit(5),
      supabase
        .from('tbl_payments')
        .select('tp_id, tp_amount, tp_currency, tp_payment_status, tp_created_at, user:tp_user_id(tu_email)')
        .order('tp_created_at', { ascending: false })
        .limit(5),
      supabase
        .from('tbl_withdrawal_requests')
        .select('twr_id, twr_amount, twr_status, twr_requested_at')
        .order('twr_requested_at', { ascending: false })
        .limit(5),
      supabase
        .from('tbl_companies')
        .select('tc_id, tc_company_name, tc_created_at')
        .order('tc_created_at', { ascending: false })
        .limit(5),
    ]);

    let totalEarnings = readSum(totalEarningsRes as any);
    const completedPaymentsCount = completedPaymentsCountRes.count ?? 0;

    // Fallback: if we have completed payments but aggregation returned 0, compute in JS.
    if (completedPaymentsCount > 0 && totalEarnings === 0) {
      const { data: paymentsRows, error: paymentsRowsError } = await supabase
        .from('tbl_payments')
        .select('tp_amount')
        .eq('tp_payment_status', 'completed')
        .order('tp_created_at', { ascending: false })
        .limit(5000);
      if (!paymentsRowsError && paymentsRows) {
        totalEarnings = (paymentsRows as any[]).reduce((sum, row) => sum + Number(row?.tp_amount ?? 0), 0);
      }
    }

    const stats = {
      totalUsers: usersCountRes.count ?? 0,
      companies: companiesCountRes.count ?? 0,
      pendingWithdrawals: pendingWithdrawalsCountRes.count ?? 0,
      totalEarnings,
    };

    const recent: RecentActivityItem[] = [];

    if (recentUsersRes.data) {
      for (const row of recentUsersRes.data as any[]) {
        if (!row?.tu_id || !row?.tu_created_at) continue;
        recent.push({
          id: `user:${row.tu_id}`,
          type: 'user',
          message: `New user registered: ${row.tu_email || 'Unknown'}`,
          timestamp: row.tu_created_at,
        });
      }
    }

    if (recentPaymentsRes.data) {
      for (const row of recentPaymentsRes.data as any[]) {
        if (!row?.tp_id || !row?.tp_created_at) continue;
        const amount = Number(row.tp_amount ?? 0);
        const currency = row.tp_currency || 'USDT';
        const email = row?.user?.tu_email || 'Unknown';
        const status = String(row.tp_payment_status || '').toLowerCase() || 'unknown';
        recent.push({
          id: `payment:${row.tp_id}`,
          type: 'payment',
          message: `Payment ${status}: ${amount} ${currency} (${email})`,
          timestamp: row.tp_created_at,
        });
      }
    }

    if (recentWithdrawalsRes.data) {
      for (const row of recentWithdrawalsRes.data as any[]) {
        if (!row?.twr_id || !row?.twr_requested_at) continue;
        const amount = Number(row.twr_amount ?? 0);
        const status = String(row.twr_status || '').toLowerCase() || 'unknown';
        recent.push({
          id: `withdrawal:${row.twr_id}`,
          type: 'withdrawal',
          message: `Withdrawal ${status}: ${amount} USDT`,
          timestamp: row.twr_requested_at,
        });
      }
    }

    if (recentCompaniesRes.data) {
      for (const row of recentCompaniesRes.data as any[]) {
        if (!row?.tc_id || !row?.tc_created_at) continue;
        recent.push({
          id: `company:${row.tc_id}`,
          type: 'company',
          message: `New company: ${row.tc_company_name || 'Unknown'}`,
          timestamp: row.tc_created_at,
        });
      }
    }

    const recentSorted = recent
      .filter((r) => r.timestamp)
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
      .slice(0, 8);

    return new Response(JSON.stringify({ success: true, data: { stats, recent: recentSorted } }), {
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
