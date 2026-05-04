import { createClient } from 'jsr:@supabase/supabase-js@2';
import { logAdminAction, requireAdminSession } from '../_shared/adminSession.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
};

type MilestoneRow = {
  tmm_id: string;
  tmm_title: string;
  tmm_level1_required: number;
  tmm_level2_required: number;
  tmm_level3_required: number;
  tmm_reward_amount: number;
};

const ensureWalletForUser = async (
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<{ walletId: string; baseBalance: number; baseReservedBalance: number } | null> => {
  const { data: existingWallet, error: walletError } = await supabase
    .from('tbl_wallets')
    .select('tw_id, tw_balance, tw_reserved_balance')
    .eq('tw_user_id', userId)
    .eq('tw_currency', 'USDT')
    .eq('tw_wallet_type', 'working')
    .maybeSingle();

  if (walletError) {
    console.error('Failed to fetch wallet:', walletError);
    return null;
  }

  if (existingWallet?.tw_id) {
    return {
      walletId: String(existingWallet.tw_id),
      baseBalance: Number(existingWallet.tw_balance || 0),
      baseReservedBalance: Number(existingWallet.tw_reserved_balance || 0)
    };
  }

  const newWalletId = crypto.randomUUID();
  const { error: createError } = await supabase.from('tbl_wallets').insert({
    tw_id: newWalletId,
    tw_user_id: userId,
    tw_balance: 0,
    tw_reserved_balance: 0,
    tw_currency: 'USDT',
    tw_wallet_type: 'working',
    tw_is_active: true,
    tw_created_at: new Date().toISOString(),
    tw_updated_at: new Date().toISOString(),
  });

  if (createError) {
    console.error('Failed to create wallet:', createError);
    return null;
  }

  return { walletId: newWalletId, baseBalance: 0, baseReservedBalance: 0 };
};

const hasActiveUpgrade = async (
  supabase: ReturnType<typeof createClient>,
  userId: string
) => {
  const now = new Date();
  const { data: subs, error } = await supabase
    .from('tbl_user_subscriptions')
    .select('tus_end_date, tus_status, plan:tus_plan_id(tsp_type)')
    .eq('tus_user_id', userId)
    .eq('tus_status', 'active')
    .limit(50);

  if (error) {
    console.error('Failed to load user subscriptions:', error);
    return false;
  }

  return (subs || []).some((row: any) => {
    const planType = String(row?.plan?.tsp_type || '').toLowerCase();
    if (planType !== 'upgrade') return false;
    const endDate = row?.tus_end_date ? new Date(String(row.tus_end_date)) : null;
    if (!endDate) return true;
    return endDate.getTime() > now.getTime();
  });
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

    const body = await req.json().catch(() => ({}));
    const sponsorshipNumber = String(body?.sponsorshipNumber || '').trim();
    const dryRun = Boolean(body?.dryRun);

    if (!sponsorshipNumber) {
      return new Response(JSON.stringify({ success: false, error: 'Missing sponsorshipNumber' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: countsRow, error: countsError } = await supabase
      .rpc('upsert_mlm_level_counts', { p_sponsorship_number: sponsorshipNumber })
      .maybeSingle();

    if (countsError) {
      throw new Error(countsError.message || 'Failed to recompute MLM level counts');
    }

    const userId = String(countsRow?.user_id || '').trim();
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'Sponsor not found for sponsorship number' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const level1Count = Number(countsRow?.level1_count || 0);
    const level2Count = Number(countsRow?.level2_count || 0);
    const level3Count = Number(countsRow?.level3_count || 0);

    const { data: milestonesData, error: milestonesError } = await supabase
      .from('tbl_mlm_reward_milestones')
      .select('tmm_id, tmm_title, tmm_level1_required, tmm_level2_required, tmm_level3_required, tmm_reward_amount, tmm_is_active')
      .eq('tmm_is_active', true)
      .order('tmm_reward_amount', { ascending: true });

    if (milestonesError) {
      throw new Error(milestonesError.message || 'Failed to load MLM reward milestones');
    }

    const milestones = ((milestonesData || []) as any[])
      .map((row) => ({
        tmm_id: String(row.tmm_id),
        tmm_title: String(row.tmm_title),
        tmm_level1_required: Number(row.tmm_level1_required || 0),
        tmm_level2_required: Number(row.tmm_level2_required || 0),
        tmm_level3_required: Number(row.tmm_level3_required || 0),
        tmm_reward_amount: Number(row.tmm_reward_amount || 0),
      }))
      .filter((row): row is MilestoneRow => Boolean(row.tmm_id));

    const eligibleMilestones = milestones.filter(
      (m) =>
        level1Count >= m.tmm_level1_required &&
        level2Count >= m.tmm_level2_required &&
        level3Count >= m.tmm_level3_required &&
        m.tmm_reward_amount > 0
    );

    const walletInfo = await ensureWalletForUser(supabase, userId);
    if (!walletInfo) {
      throw new Error('Failed to ensure wallet for user');
    }

    const inserted: Array<{ milestoneId: string; title: string; amount: number }> = [];
    const skipped: Array<{ milestoneId: string; title: string; reason: string }> = [];
    let totalInserted = 0;
    let totalReservedInserted = 0;
    const upgraded = await hasActiveUpgrade(supabase, userId);

    for (const milestone of eligibleMilestones) {
      const referenceId = milestone.tmm_id;
      const { count, error: countError } = await supabase
        .from('tbl_wallet_transactions')
        .select('twt_id', { count: 'exact', head: true })
        .eq('twt_user_id', userId)
        .eq('twt_reference_type', 'mlm_level_reward')
        .eq('twt_reference_id', referenceId);

      if (countError) {
        console.error('Failed to check existing wallet transaction:', countError);
        skipped.push({ milestoneId: referenceId, title: milestone.tmm_title, reason: 'check_failed' });
        continue;
      }

      if (count && count > 0) {
        skipped.push({ milestoneId: referenceId, title: milestone.tmm_title, reason: 'already_paid' });
        continue;
      }

      if (dryRun) {
        inserted.push({ milestoneId: referenceId, title: milestone.tmm_title, amount: milestone.tmm_reward_amount });
        totalInserted += milestone.tmm_reward_amount;
        if (!upgraded) {
          totalReservedInserted += Number((milestone.tmm_reward_amount * 0.5).toFixed(6));
        }
        continue;
      }

      const availableReward = upgraded
        ? milestone.tmm_reward_amount
        : Number((milestone.tmm_reward_amount * 0.5).toFixed(6));
      const reservedReward = Number((milestone.tmm_reward_amount - availableReward).toFixed(6));

      const { error: insertError } = await supabase.from('tbl_wallet_transactions').insert({
        twt_wallet_id: walletInfo.walletId,
        twt_user_id: userId,
        twt_transaction_type: 'credit',
        twt_amount: availableReward,
        twt_description: milestone.tmm_title,
        twt_status: 'completed',
        twt_reference_type: 'mlm_level_reward',
        twt_reference_id: referenceId,
      });

      if (insertError) {
        console.error('Failed to insert wallet transaction:', insertError);
        skipped.push({ milestoneId: referenceId, title: milestone.tmm_title, reason: 'insert_failed' });
        continue;
      }

      if (reservedReward > 0) {
        const { error: reservedInsertError } = await supabase.from('tbl_wallet_transactions').insert({
          twt_wallet_id: walletInfo.walletId,
          twt_user_id: userId,
          twt_transaction_type: 'credit',
          twt_amount: reservedReward,
          twt_description: `Reserved from ${milestone.tmm_title} (for future upgrade)`,
          twt_status: 'completed',
          twt_reference_type: 'mlm_level_reward_reserved',
          twt_reference_id: referenceId,
        });

        if (reservedInsertError) {
          console.error('Failed to insert reserved wallet transaction:', reservedInsertError);
          skipped.push({ milestoneId: referenceId, title: milestone.tmm_title, reason: 'reserved_insert_failed' });
          continue;
        }
      }

      inserted.push({ milestoneId: referenceId, title: milestone.tmm_title, amount: milestone.tmm_reward_amount });
      totalInserted += milestone.tmm_reward_amount;
      totalReservedInserted += reservedReward;
    }

    if (!dryRun && totalInserted > 0) {
      const newBalance = walletInfo.baseBalance + totalInserted;
      const newReservedBalance = walletInfo.baseReservedBalance + totalReservedInserted;
      const { error: updateError } = await supabase
        .from('tbl_wallets')
        .update({
          tw_balance: newBalance,
          tw_reserved_balance: newReservedBalance,
          tw_updated_at: new Date().toISOString()
        })
        .eq('tw_id', walletInfo.walletId);

      if (updateError) {
        console.error('Failed to update wallet balance:', updateError);
      }
    }

    await logAdminAction(supabase, admin.tau_id, 'award_mlm_milestone_rewards', 'earning_distribution', {
      sponsorship_number: sponsorshipNumber,
      user_id: userId,
      dry_run: dryRun,
      level1_count: level1Count,
      level2_count: level2Count,
      level3_count: level3Count,
      inserted_count: inserted.length,
      inserted_amount: totalInserted,
      skipped_count: skipped.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          sponsorshipNumber,
          userId,
          dryRun,
          counts: { level1: level1Count, level2: level2Count, level3: level3Count },
          eligibleMilestones: eligibleMilestones.map((m) => ({
            milestoneId: m.tmm_id,
            title: m.tmm_title,
            amount: m.tmm_reward_amount,
          })),
          inserted,
          skipped,
          insertedAmount: totalInserted,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
