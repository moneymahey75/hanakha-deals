import { createClient } from 'jsr:@supabase/supabase-js@2';
import { adminHasPermission, logAdminAction, requireAdminSession } from '../_shared/adminSession.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
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
    const admin = await requireAdminSession(supabase, req.headers.get('X-Admin-Session'));
    if (!adminHasPermission(admin, 'wallets', 'write')) {
      return new Response(JSON.stringify({ success: false, error: 'Wallet write permission required' }), {
        status: 403,
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

    if (!['credit', 'debit', 'recover_reserved'].includes(transactionType)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid transaction type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid amount' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: customer, error: customerError } = await supabase
      .from('tbl_users')
      .select('tu_id')
      .eq('tu_id', userId)
      .maybeSingle();

    if (customerError) throw customerError;
    if (!customer?.tu_id) {
      return new Response(JSON.stringify({ success: false, error: 'User not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: wallet, error: walletError } = await supabase
      .from('tbl_wallets')
      .select('tw_id, tw_balance, tw_reserved_balance')
      .eq('tw_user_id', userId)
      .eq('tw_currency', 'USDT')
      .eq('tw_wallet_type', 'working')
      .maybeSingle();

    if (walletError) {
      throw walletError;
    }

    if (!wallet?.tw_id) {
      return new Response(JSON.stringify({ success: false, error: 'Working wallet not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const currentBalance = Number(wallet.tw_balance || 0);
    const currentReservedBalance = Number(wallet.tw_reserved_balance || 0);
    const balanceDelta = transactionType === 'debit' ? -parsedAmount : parsedAmount;
    const reservedDelta = transactionType === 'recover_reserved' ? parsedAmount : 0;
    const newBalance = currentBalance + balanceDelta;
    const newReservedBalance = currentReservedBalance + reservedDelta;

    if (newBalance < 0) {
      return new Response(JSON.stringify({ success: false, error: 'Insufficient wallet balance' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: updateError } = await supabase
      .from('tbl_wallets')
      .update({
        tw_balance: newBalance,
        ...(transactionType === 'recover_reserved' ? { tw_reserved_balance: newReservedBalance } : {}),
        tw_updated_at: new Date().toISOString()
      })
      .eq('tw_id', wallet.tw_id);

    if (updateError) {
      throw updateError;
    }

    const transactionDirection = transactionType === 'debit' ? 'debit' : 'credit';
    const transactionDescription = description || (
      transactionType === 'recover_reserved'
        ? 'Admin recovered expired reserved balance'
        : `Admin ${transactionDirection}`
    );

    const { error: txError } = await supabase
      .from('tbl_wallet_transactions')
      .insert({
        twt_id: crypto.randomUUID(),
        twt_wallet_id: wallet.tw_id,
        twt_user_id: userId,
        twt_transaction_type: transactionDirection,
        twt_amount: parsedAmount,
        twt_description: transactionDescription,
        twt_reference_type: transactionType === 'debit' ? 'withdrawal' : 'admin_credit',
        twt_status: 'completed',
        twt_created_at: new Date().toISOString()
      });

    if (txError) {
      throw txError;
    }

    await logAdminAction(supabase, admin.tau_id, 'wallet_transaction', 'wallets', {
      user_id: userId,
      transaction_type: transactionType,
      amount: parsedAmount,
      balance_delta: balanceDelta,
      reserved_delta: reservedDelta,
      new_balance: newBalance,
      new_reserved_balance: newReservedBalance
    });

    return new Response(JSON.stringify({ success: true, data: { newBalance, newReservedBalance } }), {
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
