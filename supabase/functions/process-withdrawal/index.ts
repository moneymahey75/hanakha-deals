import { createClient } from 'jsr:@supabase/supabase-js@2';
import { adminHasPermission, logAdminAction } from '../_shared/adminSession.ts';
import { ethers } from 'npm:ethers@6.10.0';
import { formatWithdrawalAdminDebug, formatWithdrawalFailureReason } from '../_shared/withdrawalFailureReason.ts';
import { brandedEmailShell, detailTable, sendSmtpMail } from '../_shared/email.ts';

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

const sendEmail = async (to: string, subject: string, html: string, text: string) => {
  try {
    await sendSmtpMail({
      to,
      subject,
      html,
      text,
      fromName: 'ShopClix Payments',
    });
  } catch (error) {
    console.warn('Failed to send withdrawal email notification');
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
    console.warn('Failed to send withdrawal SMS notification');
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

const isUuid = (value?: string | null) =>
  Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));

const processTransfer = async (params: {
  supabase: any;
  requestId: string;
  userId: string;
  amount: number;
  netAmount: number;
  destinationAddress: string;
  walletType: 'working' | 'non_working' | 'reward' | 'autopool';
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
    walletType,
    adminPaymentWallet,
    usdtAddress,
    paymentMode,
    adminInfo
  } = params;

  if (!isUuid(requestId) || !isUuid(userId)) {
    throw new Error('Invalid withdrawal request');
  }

  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(netAmount) || netAmount <= 0 || netAmount > amount) {
    throw new Error('Invalid withdrawal amount');
  }

  if (!ethers.isAddress(destinationAddress)) {
    throw new Error('Invalid withdrawal destination');
  }

  const { data: debitResult, error: debitError } = await supabase.rpc('debit_wallet_for_withdrawal', {
    p_withdrawal_id: requestId
  });

  if (debitError) {
    throw new Error(debitError.message || 'Unable to reserve withdrawal balance');
  }

  const walletTxId = debitResult?.wallet_transaction_id;
  if (!walletTxId) {
    throw new Error('Withdrawal debit transaction not found');
  }

  let submittedTxHash: string | null = null;
  try {
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

    const token = new ethers.Contract(usdtAddress, USDT_ABI, signer);
    const decimals = await token.decimals();
    const amountUnits = ethers.parseUnits(netAmount.toFixed(6), decimals);
    const tx = await token.transfer(destinationAddress, amountUnits);
    submittedTxHash = tx.hash;

    await supabase
      .from('tbl_wallet_transactions')
      .update({
        twt_blockchain_hash: tx.hash
      })
      .eq('twt_id', walletTxId);

    await tx.wait(MIN_CONFIRMATIONS_DEFAULT);

    const { error: txUpdateError } = await supabase
      .from('tbl_wallet_transactions')
      .update({
        twt_status: 'completed',
        twt_blockchain_hash: tx.hash
      })
      .eq('twt_id', walletTxId);

    if (txUpdateError) {
      console.warn('Failed to update withdrawal wallet transaction status');
    }

    return tx.hash as string;
  } catch (error: any) {
    const failureReason = formatWithdrawalFailureReason(error);

    if (submittedTxHash) {
      await supabase
        .from('tbl_wallet_transactions')
        .update({
          twt_status: 'pending',
          twt_blockchain_hash: submittedTxHash
        })
        .eq('twt_id', walletTxId);

      await supabase
        .from('tbl_withdrawal_requests')
        .update({
          twr_status: 'processing',
          twr_failure_reason: 'Transfer submitted on-chain but confirmation is pending. Verify the transaction before retrying or failing.',
          twr_admin_debug: `${formatWithdrawalAdminDebug(error)} | submitted_tx=${submittedTxHash}`,
          twr_blockchain_tx: submittedTxHash,
          twr_processed_at: new Date().toISOString(),
          twr_processed_by_admin_id: adminInfo.id,
          twr_processed_by_admin_email: adminInfo.email,
          twr_processed_by_admin_name: adminInfo.name
        })
        .eq('twr_id', requestId);

      const pendingError = new Error(`Withdrawal transfer submitted but confirmation is pending: ${submittedTxHash}`);
      (pendingError as any).status = 'submitted_pending_confirmation';
      (pendingError as any).txHash = submittedTxHash;
      throw pendingError;
    }

    await supabase
      .from('tbl_wallet_transactions')
      .update({ twt_status: 'failed' })
      .eq('twt_id', walletTxId);

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
          tau_permissions,
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

    if (!adminHasPermission(adminUser, 'withdrawals', 'write')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Permission denied: withdrawals.write' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { withdrawalId } = await req.json();
    requestedWithdrawalId = withdrawalId || null;

    if (!isUuid(withdrawalId)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid withdrawal ID' }),
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

    const existingBlockchainTx = String(withdrawal.twr_blockchain_tx || '').trim();
    const isProcessingWithTx = withdrawal.twr_status === 'processing' && /^0x[a-fA-F0-9]{64}$/.test(existingBlockchainTx);

    if (!['pending', 'failed'].includes(withdrawal.twr_status) && !isProcessingWithTx) {
      return new Response(
        JSON.stringify({ success: false, error: 'Withdrawal already processed' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!Number.isFinite(Number(withdrawal.twr_amount)) || Number(withdrawal.twr_amount) <= 0 ||
        !Number.isFinite(Number(withdrawal.twr_net_amount)) || Number(withdrawal.twr_net_amount) <= 0 ||
        Number(withdrawal.twr_net_amount) > Number(withdrawal.twr_amount) ||
        !ethers.isAddress(String(withdrawal.twr_destination_address || ''))) {
      return new Response(
        JSON.stringify({ success: false, error: 'Withdrawal request is invalid' }),
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

    if (isProcessingWithTx) {
      const rpcUrl = isMainnet
        ? (Deno.env.get('BSC_MAINNET_RPC_URL') || DEFAULT_MAINNET_RPC)
        : (Deno.env.get('BSC_TESTNET_RPC_URL') || DEFAULT_TESTNET_RPC);
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const receipt = await provider.getTransactionReceipt(existingBlockchainTx);

      if (!receipt) {
        return new Response(
          JSON.stringify({
            success: false,
            status: 'processing',
            txHash: existingBlockchainTx,
            error: 'Blockchain transaction is still pending confirmation',
          }),
          {
            status: 202,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      if (receipt.status !== 1) {
        throw new Error('Submitted blockchain transaction failed on-chain');
      }

      const latestBlock = await provider.getBlockNumber();
      const confirmations = Math.max(0, latestBlock - receipt.blockNumber + 1);
      if (confirmations < MIN_CONFIRMATIONS_DEFAULT) {
        return new Response(
          JSON.stringify({
            success: false,
            status: 'processing',
            txHash: existingBlockchainTx,
            error: `Waiting for confirmations (${confirmations}/${MIN_CONFIRMATIONS_DEFAULT})`,
          }),
          {
            status: 202,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      await supabase
        .from('tbl_wallet_transactions')
        .update({
          twt_status: 'completed',
          twt_blockchain_hash: existingBlockchainTx
        })
        .eq('twt_reference_type', 'withdrawal')
        .eq('twt_reference_id', withdrawalId)
        .eq('twt_transaction_type', 'debit');

      await supabase
        .from('tbl_withdrawal_requests')
        .update({
          twr_status: 'completed',
          twr_processed_at: new Date().toISOString(),
          twr_processed_by_admin_id: adminUser.tau_id,
          twr_processed_by_admin_email: adminUser.tau_email,
          twr_processed_by_admin_name: adminUser.tau_full_name || null,
          twr_failure_reason: null,
          twr_admin_debug: `Transfer verified after pending confirmation. tx=${existingBlockchainTx}`,
          twr_blockchain_tx: existingBlockchainTx
        })
        .eq('twr_id', withdrawalId);

      await logAdminAction(supabase, adminUser.tau_id, 'verify_withdrawal_transfer', 'withdrawals', {
        withdrawal_id: withdrawalId,
        block_number: receipt.blockNumber,
        confirmations
      });

      return new Response(
        JSON.stringify({
          success: true,
          txHash: existingBlockchainTx,
          verified: true
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const updateResult = await supabase
      .from('tbl_withdrawal_requests')
      .update({
        twr_status: 'processing',
        twr_admin_debug: null
      })
      .eq('twr_id', withdrawalId)
      .in('twr_status', ['pending', 'failed'])
      .is('twr_blockchain_tx', null)
      .select('twr_id')
      .maybeSingle();

    if (updateResult.error) {
      throw updateResult.error;
    }
    if (!updateResult.data?.twr_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Withdrawal status changed. Please refresh and try again.' }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
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
        userEmail,
        withdrawal.twr_status === 'failed' ? 'Withdrawal Retry Started' : 'Withdrawal Approved',
        brandedEmailShell({
          eyebrow: 'Withdrawal Update',
          title: withdrawal.twr_status === 'failed' ? 'Withdrawal retry started' : 'Withdrawal approved',
          subtitle: 'Your withdrawal is now processing.',
          children: `
            <tr>
              <td style="padding:34px;">
                <div style="font-size:16px;line-height:1.8;color:#405247;">Your withdrawal request has been ${withdrawal.twr_status === 'failed' ? 'retried' : 'approved'} and is processing.</div>
                ${detailTable([
                  { label: 'Amount', value: `${withdrawal.twr_amount} USDT` },
                  { label: 'Status', value: 'Processing' },
                ])}
              </td>
            </tr>
          `,
        }),
        `Your withdrawal of ${withdrawal.twr_amount} USDT has been ${withdrawal.twr_status === 'failed' ? 'retried' : 'approved'} and is processing.`
      );
    }

    if (isValidMobile(userMobile)) {
      await sendSms(
        supabaseUrl,
        userMobile,
        `Withdrawal ${withdrawal.twr_status === 'failed' ? 'retry started' : 'approved'} for ${withdrawal.twr_amount} USDT.`
      );
    }

    const walletTypeRaw = String((withdrawal as any).twr_wallet_type || 'working');
    const walletType: 'working' | 'non_working' | 'reward' | 'autopool' =
      walletTypeRaw === 'reward' ? 'reward' : walletTypeRaw === 'non_working' ? 'non_working' : walletTypeRaw === 'autopool' ? 'autopool' : 'working';

    const txHash = await processTransfer({
      supabase,
      requestId: withdrawalId,
      userId: withdrawal.twr_user_id,
      amount: Number(withdrawal.twr_amount),
      netAmount: Number(withdrawal.twr_net_amount),
      destinationAddress: withdrawal.twr_destination_address,
      walletType,
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
      .eq('twr_id', withdrawalId)
      .eq('twr_status', 'processing');

    if (userEmail) {
      await sendEmail(
        userEmail,
        'Withdrawal Completed',
        brandedEmailShell({
          eyebrow: 'Withdrawal Confirmation',
          title: 'Withdrawal completed',
          subtitle: 'Your withdrawal has been sent successfully.',
          children: `
            <tr>
              <td style="padding:34px;">
                <div style="font-size:16px;line-height:1.8;color:#405247;">Your withdrawal has been completed and sent to your wallet.</div>
                ${detailTable([
                  { label: 'Amount', value: `${withdrawal.twr_amount} USDT` },
                  { label: 'Net Sent', value: `${withdrawal.twr_net_amount} USDT` },
                  { label: 'Transaction Hash', value: txHash },
                  { label: 'Status', value: 'Completed' },
                ])}
              </td>
            </tr>
          `,
        }),
        `Your withdrawal has been completed. Amount: ${withdrawal.twr_amount} USDT. Net sent: ${withdrawal.twr_net_amount} USDT. Transaction: ${txHash}.`
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
    if (error?.status === 'submitted_pending_confirmation' && error?.txHash) {
      return new Response(
        JSON.stringify({
          success: false,
          status: 'processing',
          txHash: error.txHash,
          error: 'Withdrawal transfer submitted but confirmation is pending',
        }),
        {
          status: 202,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

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
      console.warn('Failed to persist withdrawal admin debug info');
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: formatWithdrawalFailureReason(error),
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
