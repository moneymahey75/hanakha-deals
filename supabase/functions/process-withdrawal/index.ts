import { createClient } from 'jsr:@supabase/supabase-js@2';
import { logAdminAction } from '../_shared/adminSession.ts';
import { ethers } from 'npm:ethers@6.10.0';
import { formatWithdrawalAdminDebug, formatWithdrawalFailureReason } from '../_shared/withdrawalFailureReason.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
};

const DEFAULT_MAINNET_RPC = 'https://bsc-dataseed1.binance.org/';
const DEFAULT_TESTNET_RPC = 'https://data-seed-prebsc-1-s1.binance.org:8545/';

const MIN_CONFIRMATIONS_DEFAULT = 1;

const USDT_ABI = [
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)'
];

const isValidMobile = (value?: string | null) => {
  if (!value) return false;
  return /^\+\d{10,15}$/.test(value.trim());
};

const sendEmail = async (baseUrl: string, to: string, subject: string, html: string) => {
  try {
    await fetch(`${baseUrl}/functions/v1/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html })
    });
  } catch (error) {
    console.error('Failed to send email notification:', error);
  }
};

const sendSms = async (baseUrl: string, to: string, body: string) => {
  try {
    await fetch(`${baseUrl}/functions/v1/twilio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, body })
    });
  } catch (error) {
    console.error('Failed to send SMS notification:', error);
  }
};

const parseSetting = (raw: any) => {
  if (raw === null || raw === undefined) return raw;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const normalizeAddress = (address?: string | null) =>
  (address || '').trim().toLowerCase();

const processTransfer = async (params: {
  supabase: any;
  requestId: string;
  userId: string;
  amount: number;
  netAmount: number;
  destinationAddress: string;
  adminPaymentWallet: string;
  usdtAddress: string;
  paymentMode: any;
  adminInfo: {
    id: string;
    email: string;
    name: string | null;
  };
}) => {
  const {
    supabase,
    requestId,
    userId,
    amount,
    netAmount,
    destinationAddress,
    adminPaymentWallet,
    usdtAddress,
    paymentMode,
    adminInfo
  } = params;

  const { data: wallet, error: walletError } = await supabase
    .from('tbl_wallets')
    .select('tw_id, tw_balance')
    .eq('tw_user_id', userId)
    .eq('tw_currency', 'USDT')
    .maybeSingle();

  if (walletError || !wallet) {
    throw new Error('Wallet not found for withdrawal');
  }

  const currentBalance = Number(wallet.tw_balance || 0);
  if (currentBalance < amount) {
    throw new Error('Insufficient wallet balance');
  }

  const newBalance = currentBalance - amount;

  const { error: balanceError } = await supabase
    .from('tbl_wallets')
    .update({
      tw_balance: newBalance,
      tw_updated_at: new Date().toISOString()
    })
    .eq('tw_id', wallet.tw_id);

  if (balanceError) {
    throw new Error('Failed to update wallet balance');
  }

  const { data: walletTx, error: txError } = await supabase
    .from('tbl_wallet_transactions')
    .insert({
      twt_wallet_id: wallet.tw_id,
      twt_user_id: userId,
      twt_transaction_type: 'debit',
      twt_amount: amount,
      twt_description: 'Withdrawal approved',
      twt_reference_type: 'withdrawal',
      twt_reference_id: requestId,
      twt_status: 'pending',
      twt_created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (txError) {
    throw new Error('Failed to record withdrawal transaction');
  }

  const privateKey = Deno.env.get('ADMIN_WALLET_PRIVATE_KEY');
  if (!privateKey) {
    throw new Error('Admin wallet private key is not configured');
  }

    const rpcUrl = isMainnet
      ? (Deno.env.get('BSC_MAINNET_RPC_URL') || DEFAULT_MAINNET_RPC)
      : (Deno.env.get('BSC_TESTNET_RPC_URL') || DEFAULT_TESTNET_RPC);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  const signerAddress = normalizeAddress(signer.address);
  const configuredAdmin = normalizeAddress(adminPaymentWallet);
  if (configuredAdmin && signerAddress !== configuredAdmin) {
    throw new Error('Admin private key does not match configured payment wallet');
  }

  try {
    const token = new ethers.Contract(usdtAddress, USDT_ABI, signer);
    const decimals = await token.decimals();
    const amountUnits = ethers.parseUnits(netAmount.toFixed(6), decimals);
    const tx = await token.transfer(destinationAddress, amountUnits);
    await tx.wait(MIN_CONFIRMATIONS_DEFAULT);

    const { error: txUpdateError } = await supabase
      .from('tbl_wallet_transactions')
      .update({
        twt_status: 'completed',
        twt_blockchain_hash: tx.hash
      })
      .eq('twt_id', walletTx.twt_id);

    if (txUpdateError) {
      console.error('Failed to update wallet transaction status:', txUpdateError);
    }

    return tx.hash as string;
  } catch (error: any) {
    const failureReason = formatWithdrawalFailureReason(error);
    await supabase
      .from('tbl_wallet_transactions')
      .update({ twt_status: 'failed' })
      .eq('twt_id', walletTx.twt_id);

    await supabase
      .from('tbl_wallets')
      .update({ tw_balance: currentBalance, tw_updated_at: new Date().toISOString() })
      .eq('tw_id', wallet.tw_id);

    await supabase
      .from('tbl_withdrawal_requests')
      .update({
        twr_status: 'failed',
        twr_failure_reason: failureReason,
        twr_admin_debug: formatWithdrawalAdminDebug(error),
        twr_processed_at: new Date().toISOString(),
        twr_processed_by_admin_id: adminInfo.id,
        twr_processed_by_admin_email: adminInfo.email,
        twr_processed_by_admin_name: adminInfo.name
      })
      .eq('twr_id', requestId);

    throw error;
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  let requestedWithdrawalId: string | null = null;
  let adminInfoForCatch: { id: string; email: string; name: string | null } | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const adminSessionToken = req.headers.get('X-Admin-Session');
    if (!adminSessionToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing admin session token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    const nowIso = new Date().toISOString();
    const { data: adminSession, error: adminError } = await supabase
      .from('tbl_admin_sessions')
      .select(`
        tas_admin_id,
        admin:tas_admin_id(
          tau_id,
          tau_email,
          tau_full_name,
          tau_role,
          tau_is_active
        )
      `)
      .eq('tas_session_token', adminSessionToken)
      .gt('tas_expires_at', nowIso)
      .maybeSingle();

    const adminUser = adminSession?.admin;
    if (adminError || !adminUser || !adminUser.tau_is_active) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid admin session' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { withdrawalId } = await req.json();
    requestedWithdrawalId = withdrawalId || null;

    if (!withdrawalId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing withdrawal ID' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('tbl_withdrawal_requests')
      .select('*')
      .eq('twr_id', withdrawalId)
      .single();

    if (withdrawalError || !withdrawal) {
      return new Response(
        JSON.stringify({ success: false, error: 'Withdrawal request not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!['pending', 'failed'].includes(withdrawal.twr_status)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Withdrawal already processed' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: settingsRows, error: settingsError } = await supabase
      .from('tbl_system_settings')
      .select('tss_setting_key, tss_setting_value')
      .in('tss_setting_key', [
        'payment_mode',
        'usdt_address',
        'usdt_address_testnet',
        'usdt_address_mainnet',
        'admin_payment_wallet',
        'admin_payment_wallet_testnet',
        'admin_payment_wallet_mainnet'
      ]);

    if (settingsError) {
      throw settingsError;
    }

    const settingsMap: Record<string, any> = {};
    for (const row of settingsRows || []) {
      settingsMap[row.tss_setting_key] = parseSetting(row.tss_setting_value);
    }

    const paymentMode = settingsMap.payment_mode;
    const isMainnet = paymentMode === true || paymentMode === '1' || paymentMode === 1 || paymentMode === 'true';

    const adminPaymentWallet = String(
      (isMainnet ? settingsMap.admin_payment_wallet_mainnet : settingsMap.admin_payment_wallet_testnet) ??
      settingsMap.admin_payment_wallet ??
      ''
    ).trim();

    const usdtAddress = String(
      (isMainnet ? settingsMap.usdt_address_mainnet : settingsMap.usdt_address_testnet) ??
      settingsMap.usdt_address ??
      ''
    ).trim();

    if (!ethers.isAddress(adminPaymentWallet)) {
      throw new Error('Admin payment wallet not configured');
    }

    if (!ethers.isAddress(usdtAddress)) {
      throw new Error('USDT contract address not configured');
    }

    const updateResult = await supabase
      .from('tbl_withdrawal_requests')
      .update({
        twr_status: 'processing',
        twr_admin_debug: null
      })
      .eq('twr_id', withdrawalId)
      .in('twr_status', ['pending', 'failed']);

    if (updateResult.error) {
      throw updateResult.error;
    }

    const adminInfo = {
      id: adminUser.tau_id,
      email: adminUser.tau_email,
      name: adminUser.tau_full_name || null
    };
    adminInfoForCatch = adminInfo;

    const { data: userRow } = await supabase
      .from('tbl_users')
      .select('tu_email')
      .eq('tu_id', withdrawal.twr_user_id)
      .maybeSingle();

    const { data: profile } = await supabase
      .from('tbl_user_profiles')
      .select('tup_mobile')
      .eq('tup_user_id', withdrawal.twr_user_id)
      .maybeSingle();

    const userEmail = userRow?.tu_email || '';
    const userMobile = profile?.tup_mobile || null;

    if (userEmail) {
      await sendEmail(
        supabaseUrl,
        userEmail,
        withdrawal.twr_status === 'failed' ? 'Withdrawal Retry Started' : 'Withdrawal Approved',
        `<p>Your withdrawal of ${withdrawal.twr_amount} USDT has been ${withdrawal.twr_status === 'failed' ? 'retried' : 'approved'} and is processing.</p>`
      );
    }

    if (isValidMobile(userMobile)) {
      await sendSms(
        supabaseUrl,
        userMobile,
        `Withdrawal ${withdrawal.twr_status === 'failed' ? 'retry started' : 'approved'} for ${withdrawal.twr_amount} USDT.`
      );
    }

    const txHash = await processTransfer({
      supabase,
      requestId: withdrawalId,
      userId: withdrawal.twr_user_id,
      amount: Number(withdrawal.twr_amount),
      netAmount: Number(withdrawal.twr_net_amount),
      destinationAddress: withdrawal.twr_destination_address,
      adminPaymentWallet,
      usdtAddress,
      paymentMode,
      adminInfo
    });

    await supabase
      .from('tbl_withdrawal_requests')
      .update({
        twr_status: 'completed',
        twr_processed_at: new Date().toISOString(),
        twr_processed_by_admin_id: adminUser.tau_id,
        twr_processed_by_admin_email: adminUser.tau_email,
        twr_processed_by_admin_name: adminUser.tau_full_name || null,
        twr_blockchain_tx: txHash,
        twr_admin_debug: `Transfer completed. tx=${txHash}`
      })
      .eq('twr_id', withdrawalId);

    if (userEmail) {
      await sendEmail(
        supabaseUrl,
        userEmail,
        'Withdrawal Completed',
        `<p>Your withdrawal has been completed.</p><p>Amount: ${withdrawal.twr_amount} USDT</p><p>Net sent: ${withdrawal.twr_net_amount} USDT</p><p>Transaction: ${txHash}</p>`
      );
    }

    if (isValidMobile(userMobile)) {
      await sendSms(
        supabaseUrl,
        userMobile,
        `Withdrawal completed: ${withdrawal.twr_net_amount} USDT sent. Tx: ${txHash}`
      );
    }

    await logAdminAction(supabase, adminUser.tau_id, 'process_withdrawal', 'withdrawals', {
      withdrawal_id: withdrawalId,
      tx_hash: txHash,
      amount: withdrawal.twr_amount,
      net_amount: withdrawal.twr_net_amount
    });

    return new Response(
      JSON.stringify({
        success: true,
        txHash
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    console.error('Error processing withdrawal:', error);

    // If we flipped the request into "processing" but failed before the transfer-handler
    // updated it, persist a technical admin debug message and a customer-friendly reason.
    try {
      if (requestedWithdrawalId && adminInfoForCatch) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (supabaseUrl && supabaseServiceKey) {
          const supabase = createClient(supabaseUrl, supabaseServiceKey);
          await supabase
            .from('tbl_withdrawal_requests')
            .update({
              twr_status: 'failed',
              twr_failure_reason: formatWithdrawalFailureReason(error),
              twr_admin_debug: formatWithdrawalAdminDebug(error),
              twr_processed_at: new Date().toISOString(),
              twr_processed_by_admin_id: adminInfoForCatch.id,
              twr_processed_by_admin_email: adminInfoForCatch.email,
              twr_processed_by_admin_name: adminInfoForCatch.name
            })
            .eq('twr_id', requestedWithdrawalId)
            .eq('twr_status', 'processing');
        }
      }
    } catch (persistError) {
      console.error('Failed to persist withdrawal admin debug info:', persistError);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
