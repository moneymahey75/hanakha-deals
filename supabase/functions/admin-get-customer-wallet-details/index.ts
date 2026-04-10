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

    const { userId } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing userId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: wallet, error: walletError } = await supabase
      .from('tbl_wallets')
      .select('tw_id, tw_balance, tw_currency, tw_created_at, tw_updated_at, tw_is_active')
      .eq('tw_user_id', userId)
      .eq('tw_currency', 'USDT')
      .maybeSingle();

    if (walletError) {
      throw walletError;
    }

    const { data: walletConnections, error: walletConnectionsError } = await supabase
      .from('tbl_user_wallet_connections')
      .select(
        `
        tuwc_id,
        tuwc_wallet_address,
        tuwc_wallet_name,
        tuwc_wallet_type,
        tuwc_chain_id,
        tuwc_is_default,
        tuwc_is_active,
        tuwc_last_connected_at,
        tuwc_created_at,
        tuwc_updated_at
      `
      )
      .eq('tuwc_user_id', userId)
      .order('tuwc_is_default', { ascending: false })
      .order('tuwc_is_active', { ascending: false })
      .order('tuwc_last_connected_at', { ascending: false, nullsFirst: false });

    if (walletConnectionsError) {
      throw walletConnectionsError;
    }

    const { data: completedTxns, error: completedTxnsError } = await supabase
      .from('tbl_wallet_transactions')
      .select('twt_amount, twt_transaction_type')
      .eq('twt_user_id', userId)
      .eq('twt_status', 'completed');

    if (completedTxnsError) {
      throw completedTxnsError;
    }

    const totalEarned = (completedTxns || [])
      .filter((t: any) => t.twt_transaction_type === 'credit')
      .reduce((sum: number, t: any) => sum + Number(t.twt_amount || 0), 0);

    const totalDebited = (completedTxns || [])
      .filter((t: any) => t.twt_transaction_type === 'debit')
      .reduce((sum: number, t: any) => sum + Number(t.twt_amount || 0), 0);

    const pendingStatuses = new Set(['pending', 'processing', 'approved']);
    const { data: withdrawals, error: withdrawalsError } = await supabase
      .from('tbl_withdrawal_requests')
      .select('twr_amount, twr_status')
      .eq('twr_user_id', userId);

    if (withdrawalsError) {
      throw withdrawalsError;
    }

    const reservedWithdrawals = (withdrawals || [])
      .filter((w: any) => pendingStatuses.has(String(w.twr_status || '').toLowerCase()))
      .reduce((sum: number, w: any) => sum + Number(w.twr_amount || 0), 0);

    const walletBalance = Number(wallet?.tw_balance || 0);
    const withdrawableBalance = Math.max(0, walletBalance - reservedWithdrawals);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          wallet: wallet
            ? {
                ...wallet,
                tw_balance: walletBalance,
              }
            : null,
          walletConnections: walletConnections || [],
          totals: {
            walletBalance,
            withdrawableBalance,
            reservedWithdrawals,
            totalEarned,
            totalDebited,
          },
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

