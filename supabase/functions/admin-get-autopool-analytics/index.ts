import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireAdminPermission } from '../_shared/adminSession.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const sum = (rows: any[], key: string) => rows.reduce((total, row) => total + Number(row?.[key] || 0), 0);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase environment variables');
    const supabase = createClient(supabaseUrl, serviceKey);
    await requireAdminPermission(supabase, req.headers.get('X-Admin-Session'), 'mlm', 'read');

    const body = await req.json().catch(() => ({}));
    const requestedUserId = typeof body?.userId === 'string' ? body.userId : null;
    const emailSearch = String(body?.email || '').trim().toLowerCase();
    const usernameSearch = String(body?.username || '').trim().toLowerCase();
    const sponsorNumberSearch = String(body?.sponsorNumber || '').trim().toLowerCase();
    const offset = Math.max(0, Number.isFinite(Number(body?.offset)) ? Number(body.offset) : 0);
    const limit = Math.min(100, Math.max(10, Number.isFinite(Number(body?.limit)) ? Number(body.limit) : 25));

    if (requestedUserId) {
      const { data: membership, error: membershipError } = await supabase
        .from('tbl_autopool_20_memberships')
        .select('ta20_id, ta20_user_id, ta20_position, ta20_level, ta20_parent_id, ta20_ancestor_ids, ta20_created_at')
        .eq('ta20_user_id', requestedUserId)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership) return json({ success: true, data: { user: null } });
      const [userResult, profileResult, rewardsResult, directResult, descendantsResult] = await Promise.all([
        supabase.from('tbl_users').select('tu_id, tu_email, tu_is_active, tu_created_at').eq('tu_id', requestedUserId).maybeSingle(),
        supabase.from('tbl_user_profiles').select('tup_username, tup_sponsorship_number').eq('tup_user_id', requestedUserId).maybeSingle(),
        supabase.from('tbl_autopool_20_milestone_rewards').select('ta20mr_membership_id, ta20mr_level, ta20mr_required_members, ta20mr_amount, ta20mr_created_at, ta20mr_wallet_transaction_id').eq('ta20mr_membership_id', membership.ta20_id),
        supabase.from('tbl_autopool_20_direct_income').select('ta20di_amount').eq('ta20di_parent_user_id', requestedUserId).eq('ta20di_status', 'credited'),
        supabase.from('tbl_autopool_20_memberships').select('ta20_level, ta20_ancestor_ids').contains('ta20_ancestor_ids', [membership.ta20_id]),
      ]);
      if (userResult.error || profileResult.error || rewardsResult.error || directResult.error || descendantsResult.error) throw userResult.error || profileResult.error || rewardsResult.error || directResult.error || descendantsResult.error;
      const detailRewards = rewardsResult.data || [];
      const descendants = descendantsResult.data || [];
      const levels = Array.from({ length: 8 }, (_, index) => {
        const level = index + 1;
        const targetLevel = Number(membership.ta20_level || 0) + level;
        const reward = detailRewards.find((item: any) => Number(item.ta20mr_level) === level);
        return { level, members: descendants.filter((item: any) => Number(item.ta20_level) === targetLevel).length, required: Math.pow(4, level), reward: Number(reward?.ta20mr_amount || 0), earned: Boolean(reward) };
      });
      return json({ success: true, data: {
        user: { ...(userResult.data || { tu_id: requestedUserId }), ...(profileResult.data || {}) },
        membership: { ...membership, position_display: Number(membership.ta20_position) + 1 },
        levels,
        rewards: detailRewards,
        total_earned: sum(detailRewards, 'ta20mr_amount'),
        direct_earned: sum(directResult.data || [], 'ta20di_amount'),
      }});
    }

    const { data: memberships, error: membershipError } = await supabase
      .from('tbl_autopool_20_memberships')
      .select('ta20_id, ta20_user_id, ta20_position, ta20_level, ta20_parent_id, ta20_ancestor_ids, ta20_created_at')
      .order('ta20_position', { ascending: true });
    if (membershipError) throw membershipError;

    const allMemberships = memberships || [];
    const membershipIds = allMemberships.map((row: any) => row.ta20_id);
    const userIds = Array.from(new Set(allMemberships.map((row: any) => row.ta20_user_id).filter(Boolean)));

    const [rewardsResult, usersResult, profilesResult, directResult, plansResult] = await Promise.all([
      membershipIds.length
        ? supabase.from('tbl_autopool_20_milestone_rewards').select('ta20mr_membership_id, ta20mr_level, ta20mr_required_members, ta20mr_amount, ta20mr_created_at, ta20mr_wallet_transaction_id').in('ta20mr_membership_id', membershipIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase.from('tbl_users').select('tu_id, tu_email, tu_is_active, tu_created_at').in('tu_id', userIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase.from('tbl_user_profiles').select('tup_user_id, tup_username, tup_sponsorship_number').in('tup_user_id', userIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from('tbl_autopool_20_direct_income').select('ta20di_parent_user_id, ta20di_amount').eq('ta20di_status', 'credited'),
      supabase.from('tbl_subscription_plans').select('tsp_id').eq('tsp_product_code', 'autopool_20').limit(1),
    ]);
    if (rewardsResult.error) throw rewardsResult.error;
    if (usersResult.error) throw usersResult.error;
    if (profilesResult.error) throw profilesResult.error;
    if (directResult.error) throw directResult.error;
    if (plansResult.error) throw plansResult.error;

    const rewards = rewardsResult.data || [];
    const users = usersResult.data || [];
    const userById = new Map(users.map((user: any) => [user.tu_id, user]));
    const profileById = new Map((profilesResult.data || []).map((profile: any) => [profile.tup_user_id, profile]));
    const directByUser = new Map<string, number>();
    for (const income of directResult.data || []) directByUser.set(income.ta20di_parent_user_id, (directByUser.get(income.ta20di_parent_user_id) || 0) + Number(income.ta20di_amount || 0));
    const membershipById = new Map(allMemberships.map((row: any) => [row.ta20_id, row]));
    const rewardsByMembership = new Map<string, any[]>();
    for (const reward of rewards) {
      const existing = rewardsByMembership.get(reward.ta20mr_membership_id) || [];
      existing.push(reward);
      rewardsByMembership.set(reward.ta20mr_membership_id, existing);
    }

    const buildLevelProgress = (membership: any) => Array.from({ length: 8 }, (_, index) => {
      const level = index + 1;
      const targetLevel = Number(membership.ta20_level || 0) + level;
      const members = allMemberships.filter((candidate: any) =>
        Array.isArray(candidate.ta20_ancestor_ids) && candidate.ta20_ancestor_ids.includes(membership.ta20_id) && Number(candidate.ta20_level) === targetLevel
      ).length;
      const reward = (rewardsByMembership.get(membership.ta20_id) || []).find((item: any) => Number(item.ta20mr_level) === level);
      return { level, members, required: Math.pow(4, level), reward: Number(reward?.ta20mr_amount || 0), earned: Boolean(reward) };
    });

    if (requestedUserId) {
      const membership = allMemberships.find((row: any) => row.ta20_user_id === requestedUserId);
      if (!membership) return json({ success: true, data: { user: null } });
      const userRewards = rewardsByMembership.get(membership.ta20_id) || [];
      return json({ success: true, data: {
        user: userById.get(requestedUserId) || { tu_id: requestedUserId },
        membership: { ...membership, position_display: Number(membership.ta20_position) + 1 },
        levels: buildLevelProgress(membership),
        rewards: userRewards,
        total_earned: sum(userRewards, 'ta20mr_amount'),
      }});
    }

    const planId = plansResult.data?.[0]?.tsp_id;
    const autopoolSubscriptions = planId && userIds.length
      ? await supabase.from('tbl_user_subscriptions').select('tus_id, tus_user_id, tus_payment_amount, tus_status').eq('tus_plan_id', planId).in('tus_user_id', userIds)
      : { data: [], error: null };
    if (autopoolSubscriptions.error) throw autopoolSubscriptions.error;
    const subscriptionIds = (autopoolSubscriptions.data || []).map((row: any) => row.tus_id);
    const payments = subscriptionIds.length
      ? await supabase.from('tbl_payments').select('tp_amount, tp_payment_status').in('tp_subscription_id', subscriptionIds).eq('tp_payment_status', 'completed')
      : { data: [], error: null };
    if (payments.error) throw payments.error;

    const userRows = allMemberships.map((membership: any) => {
      const userRewards = rewardsByMembership.get(membership.ta20_id) || [];
      const matrixEarned = sum(userRewards, 'ta20mr_amount');
      const directEarned = directByUser.get(membership.ta20_user_id) || 0;
      return {
        user_id: membership.ta20_user_id,
        email: userById.get(membership.ta20_user_id)?.tu_email || '',
        username: profileById.get(membership.ta20_user_id)?.tup_username || '',
        sponsor_number: profileById.get(membership.ta20_user_id)?.tup_sponsorship_number || '',
        is_active: userById.get(membership.ta20_user_id)?.tu_is_active ?? null,
        position: Number(membership.ta20_position) + 1,
        matrix_level: membership.ta20_level,
        joined_at: membership.ta20_created_at,
        earned: matrixEarned + directEarned,
        matrix_earned: matrixEarned,
        direct_earned: directEarned,
        levels_earned: userRewards.length,
      };
    });
    const filteredUsers = userRows.filter((row) =>
      (!emailSearch || row.email.toLowerCase().includes(emailSearch)) &&
      (!usernameSearch || row.username.toLowerCase().includes(usernameSearch)) &&
      (!sponsorNumberSearch || String(row.sponsor_number).toLowerCase().includes(sponsorNumberSearch))
    );
    const levelSummary = Array.from({ length: 8 }, (_, index) => {
      const level = index + 1;
      const rows = rewards.filter((reward: any) => Number(reward.ta20mr_level) === level);
      return { level, rewards_count: rows.length, amount: sum(rows, 'ta20mr_amount') };
    });
    const grossCollected = sum(payments.data || [], 'tp_amount');
    const userRewardsCredited = sum(rewards, 'ta20mr_amount');
    const directIncomeCredited = sum(directResult.data || [], 'ta20di_amount');
    return json({ success: true, data: {
      summary: {
        members: allMemberships.length,
        active_members: userRows.filter((row) => row.is_active === true).length,
        gross_collected: grossCollected,
        user_rewards_credited: userRewardsCredited,
        direct_income_credited: directIncomeCredited,
        total_user_income: userRewardsCredited + directIncomeCredited,
        admin_retained_before_costs: grossCollected - userRewardsCredited - directIncomeCredited,
        reward_events: rewards.length,
        matrix_capacity: 87380,
      },
      level_summary: levelSummary,
      total_users: filteredUsers.length,
      users: filteredUsers.slice(offset, offset + limit),
      offset,
      limit,
    }});
  } catch (error: any) {
    console.error('AutoPool analytics error', error);
    return json({ success: false, error: error?.message || 'Unable to load AutoPool analytics' }, 500);
  }
});
