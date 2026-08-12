import { createClient } from 'jsr:@supabase/supabase-js@2';
import { adminHasPermission } from '../_shared/adminSession.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
};

const normalizeString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const expandCaseVariants = (value: string): string[] => {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const variants = [trimmed, trimmed.toUpperCase(), trimmed.toLowerCase()];
  return Array.from(new Set(variants));
};

const buildOrIlike = (column: string, values: string[]) => {
  // PostgREST `.or()` expects a comma-separated list of filters.
  // We use `ilike` for case-insensitive exact match (no wildcards included).
  const parts = values
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => `${column}.ilike.${value}`);
  return parts.join(',');
};

const buildSearchOrIlike = (columns: string[], values: string[]) => {
  const patterns = values
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(/[%*]/g, '').replace(/,/g, ' '));

  return columns
    .flatMap((column) => patterns.map((pattern) => `${column}.ilike.*${pattern}*`))
    .join(',');
};

const applySearchTerm = (value: string, searchTerm: string | null) => {
  if (!searchTerm) return true;
  const haystack = value.toLowerCase();
  const needle = searchTerm.toLowerCase();
  return haystack.includes(needle);
};

const matchesCustomerSearch = (searchBlob: string, sponsorshipNumber: unknown, searchTerm: string | null) => {
  if (applySearchTerm(searchBlob, searchTerm)) return true;
  if (!searchTerm) return true;

  const sponsorKey = normalizeSponsorshipKey(sponsorshipNumber);
  const searchKey = normalizeSponsorshipKey(searchTerm);
  return Boolean(sponsorKey && searchKey && sponsorKey.includes(searchKey));
};

const meetsVerificationRules = (
  user: { tu_email_verified?: boolean | null; tu_mobile_verified?: boolean | null }
) => user.tu_email_verified === true || user.tu_mobile_verified === true;

const resolveRpcUserId = (row: any): string | null => {
  return (
    row?.tmt_user_id ||
    row?.user_id ||
    row?.userId ||
    row?.tup_user_id ||
    row?.id ||
    null
  );
};

const resolveRpcNodeId = (row: any): string | null => {
  return row?.tmt_id || row?.node_id || row?.id || resolveRpcUserId(row);
};

const resolveRpcParentNodeId = (row: any): string | null => {
  return row?.tmt_parent_id || row?.parent_id || row?.parentId || row?.parent_node_id || null;
};

const resolveRpcParentUserId = (row: any): string | null => {
  return row?.parent_user_id || row?.tmt_parent_user_id || row?.tup_parent_user_id || null;
};

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

type PlanFilter = 'all' | 'launch' | 'no_launch' | 'autopool';

const getAutopoolUserIds = async (
  supabase: ReturnType<typeof createClient>,
  userIds: string[]
) => {
  const result = new Set<string>();
  const uniqueUserIds = Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean)));

  for (const idChunk of chunk(uniqueUserIds, 500)) {
    const { data, error } = await supabase
      .from('tbl_user_subscriptions')
      .select('tus_user_id, tus_end_date, plan:tus_plan_id(tsp_product_code)')
      .in('tus_user_id', idChunk)
      .in('tus_status', ['active', 'upgraded'])
      .or(`tus_end_date.is.null,tus_end_date.gt.${new Date().toISOString()}`);
    if (error) throw error;
    for (const row of data || []) {
      if (String((row as any)?.plan?.tsp_product_code || '').toLowerCase() !== 'autopool_20') continue;
      const userId = String((row as any)?.tus_user_id || '').trim();
      if (userId) result.add(userId);
    }
  }

  return result;
};

const matchesPlanFilter = (row: any, planFilter: PlanFilter, autopoolUserIds: Set<string>) => {
  if (planFilter === 'all') return true;
  if (planFilter === 'autopool') return autopoolUserIds.has(String(row?.tu_id || '').trim());
  if (planFilter === 'launch') return row?.has_launch_subscription === true;
  return row?.has_launch_subscription !== true;
};

const getLaunchSubscriptionMap = async (
  supabase: ReturnType<typeof createClient>,
  userIds: string[]
) => {
  const uniqueUserIds = Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean)));
  const launchByUserId = new Map<string, any>();
  if (uniqueUserIds.length === 0) return launchByUserId;

  const userLaunchPhaseById = new Map<string, boolean>();
  for (const idChunk of chunk(uniqueUserIds, 500)) {
    const { data, error } = await supabase
      .from('tbl_users')
      .select('tu_id, tu_current_plan_phase, tu_launch_plan_activated_at')
      .in('tu_id', idChunk);
    if (error) throw error;
    for (const user of data || []) {
      const userId = String((user as any).tu_id || '').trim();
      if (!userId) continue;
      userLaunchPhaseById.set(
        userId,
        String((user as any).tu_current_plan_phase || '').toLowerCase() === 'launch' ||
          Boolean((user as any).tu_launch_plan_activated_at)
      );
    }
  }

  const subscriptions: any[] = [];
  for (const idChunk of chunk(uniqueUserIds, 500)) {
    const { data, error } = await supabase
      .from('tbl_user_subscriptions')
      .select('tus_user_id, tus_status, tus_start_date, tus_end_date, tus_payment_amount, tus_plan_phase, tus_plan_id')
      .in('tus_user_id', idChunk)
      .in('tus_status', ['active', 'upgraded']);
    if (error) throw error;
    subscriptions.push(...(data || []));
  }

  const planIds = Array.from(
    new Set(
      subscriptions
        .map((row) => String(row?.tus_plan_id || '').trim())
        .filter(Boolean)
    )
  );
  const planById = new Map<string, any>();
  for (const planChunk of chunk(planIds, 500)) {
    const { data, error } = await supabase
      .from('tbl_subscription_plans')
      .select('tsp_id, tsp_name, tsp_price, tsp_plan_phase')
      .in('tsp_id', planChunk);
    if (error) throw error;
    for (const plan of data || []) {
      planById.set(String((plan as any).tsp_id), plan);
    }
  }

  const nowMs = Date.now();
  for (const subscription of subscriptions) {
    const userId = String(subscription?.tus_user_id || '').trim();
    if (!userId) continue;

    const plan = planById.get(String(subscription?.tus_plan_id || '').trim()) || null;
    const planPhase = String(subscription?.tus_plan_phase || plan?.tsp_plan_phase || 'prelaunch').toLowerCase();
    if (planPhase !== 'launch' && userLaunchPhaseById.get(userId) !== true) continue;

    const endDate = subscription?.tus_end_date ? new Date(subscription.tus_end_date) : null;
    if (endDate && Number.isFinite(endDate.getTime()) && endDate.getTime() <= nowMs) continue;

    const existing = launchByUserId.get(userId);
    const existingStart = existing?.launch_subscription_start_date
      ? new Date(existing.launch_subscription_start_date).getTime()
      : 0;
    const currentStart = subscription?.tus_start_date
      ? new Date(subscription.tus_start_date).getTime()
      : 0;
    if (existing && existingStart > currentStart) continue;

    launchByUserId.set(userId, {
      has_launch_subscription: true,
      launch_subscription_status: subscription?.tus_status || null,
      launch_subscription_start_date: subscription?.tus_start_date || null,
      launch_subscription_end_date: subscription?.tus_end_date || null,
      launch_subscription_amount: subscription?.tus_payment_amount ?? plan?.tsp_price ?? null,
      launch_plan_name: plan?.tsp_name || null,
      launch_plan_price: plan?.tsp_price ?? null,
    });
  }

  return launchByUserId;
};

const computeMemberStatusFields = (
  row: any,
  autopoolUserIds: Set<string>,
  registrationPaid?: boolean
) => {
  const verificationComplete = meetsVerificationRules(row);
  const isEnabled = row?.tu_is_active === true;
  const hasAutopoolMembership = autopoolUserIds.has(String(row?.tu_id || '').trim());
  const isRegistrationPaid = registrationPaid ?? row?.tu_registration_paid === true;
  const isMemberActive = isEnabled && (
    hasAutopoolMembership ||
    (isRegistrationPaid && verificationComplete)
  );

  return {
    verification_complete: verificationComplete,
    has_autopool_membership: hasAutopoolMembership,
    is_active_member: isMemberActive,
  };
};

const applyLaunchSubscriptionFields = (row: any, launchMap: Map<string, any>) => {
  const launch = launchMap.get(String(row?.tu_id || '').trim());
  const hasLaunchFromUser =
    String(row?.tu_current_plan_phase || '').toLowerCase() === 'launch' ||
    Boolean(row?.tu_launch_plan_activated_at);
  const hasLaunchSubscription = launch?.has_launch_subscription === true || hasLaunchFromUser;
  return {
    ...row,
    has_launch_subscription: hasLaunchSubscription,
    launch_subscription_status: launch?.launch_subscription_status || null,
    launch_subscription_start_date: launch?.launch_subscription_start_date || row?.tu_launch_plan_activated_at || null,
    launch_subscription_end_date: launch?.launch_subscription_end_date || null,
    launch_subscription_amount: launch?.launch_subscription_amount ?? null,
    launch_plan_name: launch?.launch_plan_name || null,
    launch_plan_price: launch?.launch_plan_price ?? null,
  };
};

const mergeUserLaunchPhaseFields = async (
  supabase: ReturnType<typeof createClient>,
  rows: any[]
) => {
  const ids = Array.from(
    new Set(
      rows
        .map((row: any) => String(row?.tu_id || '').trim())
        .filter(Boolean)
    )
  );
  if (ids.length === 0) return rows;

  const phaseByUserId = new Map<string, any>();
  for (const idChunk of chunk(ids, 500)) {
    const { data, error } = await supabase
      .from('tbl_users')
      .select('tu_id, tu_current_plan_phase, tu_launch_plan_activated_at')
      .in('tu_id', idChunk);
    if (error) throw error;
    for (const user of data || []) {
      const userId = String((user as any).tu_id || '').trim();
      if (!userId) continue;
      phaseByUserId.set(userId, user);
    }
  }

  return rows.map((row: any) => {
    const phaseRow = phaseByUserId.get(String(row?.tu_id || '').trim());
    return {
      ...row,
      tu_current_plan_phase: row?.tu_current_plan_phase ?? phaseRow?.tu_current_plan_phase ?? null,
      tu_launch_plan_activated_at: row?.tu_launch_plan_activated_at ?? phaseRow?.tu_launch_plan_activated_at ?? null,
    };
  });
};

const normalizeSponsorshipKey = (value: unknown) => {
  const raw = normalizeString(value);
  if (!raw) return '';
  if (raw.toLowerCase().startsWith('sp')) {
    return raw.slice(2).trim().toLowerCase();
  }
  return raw.toLowerCase();
};

const expandSearchTerms = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const variants = [trimmed];
  if (trimmed.toLowerCase().startsWith('sp')) {
    const withoutPrefix = trimmed.slice(2).trim();
    if (withoutPrefix) variants.push(withoutPrefix);
  } else if (/^\d+$/.test(trimmed)) {
    variants.push(`SP${trimmed}`);
  }

  for (const token of trimmed.split(/\s+/)) {
    if (token && token !== trimmed) variants.push(token);
  }

  return Array.from(new Set(variants));
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
        tau_permissions,
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

    if (!adminHasPermission(admin, 'customers', 'read')) {
      return new Response(JSON.stringify({ success: false, error: 'Permission denied: customers.read' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const searchTerm = normalizeString(body.searchTerm) || null;
    const statusFilter = (normalizeString(body.statusFilter) || 'all').toLowerCase();
    const verificationFilter = (normalizeString(body.verificationFilter) || 'all').toLowerCase();
    const dummyFilterRaw = normalizeString(body.dummyFilter || body.accountScope) || 'all';
    const dummyFilter = ['all', 'real', 'dummy'].includes(dummyFilterRaw.toLowerCase())
      ? dummyFilterRaw.toLowerCase()
      : 'all';
    const planFilterRaw = (normalizeString(body.planFilter) || 'all').toLowerCase();
    const planFilter: PlanFilter = ['all', 'launch', 'no_launch', 'autopool'].includes(planFilterRaw)
      ? planFilterRaw as PlanFilter
      : 'all';
    const parentAccount = normalizeString(body.parentAccount) || null;
    const levelFilterRaw = body.levelFilter;
    const levelFilter = Number.isFinite(Number(levelFilterRaw)) && Number(levelFilterRaw) > 0
      ? Number(levelFilterRaw)
      : null;
    const offset = Math.max(0, Number.isFinite(Number(body.offset)) ? Math.floor(Number(body.offset)) : 0);
    const limit = Math.min(
      100,
      Math.max(1, Number.isFinite(Number(body.limit)) ? Math.floor(Number(body.limit)) : 10)
    );

    if (parentAccount) {
      // Downline mode: find sponsor by sponsorship number or UUID, then list descendants with levels.
      const sponsorLookupQuery = supabase
        .from('tbl_user_profiles')
        .select('tup_user_id, tup_sponsorship_number');

      const normalizedSponsorKey = parentAccount.trim();
      const sponsorQueries: Array<Promise<{ data: any; error: any }>> = [];
      if (isUuid(normalizedSponsorKey)) {
        sponsorQueries.push(sponsorLookupQuery.eq('tup_user_id', normalizedSponsorKey).maybeSingle());
      } else {
        sponsorQueries.push(sponsorLookupQuery.eq('tup_sponsorship_number', normalizedSponsorKey).maybeSingle());
        sponsorQueries.push(sponsorLookupQuery.ilike('tup_sponsorship_number', normalizedSponsorKey).maybeSingle());
        if (normalizedSponsorKey.toLowerCase().startsWith('sp')) {
          const withoutPrefix = normalizedSponsorKey.slice(2);
          if (withoutPrefix) {
            sponsorQueries.push(sponsorLookupQuery.eq('tup_sponsorship_number', withoutPrefix).maybeSingle());
            sponsorQueries.push(sponsorLookupQuery.ilike('tup_sponsorship_number', withoutPrefix).maybeSingle());
          }
        }
      }

      let sponsorProfile: any | null = null;
      let sponsorError: any | null = null;
      for (const queryPromise of sponsorQueries) {
        const result = await queryPromise;
        sponsorError = result.error || sponsorError;
        if (result.data?.tup_user_id) {
          sponsorProfile = result.data;
          sponsorError = null;
          break;
        }
      }

      if (sponsorError) {
        throw sponsorError;
      }

      // If the sponsor profile can't be resolved, still allow filtering by the provided parent account
      // (some datasets store `tup_parent_account` values that don't match any existing sponsorship row).
      const sponsorUserId = sponsorProfile?.tup_user_id ? String(sponsorProfile.tup_user_id).trim() : null;
      const sponsorSponsorshipNumber = sponsorProfile?.tup_sponsorship_number
        ? String(sponsorProfile.tup_sponsorship_number).trim()
        : null;

      // Compute downline using parent sponsorship relationships from `tbl_user_profiles`.
      // This is consistent with how the app models sponsor->child using `tup_parent_account`.
      const requestedMaxLevels = Math.max(50, (levelFilter || 0) + 10);
      const maxNodes = 10000;
      const downline: Array<{ userId: string; level: number }> = [];
      const visitedUserIds = new Set<string>();

      const initialParentsBase: string[] = [];
      if (sponsorSponsorshipNumber) initialParentsBase.push(sponsorSponsorshipNumber);
      initialParentsBase.push(normalizedSponsorKey);
      if (normalizedSponsorKey.toLowerCase().startsWith('sp')) {
        const withoutPrefix = normalizedSponsorKey.slice(2);
        if (withoutPrefix) initialParentsBase.push(withoutPrefix);
      }

      let parents: string[] = Array.from(new Set(initialParentsBase.flatMap(expandCaseVariants))).filter(Boolean);

      for (let level = 1; level <= requestedMaxLevels; level += 1) {
        if (parents.length === 0) break;

        const childProfiles: any[] = [];
        for (const parentChunk of chunk(parents, 50)) {
          const or = buildOrIlike('tup_parent_account', parentChunk);
          if (!or) continue;

          const { data: batch, error: childProfilesError } = await supabase
            .from('tbl_user_profiles')
            .select('tup_user_id, tup_sponsorship_number, tup_parent_account')
            .or(or);

          if (childProfilesError) throw childProfilesError;
          childProfiles.push(...(batch || []));
        }

        const nextParents: string[] = [];
        for (const row of childProfiles || []) {
          const childUserId = String((row as any).tup_user_id || '').trim();
          const childSponsorship = String((row as any).tup_sponsorship_number || '').trim();
          if (!childUserId || !childSponsorship) continue;
          if (sponsorUserId && childUserId === sponsorUserId) continue;
          if (visitedUserIds.has(childUserId)) continue;
          visitedUserIds.add(childUserId);
          downline.push({ userId: childUserId, level });
          nextParents.push(childSponsorship);
          if (downline.length >= maxNodes) break;
        }

        if (downline.length >= maxNodes) break;
        parents = Array.from(new Set(nextParents.flatMap(expandCaseVariants)));
      }

      const filteredByLevel = levelFilter
        ? downline.filter((n) => n.level === levelFilter)
        : downline;

      const downlineIds = Array.from(new Set(filteredByLevel.map((n) => n.userId)));
      if (downlineIds.length === 0) {
        return new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch users/profiles in chunks to avoid `.in()` limits.
      const users: any[] = [];
      for (const ids of chunk(downlineIds, 500)) {
        let usersQuery = supabase
          .from('tbl_users')
          .select('tu_id, tu_email, tu_user_type, tu_is_verified, tu_email_verified, tu_mobile_verified, tu_registration_paid, tu_is_active, tu_is_dummy, tu_current_plan_phase, tu_launch_plan_activated_at, tu_created_at, tu_updated_at')
          .in('tu_id', ids)
          .eq('tu_user_type', 'customer');

        if (verificationFilter === 'verified') {
          usersQuery = usersQuery.or('tu_email_verified.eq.true,tu_mobile_verified.eq.true');
        }
        if (verificationFilter === 'unverified') {
          usersQuery = usersQuery.eq('tu_email_verified', false).eq('tu_mobile_verified', false);
        }
        if (dummyFilter === 'real') usersQuery = usersQuery.eq('tu_is_dummy', false);
        if (dummyFilter === 'dummy') usersQuery = usersQuery.eq('tu_is_dummy', true);

        const { data: batch, error: usersError } = await usersQuery;
        if (usersError) throw usersError;
        users.push(...(batch || []));
      }

      const profiles: any[] = [];
      for (const ids of chunk(downlineIds, 500)) {
        const { data: batch, error: profilesError } = await supabase
          .from('tbl_user_profiles')
          .select('tup_id, tup_user_id, tup_first_name, tup_last_name, tup_username, tup_mobile, tup_gender, tup_sponsorship_number, tup_parent_account, tup_created_at, tup_updated_at')
          .in('tup_user_id', ids);
        if (profilesError) throw profilesError;
        profiles.push(...(batch || []));
      }

      const parentAccountKeys = Array.from(new Set(
        (profiles || [])
          .map((p: any) => normalizeString(p?.tup_parent_account))
          .filter(Boolean)
      ));

      const parentProfiles: any[] = [];
      if (parentAccountKeys.length > 0) {
        const expanded = Array.from(new Set(parentAccountKeys.flatMap(expandCaseVariants))).filter(Boolean);
        for (const keyChunk of chunk(expanded, 50)) {
          const or = buildOrIlike('tup_sponsorship_number', keyChunk);
          if (!or) continue;
          const { data: batch, error: parentError } = await supabase
            .from('tbl_user_profiles')
            .select('tup_user_id, tup_first_name, tup_last_name, tup_username, tup_sponsorship_number')
            .or(or);
          if (parentError) throw parentError;
          parentProfiles.push(...(batch || []));
        }
      }

      const parentProfileByKey = new Map<string, any>();
      for (const p of parentProfiles || []) {
        const key = normalizeSponsorshipKey((p as any).tup_sponsorship_number);
        if (!key) continue;
        if (!parentProfileByKey.has(key)) parentProfileByKey.set(key, p);
      }

      const profileMap = new Map((profiles || []).map((p: any) => [p.tup_user_id, p]));
      const levelMap = new Map(filteredByLevel.map((n) => [n.userId, n.level]));
      const launchSubscriptionByUserId = await getLaunchSubscriptionMap(
        supabase,
        (users || []).map((u: any) => u.tu_id)
      );
      const autopoolUserIds = await getAutopoolUserIds(
        supabase,
        (users || []).map((u: any) => u.tu_id)
      );

      const combined = (users || [])
        .map((u: any) => {
          const p = profileMap.get(u.tu_id) || null;
          const parentKey = normalizeSponsorshipKey(p?.tup_parent_account);
          const parentProfile = parentKey ? (parentProfileByKey.get(parentKey) || null) : null;
          const pSponsorship = String(p?.tup_sponsorship_number || '');
          const searchBlob = [
            u.tu_email,
            p?.tup_first_name,
            p?.tup_last_name,
            p?.tup_username,
            pSponsorship
          ].filter(Boolean).join(' ');

          if (!matchesCustomerSearch(searchBlob, pSponsorship, searchTerm)) return null;

          const memberStatus = computeMemberStatusFields(u, autopoolUserIds);
          const isEnabled = u.tu_is_active === true;
          const isMemberActive = memberStatus.is_active_member;
          const isPending = isEnabled && !isMemberActive;
          const isDisabled = !isEnabled;

          if (statusFilter === 'active' && !isMemberActive) return null;
          if (statusFilter === 'pending' && !isPending) return null;
          if ((statusFilter === 'disabled' || statusFilter === 'inactive') && !isDisabled) return null;

          const customer = applyLaunchSubscriptionFields({
            tu_id: u.tu_id,
            tu_email: u.tu_email,
            tu_user_type: u.tu_user_type,
            tu_is_verified: u.tu_is_verified,
            tu_email_verified: u.tu_email_verified,
            tu_mobile_verified: u.tu_mobile_verified,
            tu_registration_paid: u.tu_registration_paid ?? false,
            tu_is_active: u.tu_is_active,
            ...memberStatus,
            tu_is_dummy: !!u.tu_is_dummy,
            tu_current_plan_phase: u.tu_current_plan_phase || null,
            tu_launch_plan_activated_at: u.tu_launch_plan_activated_at || null,
            tu_created_at: u.tu_created_at,
            tu_updated_at: u.tu_updated_at,
            profile_data: p ? {
              tup_id: p.tup_id,
              tup_first_name: p.tup_first_name,
              tup_last_name: p.tup_last_name,
              tup_username: p.tup_username,
              tup_mobile: p.tup_mobile,
              tup_gender: p.tup_gender,
              tup_sponsorship_number: p.tup_sponsorship_number,
              tup_parent_account: p.tup_parent_account,
              tup_parent_name: parentProfile
                ? String(`${parentProfile.tup_first_name || ''} ${parentProfile.tup_last_name || ''}`).trim() || null
                : null,
              tup_parent_username: parentProfile?.tup_username || null,
              tup_parent_sponsorship_number: parentProfile?.tup_sponsorship_number || null,
              tup_created_at: p.tup_created_at,
              tup_updated_at: p.tup_updated_at
            } : null,
            downline_level: levelMap.get(u.tu_id) ?? null
          }, launchSubscriptionByUserId);

          return matchesPlanFilter(customer, planFilter, autopoolUserIds) ? customer : null;
        })
        .filter(Boolean) as any[];

      combined.sort((a, b) => {
        const la = Number(a.downline_level || 0);
        const lb = Number(b.downline_level || 0);
        if (la !== lb) return la - lb;
        return String(b.tu_created_at || '').localeCompare(String(a.tu_created_at || ''));
      });

      const totalCount = combined.length;
      const page = combined.slice(offset, offset + limit).map((row) => ({
        ...row,
        total_count: totalCount
      }));

      return new Response(JSON.stringify({ success: true, data: page }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (searchTerm) {
      const searchValues = expandSearchTerms(searchTerm);
      const matchedUserIds = new Set<string>();

      const { data: emailMatches, error: emailSearchError } = await supabase
        .from('tbl_users')
        .select('tu_id')
        .eq('tu_user_type', 'customer')
        .ilike('tu_email', `%${searchTerm.replace(/[%*]/g, '')}%`);
      if (emailSearchError) throw emailSearchError;
      for (const row of emailMatches || []) {
        const userId = String((row as any).tu_id || '').trim();
        if (userId) matchedUserIds.add(userId);
      }

      if (isUuid(searchTerm)) matchedUserIds.add(searchTerm);

      const profileSearchOr = buildSearchOrIlike(
        ['tup_first_name', 'tup_last_name', 'tup_username', 'tup_sponsorship_number'],
        searchValues
      );

      if (profileSearchOr) {
        const { data: profileMatches, error: profileSearchError } = await supabase
          .from('tbl_user_profiles')
          .select('tup_user_id')
          .or(profileSearchOr);
        if (profileSearchError) throw profileSearchError;
        for (const row of profileMatches || []) {
          const userId = String((row as any).tup_user_id || '').trim();
          if (userId) matchedUserIds.add(userId);
        }
      }

      const matchedIds = Array.from(matchedUserIds);
      if (matchedIds.length === 0) {
        return new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const users: any[] = [];
      for (const ids of chunk(matchedIds, 500)) {
        let usersQuery = supabase
          .from('tbl_users')
          .select('tu_id, tu_email, tu_user_type, tu_is_verified, tu_email_verified, tu_mobile_verified, tu_registration_paid, tu_is_active, tu_is_dummy, tu_current_plan_phase, tu_launch_plan_activated_at, tu_created_at, tu_updated_at')
          .in('tu_id', ids)
          .eq('tu_user_type', 'customer');

        if (verificationFilter === 'verified') {
          usersQuery = usersQuery.or('tu_email_verified.eq.true,tu_mobile_verified.eq.true');
        }
        if (verificationFilter === 'unverified') {
          usersQuery = usersQuery.eq('tu_email_verified', false).eq('tu_mobile_verified', false);
        }
        if (dummyFilter === 'real') usersQuery = usersQuery.eq('tu_is_dummy', false);
        if (dummyFilter === 'dummy') usersQuery = usersQuery.eq('tu_is_dummy', true);

        const { data: batch, error: usersError } = await usersQuery;
        if (usersError) throw usersError;
        users.push(...(batch || []));
      }

      const userIds = Array.from(new Set((users || []).map((u: any) => String(u?.tu_id || '').trim()).filter(Boolean)));
      const profiles: any[] = [];
      for (const ids of chunk(userIds, 500)) {
        const { data: batch, error: profilesError } = await supabase
          .from('tbl_user_profiles')
          .select('tup_id, tup_user_id, tup_first_name, tup_last_name, tup_username, tup_mobile, tup_gender, tup_sponsorship_number, tup_parent_account, tup_created_at, tup_updated_at')
          .in('tup_user_id', ids);
        if (profilesError) throw profilesError;
        profiles.push(...(batch || []));
      }

      const parentAccountKeys = Array.from(new Set(
        (profiles || [])
          .map((p: any) => normalizeString(p?.tup_parent_account))
          .filter(Boolean)
      ));

      const parentProfiles: any[] = [];
      if (parentAccountKeys.length > 0) {
        const expanded = Array.from(new Set(parentAccountKeys.flatMap(expandCaseVariants))).filter(Boolean);
        for (const keyChunk of chunk(expanded, 50)) {
          const or = buildOrIlike('tup_sponsorship_number', keyChunk);
          if (!or) continue;
          const { data: batch, error: parentError } = await supabase
            .from('tbl_user_profiles')
            .select('tup_user_id, tup_first_name, tup_last_name, tup_username, tup_sponsorship_number')
            .or(or);
          if (parentError) throw parentError;
          parentProfiles.push(...(batch || []));
        }
      }

      const parentProfileByKey = new Map<string, any>();
      for (const p of parentProfiles || []) {
        const key = normalizeSponsorshipKey((p as any).tup_sponsorship_number);
        if (!key) continue;
        if (!parentProfileByKey.has(key)) parentProfileByKey.set(key, p);
      }

      const profileMap = new Map((profiles || []).map((p: any) => [p.tup_user_id, p]));
      const launchSubscriptionByUserId = await getLaunchSubscriptionMap(
        supabase,
        (users || []).map((u: any) => u.tu_id)
      );
      const autopoolUserIds = await getAutopoolUserIds(
        supabase,
        (users || []).map((u: any) => u.tu_id)
      );

      const combined = (users || [])
        .map((u: any) => {
          const p = profileMap.get(u.tu_id) || null;
          const parentKey = normalizeSponsorshipKey(p?.tup_parent_account);
          const parentProfile = parentKey ? (parentProfileByKey.get(parentKey) || null) : null;
          const searchBlob = [
            u.tu_email,
            p?.tup_first_name,
            p?.tup_last_name,
            p?.tup_username,
            p?.tup_sponsorship_number,
          ].filter(Boolean).join(' ');

          if (!matchesCustomerSearch(searchBlob, p?.tup_sponsorship_number, searchTerm)) return null;

          const memberStatus = computeMemberStatusFields(u, autopoolUserIds);
          const isEnabled = u.tu_is_active === true;
          const isMemberActive = memberStatus.is_active_member;
          const isPending = isEnabled && !isMemberActive;
          const isDisabled = !isEnabled;

          if (statusFilter === 'active' && !isMemberActive) return null;
          if (statusFilter === 'pending' && !isPending) return null;
          if ((statusFilter === 'disabled' || statusFilter === 'inactive') && !isDisabled) return null;

          const customer = applyLaunchSubscriptionFields({
            tu_id: u.tu_id,
            tu_email: u.tu_email,
            tu_user_type: u.tu_user_type,
            tu_is_verified: u.tu_is_verified,
            tu_email_verified: u.tu_email_verified,
            tu_mobile_verified: u.tu_mobile_verified,
            tu_registration_paid: u.tu_registration_paid ?? false,
            tu_is_active: u.tu_is_active,
            ...memberStatus,
            tu_is_dummy: !!u.tu_is_dummy,
            tu_current_plan_phase: u.tu_current_plan_phase || null,
            tu_launch_plan_activated_at: u.tu_launch_plan_activated_at || null,
            tu_created_at: u.tu_created_at,
            tu_updated_at: u.tu_updated_at,
            profile_data: p ? {
              tup_id: p.tup_id,
              tup_first_name: p.tup_first_name,
              tup_last_name: p.tup_last_name,
              tup_username: p.tup_username,
              tup_mobile: p.tup_mobile,
              tup_gender: p.tup_gender,
              tup_sponsorship_number: p.tup_sponsorship_number,
              tup_parent_account: p.tup_parent_account,
              tup_parent_name: parentProfile
                ? String(`${parentProfile.tup_first_name || ''} ${parentProfile.tup_last_name || ''}`).trim() || null
                : null,
              tup_parent_username: parentProfile?.tup_username || null,
              tup_parent_sponsorship_number: parentProfile?.tup_sponsorship_number || null,
              tup_created_at: p.tup_created_at,
              tup_updated_at: p.tup_updated_at,
            } : null,
            downline_level: null,
          }, launchSubscriptionByUserId);

          return matchesPlanFilter(customer, planFilter, autopoolUserIds) ? customer : null;
        })
        .filter(Boolean) as any[];

      combined.sort((a, b) => String(b.tu_created_at || '').localeCompare(String(a.tu_created_at || '')));

      const totalCount = combined.length;
      const page = combined.slice(offset, offset + limit).map((row) => ({
        ...row,
        total_count: totalCount,
      }));

      return new Response(JSON.stringify({ success: true, data: page }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const baseRpcParams = {
      p_search_term: searchTerm || null,
      p_status_filter: statusFilter || 'all',
      p_verification_filter: verificationFilter || 'all',
      p_offset: offset,
      p_limit: limit,
      p_dummy_filter: dummyFilter
    };
    const { data, error } = planFilter === 'all'
      ? await supabase.rpc('admin_get_customers', baseRpcParams)
      : await supabase.rpc('admin_get_customers_filtered', {
        ...baseRpcParams,
        p_plan_filter: planFilter
      });

    if (error) {
      throw error;
    }

    // Ensure status fields are present and follow current verification settings.
    const rows = Array.isArray(data) ? data : [];
    const rowsWithUserLaunchPhase = await mergeUserLaunchPhaseFields(supabase, rows);
    const launchSubscriptionByUserId = await getLaunchSubscriptionMap(
      supabase,
      rowsWithUserLaunchPhase.map((row: any) => row?.tu_id)
    );
    const rowsWithLaunch = rowsWithUserLaunchPhase.map((row: any) => applyLaunchSubscriptionFields(row, launchSubscriptionByUserId));
    const autopoolUserIds = await getAutopoolUserIds(
      supabase,
      rowsWithLaunch.map((row: any) => row?.tu_id)
    );
    const missingRegFlag = rowsWithUserLaunchPhase.length > 0 && rowsWithUserLaunchPhase.some((row: any) => row?.tu_registration_paid === undefined);
    if (missingRegFlag) {
      const ids = Array.from(
        new Set(
          rowsWithLaunch
            .map((r: any) => String(r?.tu_id || '').trim())
            .filter(Boolean)
        )
      );
      const regMap = new Map<string, boolean>();
      for (const idChunk of chunk(ids, 500)) {
        const { data: batch, error: regError } = await supabase
          .from('tbl_users')
          .select('tu_id, tu_registration_paid')
          .in('tu_id', idChunk);
        if (regError) throw regError;
        for (const u of batch || []) {
          const uid = String((u as any).tu_id || '').trim();
          if (!uid) continue;
          regMap.set(uid, (u as any).tu_registration_paid === true);
        }
      }

      const merged = rowsWithLaunch.map((row: any) => {
        const registrationPaid = row?.tu_registration_paid ?? (regMap.get(String(row?.tu_id || '').trim()) ?? false);
        return {
          ...row,
          tu_registration_paid: registrationPaid,
          ...computeMemberStatusFields(row, autopoolUserIds, registrationPaid),
        };
      });

      return new Response(JSON.stringify({ success: true, data: merged }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedRows = rowsWithLaunch.map((row: any) => ({
      ...row,
      ...computeMemberStatusFields(row, autopoolUserIds),
    }));

    return new Response(JSON.stringify({ success: true, data: normalizedRows }), {
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
