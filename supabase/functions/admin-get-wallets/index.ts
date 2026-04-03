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

    const { data: walletsData, error: walletsError } = await supabase
      .from('tbl_wallets')
      .select('tw_user_id, tw_balance, tw_currency, tw_created_at')
      .eq('tw_currency', 'USDT')
      .order('tw_balance', { ascending: false });

    if (walletsError) {
      throw walletsError;
    }

    if (!walletsData || walletsData.length === 0) {
      return new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userIds = walletsData.map((wallet: any) => wallet.tw_user_id);

    const { data: usersData, error: usersError } = await supabase
      .from('tbl_users')
      .select(
        `
        tu_id,
        tu_email,
        tu_user_type,
        tbl_user_profiles (
          tup_first_name,
          tup_last_name
        )
      `
      )
      .in('tu_id', userIds);

    if (usersError) {
      throw usersError;
    }

    const companyUserIds = usersData?.filter((user: any) => user.tu_user_type === 'company').map((user: any) => user.tu_id) || [];
    const companiesMap = new Map<string, string>();
    if (companyUserIds.length > 0) {
      const { data: companiesData } = await supabase
        .from('tbl_companies')
        .select('tc_user_id, tc_company_name')
        .in('tc_user_id', companyUserIds);

      if (companiesData) {
        companiesData.forEach((company: any) => {
          companiesMap.set(company.tc_user_id, company.tc_company_name);
        });
      }
    }

    const walletsWithStats = await Promise.all(
      walletsData.map(async (wallet: any) => {
        try {
          const { data: txData } = await supabase
            .from('tbl_wallet_transactions')
            .select('twt_amount, twt_transaction_type, twt_created_at')
            .eq('twt_user_id', wallet.tw_user_id)
            .eq('twt_status', 'completed');

          const totalEarned = txData?.filter((tx: any) => tx.twt_transaction_type === 'credit')
            .reduce((sum: number, tx: any) => sum + Number(tx.twt_amount), 0) || 0;

          const totalSpent = txData?.filter((tx: any) => tx.twt_transaction_type === 'debit')
            .reduce((sum: number, tx: any) => sum + Number(tx.twt_amount), 0) || 0;

          const lastTransaction = txData && txData.length > 0
            ? txData.reduce((latest: string, tx: any) =>
                new Date(tx.twt_created_at) > new Date(latest) ? tx.twt_created_at : latest,
              txData[0].twt_created_at
            )
            : wallet.tw_created_at;

          const user = usersData?.find((u: any) => u.tu_id === wallet.tw_user_id);
          const userType = user?.tu_user_type as 'customer' | 'company' | 'admin';
          const userEmail = user?.tu_email || 'Unknown Email';

          let userName = 'Unknown User';
          let companyName: string | undefined;
          if (userType === 'company') {
            companyName = companiesMap.get(wallet.tw_user_id);
            userName = companyName || 'Company User';
          } else {
            const firstName = user?.tbl_user_profiles?.[0]?.tup_first_name || '';
            const lastName = user?.tbl_user_profiles?.[0]?.tup_last_name || '';
            userName = firstName || lastName ? `${firstName} ${lastName}`.trim() : userEmail;
          }

          return {
            user_id: wallet.tw_user_id,
            user_email: userEmail,
            user_name: userName,
            user_type: userType,
            wallet_balance: Number(wallet.tw_balance),
            total_earned: totalEarned,
            total_spent: totalSpent,
            transaction_count: txData?.length || 0,
            last_transaction: lastTransaction,
            company_name: companyName
          };
        } catch {
          const user = usersData?.find((u: any) => u.tu_id === wallet.tw_user_id);
          return {
            user_id: wallet.tw_user_id,
            user_email: user?.tu_email || 'Unknown Email',
            user_name: user?.tbl_user_profiles?.[0]?.tup_first_name
              ? `${user.tbl_user_profiles[0].tup_first_name} ${user.tbl_user_profiles[0].tup_last_name || ''}`.trim()
              : user?.tu_email || 'Unknown User',
            user_type: (user?.tu_user_type as 'customer' | 'company' | 'admin') || 'customer',
            wallet_balance: Number(wallet.tw_balance),
            total_earned: 0,
            total_spent: 0,
            transaction_count: 0,
            last_transaction: wallet.tw_created_at
          };
        }
      })
    );

    return new Response(JSON.stringify({ success: true, data: walletsWithStats }), {
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
