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

    const body = await req.json().catch(() => ({}));
    const userId = body?.userId;
    const walletTypeRaw = String(body?.walletType || body?.wallet_type || 'working').trim().toLowerCase();
    const walletType = walletTypeRaw === 'non_working' ? 'non_working' : 'working';
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing userId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const page = Number.isFinite(Number(body?.page)) ? Math.max(1, Number(body.page)) : 1;
    const pageSize = Number.isFinite(Number(body?.pageSize)) ? Math.min(100, Math.max(1, Number(body.pageSize))) : 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data: wallet, error: walletError } = await supabase
      .from('tbl_wallets')
      .select('tw_id')
      .eq('tw_user_id', userId)
      .eq('tw_currency', 'USDT')
      .eq('tw_wallet_type', walletType)
      .maybeSingle();

    if (walletError) {
      throw walletError;
    }

    if (!wallet?.tw_id) {
      return new Response(JSON.stringify({ success: true, data: { rows: [], count: 0 } }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: rows, error, count } = await supabase
      .from('tbl_wallet_transactions')
      .select(
        `
        twt_id,
        twt_wallet_id,
        twt_user_id,
        twt_transaction_type,
        twt_amount,
        twt_currency,
        twt_description,
        twt_reference_type,
        twt_reference_id,
        twt_blockchain_hash,
        twt_status,
        twt_created_at
      `,
        { count: 'exact' }
      )
      .eq('twt_wallet_id', wallet.tw_id)
      .order('twt_created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ success: true, data: { rows: rows || [], count: Number(count || 0) } }), {
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
