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

    const body = await req.json().catch(() => ({}));
    const recompute = body?.recompute === true;
    if (recompute) {
      // Rebuild counts to ensure the admin sees up-to-date and consistent results.
      await supabase.rpc('recompute_all_mlm_level_counts');
    }

    const searchTerm = typeof body?.searchTerm === 'string' ? body.searchTerm.trim() : '';
    const offset = Number.isFinite(Number(body?.offset)) ? Number(body.offset) : 0;
    const limitRaw = Number.isFinite(Number(body?.limit)) ? Number(body.limit) : 25;
    const limit = Math.min(200, Math.max(1, limitRaw));
    const extraLevelRaw = body?.extraLevel;
    const extraLevel = Number.isFinite(Number(extraLevelRaw)) ? Number(extraLevelRaw) : null;
    const requestedExtraLevel = extraLevel && extraLevel >= 1 && extraLevel <= 50 ? extraLevel : null;

    let query = supabase
      .from('tbl_mlm_level_counts')
      .select('*', { count: 'exact' })
      .order('tmlc_level1_count', { ascending: false })
      .order('tmlc_updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (searchTerm) {
      query = query.ilike('tmlc_sponsorship_number', `%${searchTerm}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    const totalCount = count || 0;
    const rows = (data || []) as any[];

    let extraCountsMap = new Map<string, number>();
    let extraCountsAvailable = true;
    if (requestedExtraLevel && requestedExtraLevel > 3 && rows.length > 0) {
      const sponsorships = rows
        .map((row) => String(row?.tmlc_sponsorship_number || '').trim())
        .filter(Boolean);

      if (sponsorships.length > 0) {
        const { data: extraCounts, error: extraCountsError } = await supabase.rpc(
          'get_mlm_level_counts_for_sponsors_at_level',
          { p_level: requestedExtraLevel, p_sponsorship_numbers: sponsorships }
        );
        if (extraCountsError) {
          const message = String((extraCountsError as any)?.message || '').toLowerCase();
          // If the DB migration wasn't applied yet (or PostgREST schema cache hasn't refreshed),
          // don't fail the whole endpoint; return base counts and let the UI show a warning.
          if (message.includes('schema cache') || message.includes('could not find the function')) {
            extraCountsAvailable = false;
          } else {
            throw extraCountsError;
          }
        }
        for (const item of extraCounts || []) {
          const key = String((item as any)?.sponsorship_number || '').trim().toLowerCase();
          if (!key) continue;
          extraCountsMap.set(key, Number((item as any)?.level_count || 0));
        }
      }
    }

    const withTotal = rows.map((row: any) => {
      const sponsorship = String(row?.tmlc_sponsorship_number || '').trim();
      const sponsorshipKey = sponsorship.toLowerCase();
      const extraLevelCount = requestedExtraLevel
        ? (requestedExtraLevel === 1
          ? Number(row?.tmlc_level1_count || 0)
          : requestedExtraLevel === 2
            ? Number(row?.tmlc_level2_count || 0)
            : requestedExtraLevel === 3
              ? Number(row?.tmlc_level3_count || 0)
              : (extraCountsAvailable ? (extraCountsMap.get(sponsorshipKey) ?? 0) : null))
        : null;

      return {
        ...row,
        total_count: totalCount,
        extra_level: requestedExtraLevel,
        extra_level_count: extraLevelCount
      };
    });

    return new Response(JSON.stringify({ success: true, data: withTotal }), {
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
