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

const refundIfDebited = async (supabase: any, withdrawal: any) => {
  const amount = Number(withdrawal?.twr_amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return { refunded: false, reason: 'invalid_amount' };

  const walletType = String(withdrawal?.twr_wallet_type || 'working') === 'non_working' ? 'non_working' : 'working';
  const { data: wallet, error: walletError } = await supabase
    .from('tbl_wallets')
    .select('tw_id, tw_balance')
    .eq('tw_user_id', withdrawal.twr_user_id)
    .eq('tw_currency', 'USDT')
    .eq('tw_wallet_type', walletType)
    .maybeSingle();
  if (walletError || !wallet?.tw_id) return { refunded: false, reason: 'wallet_not_found' };

  const { data: debitTx, error: txError } = await supabase
    .from('tbl_wallet_transactions')
    .select('twt_id, twt_status')
    .eq('twt_reference_type', 'withdrawal')
    .eq('twt_reference_id', withdrawal.twr_id)
    .eq('twt_transaction_type', 'debit')
    .order('twt_created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (txError) return { refunded: false, reason: 'tx_lookup_failed' };
  if (!debitTx?.twt_id) return { refunded: false, reason: 'no_debit_tx' };

  const debitStatus = String(debitTx.twt_status || '').toLowerCase();
  if (debitStatus !== 'pending') return { refunded: false, reason: `debit_tx_status_${debitStatus || 'unknown'}` };

  const currentBalance = Number(wallet.tw_balance || 0);
  const newBalance = currentBalance + amount;

  const { error: balanceError } = await supabase
    .from('tbl_wallets')
    .update({ tw_balance: newBalance, tw_updated_at: new Date().toISOString() })
    .eq('tw_id', wallet.tw_id);
  if (balanceError) return { refunded: false, reason: 'balance_update_failed' };

  const { error: cancelError } = await supabase
    .from('tbl_wallet_transactions')
    .update({ twt_status: 'cancelled' })
    .eq('twt_id', debitTx.twt_id);
  if (cancelError) return { refunded: false, reason: 'debit_cancel_failed' };

  const { error: creditError } = await supabase
    .from('tbl_wallet_transactions')
    .insert({
      twt_wallet_id: wallet.tw_id,
      twt_user_id: withdrawal.twr_user_id,
      twt_transaction_type: 'credit',
      twt_amount: amount,
      twt_description: 'Withdrawal rejected refund',
      twt_reference_type: 'withdrawal',
      twt_reference_id: withdrawal.twr_id,
      twt_status: 'completed',
      twt_created_at: new Date().toISOString()
    });
  if (creditError) return { refunded: false, reason: 'credit_insert_failed' };

  return { refunded: true, reason: 'ok' };
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

    const { withdrawalId, note } = await req.json();
    if (!withdrawalId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing withdrawalId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('tbl_withdrawal_requests')
      .select('*')
      .eq('twr_id', withdrawalId)
      .maybeSingle();

    if (withdrawalError || !withdrawal) {
      return new Response(JSON.stringify({ success: false, error: 'Withdrawal request not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const status = String(withdrawal.twr_status || '').toLowerCase();
    if (withdrawal.twr_blockchain_tx || status === 'completed') {
      return new Response(JSON.stringify({ success: false, error: 'Cannot reject a completed withdrawal' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const refundResult = status === 'processing' ? await refundIfDebited(supabase, withdrawal) : { refunded: false, reason: 'not_processing' };

    const { error } = await supabase
      .from('tbl_withdrawal_requests')
      .update({
        twr_status: 'rejected',
        twr_processed_at: new Date().toISOString(),
        twr_processed_by_admin_id: admin.tau_id,
        twr_processed_by_admin_email: admin.tau_email,
        twr_processed_by_admin_name: admin.tau_email,
        twr_failure_reason: note || null
      })
      .eq('twr_id', withdrawalId);

    if (error) {
      throw error;
    }

    await logAdminAction(supabase, admin.tau_id, 'reject_withdrawal', 'withdrawals', {
      withdrawal_id: withdrawalId,
      previous_status: status,
      refunded: refundResult.refunded,
      refund_reason: refundResult.reason,
      note: note || null
    });

    return new Response(JSON.stringify({ success: true, data: { withdrawalId } }), {
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
