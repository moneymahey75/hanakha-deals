import { createClient } from 'jsr:@supabase/supabase-js@2';
import { adminHasPermission, logAdminAction, requireAdminSession } from '../_shared/adminSession.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
};

type PackageRow = {
  tus_id: string;
  tus_start_date: string | null;
  tus_status: string;
  tus_exhausted_at?: string | null;
  tus_exhaustion_reason?: string | null;
  tus_payment_amount?: number | string | null;
  plan?: {
    tsp_name?: string | null;
    tsp_price?: number | string | null;
    tsp_plan_phase?: string | null;
  } | null;
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const toAmount = (value: unknown) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
};

const getDayNumber = (startDate: string | null) => {
  if (!startDate) return 1;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return 1;
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  return Math.max(1, Math.floor(diffMs / 86400000) + 1);
};

const ensureWorkingWallet = async (
  supabase: ReturnType<typeof createClient>,
  userId: string
) => {
  const { data: wallet, error: walletError } = await supabase
    .from('tbl_wallets')
    .select('tw_id, tw_balance')
    .eq('tw_user_id', userId)
    .eq('tw_currency', 'USDT')
    .eq('tw_wallet_type', 'working')
    .maybeSingle();

  if (walletError) throw walletError;
  if (wallet) return wallet;

  const walletId = crypto.randomUUID();
  const { error: createError } = await supabase
    .from('tbl_wallets')
    .insert({
      tw_id: walletId,
      tw_user_id: userId,
      tw_balance: 0,
      tw_reserved_balance: 0,
      tw_currency: 'USDT',
      tw_wallet_type: 'working',
      tw_is_active: true,
      tw_created_at: new Date().toISOString(),
      tw_updated_at: new Date().toISOString(),
    });

  if (createError) throw createError;
  return { tw_id: walletId, tw_balance: 0 };
};

const listPackages = async (
  supabase: ReturnType<typeof createClient>,
  userId: string
) => {
  const { data, error } = await supabase
    .from('tbl_user_subscriptions')
    .select(`
      tus_id,
      tus_start_date,
      tus_status,
      tus_exhausted_at,
      tus_exhaustion_reason,
      tus_payment_amount,
      plan:tus_plan_id(tsp_name, tsp_price, tsp_plan_phase)
    `)
    .eq('tus_user_id', userId)
    .in('tus_status', ['active', 'upgraded', 'exhausted'])
    .order('tus_start_date', { ascending: false });

  if (error) throw error;

  return ((data || []) as PackageRow[])
    .filter((row) => (row.plan?.tsp_plan_phase || 'launch') === 'launch')
    .map((row) => {
      const planAmount = toAmount(row.tus_payment_amount ?? row.plan?.tsp_price);
      const daysUsed = Math.min(200, getDayNumber(row.tus_start_date));
      return {
        subscriptionId: row.tus_id,
        planName: row.plan?.tsp_name || 'Launch Package',
        planAmount,
        status: row.tus_status,
        startDate: row.tus_start_date,
        exhaustedAt: row.tus_exhausted_at || null,
        exhaustionReason: row.tus_exhaustion_reason || null,
        daysUsed,
        daysRemaining: Math.max(0, 200 - daysUsed),
      };
    })
    .filter((row) => row.planAmount > 0);
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
      return new Response(JSON.stringify({ success: false, error: 'Permission denied: wallets.write' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const body = await req.json();
    const action = body?.action || 'list';
    const userId = String(body?.userId || '').trim();

    if (!userId) {
      return jsonResponse({ success: false, error: 'Missing userId' }, 400);
    }

    if (action === 'list') {
      const packages = await listPackages(supabase, userId);
      return jsonResponse({ success: true, data: { packages } });
    }

    if (action !== 'apply') {
      return jsonResponse({ success: false, error: 'Invalid action' }, 400);
    }

    const subscriptionId = String(body?.subscriptionId || '').trim();
    const workingAmount = toAmount(body?.workingAmount);
    const nonWorkingAmount = toAmount(body?.nonWorkingAmount);
    const daysToAdd = Math.max(0, Math.floor(toAmount(body?.daysToAdd)));

    if (!subscriptionId) {
      return jsonResponse({ success: false, error: 'Please select a package' }, 400);
    }

    if (workingAmount < 0 || nonWorkingAmount < 0) {
      return jsonResponse({ success: false, error: 'Amounts cannot be negative' }, 400);
    }

    if (workingAmount <= 0 && nonWorkingAmount <= 0 && daysToAdd <= 0) {
      return jsonResponse({ success: false, error: 'Enter income or days to add' }, 400);
    }

    const { data: subscription, error: subscriptionError } = await supabase
      .from('tbl_user_subscriptions')
      .select('tus_id, tus_user_id, tus_start_date, tus_status, plan:tus_plan_id(tsp_name, tsp_price, tsp_plan_phase)')
      .eq('tus_id', subscriptionId)
      .eq('tus_user_id', userId)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;
    if (!subscription) {
      return jsonResponse({ success: false, error: 'Package not found for selected user' }, 404);
    }

    const wallet = await ensureWorkingWallet(supabase, userId);
    let newBalance = Number(wallet.tw_balance || 0);
    const nowIso = new Date().toISOString();
    const transactionRows = [];

    if (workingAmount > 0) {
      newBalance += workingAmount;
      transactionRows.push({
        twt_id: crypto.randomUUID(),
        twt_wallet_id: wallet.tw_id,
        twt_user_id: userId,
        twt_transaction_type: 'credit',
        twt_amount: workingAmount,
        twt_description: 'Admin test working income for package cap validation',
        twt_reference_type: 'admin_working_test',
        twt_reference_id: subscriptionId,
        twt_status: 'completed',
        twt_created_at: nowIso,
      });
    }

    if (nonWorkingAmount > 0) {
      newBalance += nonWorkingAmount;
      transactionRows.push({
        twt_id: crypto.randomUUID(),
        twt_wallet_id: wallet.tw_id,
        twt_user_id: userId,
        twt_transaction_type: 'credit',
        twt_amount: nonWorkingAmount,
        twt_description: 'Admin test non-working income for package cap validation',
        twt_reference_type: 'admin_non_working_test',
        twt_reference_id: subscriptionId,
        twt_status: 'completed',
        twt_created_at: nowIso,
      });
    }

    if (transactionRows.length > 0) {
      const { error: walletUpdateError } = await supabase
        .from('tbl_wallets')
        .update({
          tw_balance: newBalance,
          tw_updated_at: nowIso,
        })
        .eq('tw_id', wallet.tw_id);

      if (walletUpdateError) throw walletUpdateError;

      const { error: txError } = await supabase
        .from('tbl_wallet_transactions')
        .insert(transactionRows);

      if (txError) throw txError;
    }

    if (daysToAdd > 0) {
      const currentStart = subscription.tus_start_date
        ? new Date(subscription.tus_start_date)
        : new Date();
      currentStart.setDate(currentStart.getDate() - daysToAdd);

      const { error: dateUpdateError } = await supabase
        .from('tbl_user_subscriptions')
        .update({ tus_start_date: currentStart.toISOString() })
        .eq('tus_id', subscriptionId);

      if (dateUpdateError) throw dateUpdateError;
    }

    const { data: exhaustionResult, error: exhaustionError } = await supabase
      .rpc('mark_subscription_exhausted_if_needed', { p_subscription_id: subscriptionId });

    if (exhaustionError) throw exhaustionError;

    await logAdminAction(supabase, admin.tau_id, 'package_test_stats', 'wallets', {
      user_id: userId,
      subscription_id: subscriptionId,
      working_amount: workingAmount,
      non_working_amount: nonWorkingAmount,
      days_added: daysToAdd,
      new_balance: newBalance,
      exhaustion_result: exhaustionResult,
    });

    const packages = await listPackages(supabase, userId);
    return jsonResponse({
      success: true,
      data: {
        newBalance,
        exhaustionResult,
        packages,
      },
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to update package test stats';
    const status = message.includes('session') ? 401 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
});
