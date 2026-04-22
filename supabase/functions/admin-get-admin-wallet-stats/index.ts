import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ethers } from 'npm:ethers@6.10.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
};

const DEFAULT_MAINNET_RPC = 'https://bsc-dataseed1.binance.org/';
const DEFAULT_TESTNET_RPC = 'https://data-seed-prebsc-1-s1.binance.org:8545/';

const USDT_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
];

const parseSetting = (raw: any) => {
  if (raw === null || raw === undefined) return raw;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
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

const startOfTodayIso = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  return start.toISOString();
};

const endOfTodayIso = () => {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  return end.toISOString();
};

const toNumber = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
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

    const { data: settingsRows, error: settingsError } = await supabase
      .from('tbl_system_settings')
      .select('tss_setting_key, tss_setting_value')
      .in('tss_setting_key', ['admin_payment_wallet', 'payment_mode', 'usdt_address']);

    if (settingsError) throw settingsError;

    const settingsMap: Record<string, any> = {};
    for (const row of settingsRows || []) {
      settingsMap[row.tss_setting_key] = parseSetting(row.tss_setting_value);
    }

    const adminPaymentWallet = String(settingsMap.admin_payment_wallet || '').trim();
    const usdtAddress = String(settingsMap.usdt_address || '').trim();
    const paymentMode = settingsMap.payment_mode;

    const isMainnet = paymentMode === true || paymentMode === '1' || paymentMode === 1 || paymentMode === 'true';
    const rpcUrl = isMainnet
      ? (Deno.env.get('BSC_MAINNET_RPC_URL') || DEFAULT_MAINNET_RPC)
      : (Deno.env.get('BSC_TESTNET_RPC_URL') || DEFAULT_TESTNET_RPC);

    let walletUsdtBalance = 0;
    let walletNativeBalance = 0;
    let walletAddress = adminPaymentWallet;

    if (ethers.isAddress(adminPaymentWallet) && ethers.isAddress(usdtAddress)) {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const token = new ethers.Contract(usdtAddress, USDT_ABI, provider);
      const [decimals, rawUsdt, rawNative] = await Promise.all([
        token.decimals() as Promise<number>,
        token.balanceOf(adminPaymentWallet) as Promise<bigint>,
        provider.getBalance(adminPaymentWallet) as Promise<bigint>,
      ]);
      walletUsdtBalance = Number(ethers.formatUnits(rawUsdt, decimals));
      walletNativeBalance = Number(ethers.formatEther(rawNative));
    }

    const startIso = startOfTodayIso();
    const endIso = endOfTodayIso();

    const [paymentsCreatedRes, paymentsVerifiedRes, withdrawalsRequestedRes] = await Promise.all([
      supabase
        .from('tbl_payments')
        .select('tp_id, tp_user_id, tp_amount, tp_payment_status, tp_created_at')
        .eq('tp_payment_status', 'completed')
        .gte('tp_created_at', startIso)
        .lte('tp_created_at', endIso)
        .limit(5000),
      supabase
        .from('tbl_payments')
        .select('tp_id, tp_user_id, tp_amount, tp_payment_status, tp_verified_at')
        .eq('tp_payment_status', 'completed')
        .gte('tp_verified_at', startIso)
        .lte('tp_verified_at', endIso)
        .limit(5000),
      supabase
        .from('tbl_withdrawal_requests')
        .select('twr_id, twr_user_id, twr_amount, twr_status, twr_requested_at')
        .gte('twr_requested_at', startIso)
        .lte('twr_requested_at', endIso)
        .limit(5000),
    ]);

    if (paymentsCreatedRes.error) throw paymentsCreatedRes.error;
    if (paymentsVerifiedRes.error) throw paymentsVerifiedRes.error;
    if (withdrawalsRequestedRes.error) throw withdrawalsRequestedRes.error;

    const paymentsMap = new Map<string, { amount: number; userId: string | null }>();
    for (const row of (paymentsCreatedRes.data || []) as any[]) {
      if (!row?.tp_id) continue;
      paymentsMap.set(String(row.tp_id), { amount: toNumber(row.tp_amount), userId: row?.tp_user_id ? String(row.tp_user_id) : null });
    }
    for (const row of (paymentsVerifiedRes.data || []) as any[]) {
      if (!row?.tp_id) continue;
      paymentsMap.set(String(row.tp_id), { amount: toNumber(row.tp_amount), userId: row?.tp_user_id ? String(row.tp_user_id) : null });
    }
    const payments = Array.from(paymentsMap.values());

    const withdrawals = (withdrawalsRequestedRes.data || []) as any[];

    const userIds = Array.from(new Set([
      ...payments.map((p) => p.userId).filter(Boolean),
      ...withdrawals.map((w) => w?.twr_user_id ? String(w.twr_user_id) : null).filter(Boolean),
    ])) as string[];

    const userDummyMap = new Map<string, boolean>();
    const chunk = <T>(items: T[], size: number) => {
      const chunks: T[][] = [];
      for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
      return chunks;
    };

    for (const ids of chunk(userIds, 500)) {
      const { data: usersData, error: usersError } = await supabase
        .from('tbl_users')
        .select('tu_id, tu_is_dummy')
        .in('tu_id', ids);
      if (usersError) throw usersError;
      for (const u of usersData || []) {
        userDummyMap.set(String((u as any).tu_id), !!(u as any).tu_is_dummy);
      }
    }

    const todayEarningsAll = payments.reduce((sum, p) => sum + toNumber(p.amount), 0);
    const todayEarningsDummy = payments.reduce((sum, p) => {
      const isDummy = p.userId ? (userDummyMap.get(p.userId) ?? false) : false;
      return sum + (isDummy ? toNumber(p.amount) : 0);
    }, 0);
    const todayEarningsReal = todayEarningsAll - todayEarningsDummy;

    const todayWithdrawalsRequestedAll = withdrawals.reduce((sum: number, row: any) => sum + toNumber(row?.twr_amount), 0);
    const todayWithdrawalsRequestedDummy = withdrawals.reduce((sum: number, row: any) => {
      const userId = row?.twr_user_id ? String(row.twr_user_id) : null;
      const isDummy = userId ? (userDummyMap.get(userId) ?? false) : false;
      return sum + (isDummy ? toNumber(row?.twr_amount) : 0);
    }, 0);
    const todayWithdrawalsRequestedReal = todayWithdrawalsRequestedAll - todayWithdrawalsRequestedDummy;

    const todayWithdrawalsCountAll = withdrawals.length;
    const todayWithdrawalsCountDummy = withdrawals.reduce((count: number, row: any) => {
      const userId = row?.twr_user_id ? String(row.twr_user_id) : null;
      const isDummy = userId ? (userDummyMap.get(userId) ?? false) : false;
      return count + (isDummy ? 1 : 0);
    }, 0);
    const todayWithdrawalsCountReal = todayWithdrawalsCountAll - todayWithdrawalsCountDummy;

    return new Response(JSON.stringify({
      success: true,
      data: {
        walletAddress,
        walletUsdtBalance,
        walletNativeBalance,
        todayEarnings: todayEarningsAll,
        todayEarningsAll,
        todayEarningsReal,
        todayEarningsDummy,
        todayWithdrawalsRequested: todayWithdrawalsRequestedAll,
        todayWithdrawalsRequestedAll,
        todayWithdrawalsRequestedReal,
        todayWithdrawalsRequestedDummy,
        todayWithdrawalsCount: todayWithdrawalsCountAll,
        todayWithdrawalsCountAll,
        todayWithdrawalsCountReal,
        todayWithdrawalsCountDummy,
        startIso,
        endIso
      }
    }), {
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
