import { createClient } from 'jsr:@supabase/supabase-js@2';
import { logAdminAction } from '../_shared/adminSession.ts';

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

    const { userId, amount, transactionType, description } = await req.json();
    if (!userId || !amount || !transactionType) {
      return new Response(JSON.stringify({ success: false, error: 'Missing parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: wallet, error: walletError } = await supabase
      .from('tbl_wallets')
      .select('tw_id, tw_balance')
      .eq('tw_user_id', userId)
      .eq('tw_currency', 'USDT')
      .eq('tw_wallet_type', 'working')
      .single();

    if (walletError) {
      throw walletError;
    }

    const transactionAmount = transactionType === 'credit' ? Number(amount) : -Number(amount);
    const newBalance = Number(wallet.tw_balance) + transactionAmount;

    const { error: updateError } = await supabase
      .from('tbl_wallets')
      .update({
        tw_balance: newBalance,
        tw_updated_at: new Date().toISOString()
      })
      .eq('tw_id', wallet.tw_id);

    if (updateError) {
      throw updateError;
    }

    const { error: txError } = await supabase
      .from('tbl_wallet_transactions')
      .insert({
        twt_id: crypto.randomUUID(),
        twt_wallet_id: wallet.tw_id,
        twt_user_id: userId,
        twt_transaction_type: transactionType,
        twt_amount: amount,
        twt_description: description || `Admin ${transactionType}`,
        twt_reference_type: transactionType === 'credit' ? 'admin_credit' : 'withdrawal',
        twt_status: 'completed',
        twt_created_at: new Date().toISOString()
      });

    if (txError) {
      throw txError;
    }

    await logAdminAction(supabase, admin.tau_id, 'wallet_transaction', 'wallets', {
      user_id: userId,
      transaction_type: transactionType,
      amount,
      new_balance: newBalance
    });

    return new Response(JSON.stringify({ success: true, data: { newBalance } }), {
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
