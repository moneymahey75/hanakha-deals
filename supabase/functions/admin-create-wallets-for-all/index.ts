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

    const { data: users, error: usersError } = await supabase
      .from('tbl_users')
      .select('tu_id')
      .eq('tu_is_active', true);

    if (usersError) {
      throw usersError;
    }

    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ success: true, data: { created: 0 } }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existingWallets, error: walletsError } = await supabase
      .from('tbl_wallets')
      .select('tw_user_id, tw_wallet_type')
      .eq('tw_currency', 'USDT');

    if (walletsError) {
      throw walletsError;
    }

    const existingByUser = new Map<string, Set<string>>();
    for (const row of existingWallets || []) {
      const userId = String((row as any).tw_user_id || '');
      const walletType = String((row as any).tw_wallet_type || 'working');
      if (!userId) continue;
      if (!existingByUser.has(userId)) existingByUser.set(userId, new Set());
      existingByUser.get(userId)!.add(walletType);
    }

    const usersWithoutWorkingWallet = users.filter((user: any) => !(existingByUser.get(String(user.tu_id))?.has('working')));
    const usersWithoutNonWorkingWallet = users.filter((user: any) => !(existingByUser.get(String(user.tu_id))?.has('non_working')));

    if (usersWithoutWorkingWallet.length === 0 && usersWithoutNonWorkingWallet.length === 0) {
      return new Response(JSON.stringify({ success: true, data: { created: 0 } }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const nowIso = new Date().toISOString();
    const creations = [
      ...usersWithoutWorkingWallet.map((user: any) => ({
        tw_user_id: user.tu_id,
        tw_balance: 0,
        tw_reserved_balance: 0,
        tw_currency: 'USDT',
        tw_wallet_type: 'working',
        tw_is_active: true,
        tw_created_at: nowIso,
        tw_updated_at: nowIso
      })),
      ...usersWithoutNonWorkingWallet.map((user: any) => ({
        tw_user_id: user.tu_id,
        tw_balance: 0,
        tw_reserved_balance: 0,
        tw_currency: 'USDT',
        tw_wallet_type: 'non_working',
        tw_is_active: true,
        tw_created_at: nowIso,
        tw_updated_at: nowIso
      }))
    ];

    const { error: createError } = await supabase.from('tbl_wallets').insert(creations);
    if (createError) {
      throw createError;
    }

    await logAdminAction(supabase, admin.tau_id, 'create_wallets_for_all', 'wallets', {
      created: creations.length
    });

    return new Response(JSON.stringify({ success: true, data: { created: creations.length } }), {
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
