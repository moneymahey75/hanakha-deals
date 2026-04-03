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

    const {
      statusFilter,
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
      searchText,
      from,
      to
    } = await req.json();

    let query = supabase
      .from('tbl_withdrawal_requests')
      .select(
        `
        *,
        user:twr_user_id(
          tu_email,
          tbl_user_profiles (
            tup_first_name,
            tup_last_name,
            tup_sponsorship_number
          )
        )
      `,
        { count: 'exact' }
      )
      .order('twr_requested_at', { ascending: false });

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('twr_status', statusFilter);
    }

    if (dateFrom) {
      query = query.gte('twr_requested_at', `${dateFrom}T00:00:00.000Z`);
    }

    if (dateTo) {
      query = query.lte('twr_requested_at', `${dateTo}T23:59:59.999Z`);
    }

    if (minAmount) {
      query = query.gte('twr_amount', Number(minAmount));
    }

    if (maxAmount) {
      query = query.lte('twr_amount', Number(maxAmount));
    }

    if (searchText) {
      const cleaned = String(searchText).trim();
      if (cleaned) {
        query = query.or(`twr_id.ilike.%${cleaned}%,twr_destination_address.ilike.%${cleaned}%`);
      }
    }

    const { data, error, count } = await query.range(from ?? 0, to ?? 9);

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ success: true, data: { rows: data || [], count: count || 0 } }), {
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
