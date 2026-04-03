import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ethers } from 'npm:ethers@6.10.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
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

const isMultiple = (amount: number, step: number) => {
  if (step <= 0) return true;
  const factor = 100; // cents precision
  const scaledAmount = Math.round(amount * factor);
  const scaledStep = Math.round(step * factor);
  return scaledAmount % scaledStep === 0;
};

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
    paymentMode
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
      twt_description: 'Withdrawal request',
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

  const isMainnet = paymentMode === true || paymentMode === '1' || paymentMode === 1 || paymentMode === 'true';
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
    const failureReason = error?.message || 'On-chain transfer failed';
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
        twr_processed_at: new Date().toISOString()
      })
      .eq('twr_id', requestId);

    throw error;
  }
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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Missing auth token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid user session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { amount } = await req.json();
    const withdrawalAmount = Number(amount);

    if (!Number.isFinite(withdrawalAmount) || withdrawalAmount <= 0) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid withdrawal amount' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = authData.user.id;
    const userEmail = authData.user.email || '';

    const { data: profile } = await supabase
      .from('tbl_user_profiles')
      .select('tup_mobile')
      .eq('tup_user_id', userId)
      .maybeSingle();

    const userMobile = profile?.tup_mobile || null;

    const { data: settingsRows, error: settingsError } = await supabase
      .from('tbl_system_settings')
      .select('tss_setting_key, tss_setting_value')
      .in('tss_setting_key', [
        'withdrawal_min_amount',
        'withdrawal_step_amount',
        'withdrawal_commission_percent',
        'withdrawal_auto_transfer',
        'admin_payment_wallet',
        'payment_mode',
        'usdt_address'
      ]);

    if (settingsError) {
      throw settingsError;
    }

    const settingsMap: Record<string, any> = {};
    for (const row of settingsRows || []) {
      settingsMap[row.tss_setting_key] = parseSetting(row.tss_setting_value);
    }

    const minAmount = Number(settingsMap.withdrawal_min_amount ?? 10);
    const stepAmount = Number(settingsMap.withdrawal_step_amount ?? 10);
    const commissionPercent = Number(settingsMap.withdrawal_commission_percent ?? 0.5);
    const autoTransfer = Boolean(settingsMap.withdrawal_auto_transfer ?? false);

    if (withdrawalAmount < minAmount) {
      return new Response(JSON.stringify({ success: false, error: `Minimum withdrawal is ${minAmount}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isMultiple(withdrawalAmount, stepAmount)) {
      return new Response(JSON.stringify({ success: false, error: `Withdrawal must be a multiple of ${stepAmount}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: wallet, error: walletError } = await supabase
      .from('tbl_wallets')
      .select('tw_id, tw_balance')
      .eq('tw_user_id', userId)
      .eq('tw_currency', 'USDT')
      .maybeSingle();

    if (walletError || !wallet) {
      return new Response(JSON.stringify({ success: false, error: 'Wallet not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: defaultWallet } = await supabase
      .from('tbl_user_wallet_connections')
      .select('tuwc_id, tuwc_wallet_address')
      .eq('tuwc_user_id', userId)
      .eq('tuwc_is_default', true)
      .eq('tuwc_is_active', true)
      .maybeSingle();

    if (!defaultWallet?.tuwc_wallet_address) {
      return new Response(JSON.stringify({ success: false, error: 'Default wallet not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!ethers.isAddress(defaultWallet.tuwc_wallet_address)) {
      return new Response(JSON.stringify({ success: false, error: 'Default wallet address is invalid' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: pendingRows } = await supabase
      .from('tbl_withdrawal_requests')
      .select('twr_amount')
      .eq('twr_user_id', userId)
      .in('twr_status', ['pending', 'processing', 'approved']);

    const pendingTotal = (pendingRows || []).reduce((sum: number, row: any) => sum + Number(row.twr_amount || 0), 0);
    const availableBalance = Number(wallet.tw_balance || 0) - pendingTotal;

    if (withdrawalAmount > availableBalance) {
      return new Response(JSON.stringify({ success: false, error: 'Insufficient wallet balance' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const commissionAmount = Number((withdrawalAmount * (commissionPercent / 100)).toFixed(6));
    const netAmount = Number((withdrawalAmount - commissionAmount).toFixed(6));

    const { data: requestRow, error: requestError } = await supabase
      .from('tbl_withdrawal_requests')
      .insert({
        twr_user_id: userId,
        twr_wallet_connection_id: defaultWallet.tuwc_id,
        twr_destination_address: defaultWallet.tuwc_wallet_address,
        twr_amount: withdrawalAmount,
        twr_commission_percent: commissionPercent,
        twr_commission_amount: commissionAmount,
        twr_net_amount: netAmount,
        twr_status: autoTransfer ? 'processing' : 'pending',
        twr_auto_transfer: autoTransfer
      })
      .select()
      .single();

    if (requestError || !requestRow) {
      throw requestError || new Error('Failed to create withdrawal request');
    }

    if (!autoTransfer) {
      return new Response(JSON.stringify({
        success: true,
        request_id: requestRow.twr_id,
        status: 'pending'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminPaymentWallet = String(settingsMap.admin_payment_wallet || '').trim();
    const usdtAddress = String(settingsMap.usdt_address || '').trim();
    const paymentMode = settingsMap.payment_mode;

    if (!ethers.isAddress(adminPaymentWallet)) {
      throw new Error('Admin payment wallet not configured');
    }

    if (!ethers.isAddress(usdtAddress)) {
      throw new Error('USDT contract address not configured');
    }

    try {
      const txHash = await processTransfer({
      supabase,
      requestId: requestRow.twr_id,
      userId,
      amount: withdrawalAmount,
      netAmount,
      destinationAddress: defaultWallet.tuwc_wallet_address,
      adminPaymentWallet,
      usdtAddress,
      paymentMode
      });

      await supabase
        .from('tbl_withdrawal_requests')
        .update({
          twr_status: 'completed',
          twr_processed_at: new Date().toISOString(),
          twr_blockchain_tx: txHash
        })
        .eq('twr_id', requestRow.twr_id);

      if (userEmail) {
        await sendEmail(
          supabaseUrl,
          userEmail,
          'Withdrawal Completed',
          `<p>Your withdrawal of ${withdrawalAmount} USDT has been completed.</p><p>Net sent: ${netAmount} USDT</p><p>Transaction: ${txHash}</p>`
        );
      }

      if (isValidMobile(userMobile)) {
        await sendSms(
          supabaseUrl,
          userMobile,
          `Withdrawal completed: ${netAmount} USDT sent. Tx: ${txHash}`
        );
      }

      return new Response(JSON.stringify({
        success: true,
        request_id: requestRow.twr_id,
        status: 'completed',
        txHash
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      await supabase
        .from('tbl_withdrawal_requests')
        .update({
          twr_status: 'failed',
          twr_failure_reason: error?.message || 'Auto transfer failed',
          twr_processed_at: new Date().toISOString()
        })
        .eq('twr_id', requestRow.twr_id);

      return new Response(JSON.stringify({
        success: false,
        error: error?.message || 'Auto transfer failed',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error: any) {
    console.error('Withdrawal request error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
