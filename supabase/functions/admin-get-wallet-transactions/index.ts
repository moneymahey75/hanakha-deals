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

    const { limit, dummyFilter: dummyFilterInput, accountScope } = await req.json();
    const dummyFilterRaw = String(dummyFilterInput ?? accountScope ?? 'all').trim().toLowerCase();
    const dummyFilter = ['all', 'real', 'dummy'].includes(dummyFilterRaw) ? dummyFilterRaw : 'all';

    const { data: transactionsData, error: transactionsError } = await supabase
      .from('tbl_wallet_transactions')
      .select(
        `
        twt_id,
        twt_user_id,
        twt_transaction_type,
        twt_amount,
        twt_description,
        twt_reference_type,
        twt_status,
        twt_created_at
      `
      )
      .order('twt_created_at', { ascending: false })
      .limit(Number.isFinite(limit) ? limit : 100);

    if (transactionsError) {
      throw transactionsError;
    }

    if (!transactionsData || transactionsData.length === 0) {
      return new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userIds = [...new Set(transactionsData.map((tx: any) => tx.twt_user_id))];
    const { data: usersData } = await supabase
      .from('tbl_users')
      .select(
        `
        tu_id,
        tu_email,
        tu_user_type,
        tu_is_dummy,
        tbl_user_profiles (
          tup_first_name,
          tup_last_name
        )
      `
      )
      .in('tu_id', userIds);

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

    const dummyByUserId = new Map<string, boolean>();
    for (const user of (usersData || []) as any[]) {
      dummyByUserId.set(String(user.tu_id), !!user.tu_is_dummy);
    }

    const formattedTransactions = transactionsData.map((tx: any) => {
      const user = usersData?.find((u: any) => u.tu_id === tx.twt_user_id);
      const userType = user?.tu_user_type as 'customer' | 'company' | 'admin';

      let userName = 'Unknown User';
      let companyName: string | undefined;

      if (userType === 'company') {
        companyName = companiesMap.get(tx.twt_user_id);
        userName = companyName || 'Company User';
      } else {
        const firstName = user?.tbl_user_profiles?.[0]?.tup_first_name || '';
        const lastName = user?.tbl_user_profiles?.[0]?.tup_last_name || '';
        userName = firstName || lastName ? `${firstName} ${lastName}`.trim() : user?.tu_email || 'Customer User';
      }

      return {
        ...tx,
        user_info: {
          email: user?.tu_email || 'Unknown Email',
          name: userName,
          type: userType,
          company_name: companyName,
          is_dummy: dummyByUserId.get(String(tx.twt_user_id)) ?? false
        }
      };
    });

    const filteredTransactions =
      dummyFilter === 'all'
        ? formattedTransactions
        : formattedTransactions.filter((tx: any) => {
          const isDummy = !!tx?.user_info?.is_dummy;
          return dummyFilter === 'dummy' ? isDummy : !isDummy;
        });

    return new Response(JSON.stringify({ success: true, data: filteredTransactions }), {
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
