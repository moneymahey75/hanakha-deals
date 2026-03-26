import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
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
      return new Response(
        JSON.stringify({ success: false, error: 'Missing admin session token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: adminUser, error: adminError } = await supabase
      .from('tbl_admin_users')
      .select('tau_id, tau_email, tau_role, tau_is_active')
      .eq('tau_session_token', adminSessionToken)
      .eq('tau_is_active', true)
      .maybeSingle();

    if (adminError || !adminUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid admin session' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { paymentId } = await req.json();

    if (!paymentId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing payment ID' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: payment, error: paymentError } = await supabase
      .from('tbl_payments')
      .select(`
        *,
        user:tp_user_id(tu_id, tu_email),
        subscription:tp_subscription_id(
          tus_id,
          plan:tus_plan_id(tsp_price, tsp_type, tsp_parent_income)
        )
      `)
      .eq('tp_id', paymentId)
      .single();

    if (paymentError || !payment) {
      return new Response(
        JSON.stringify({ success: false, error: 'Payment not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (payment.tp_payment_status !== 'pending') {
      return new Response(
        JSON.stringify({ success: false, error: 'Payment already processed' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (payment.subscription?.plan?.tsp_type !== 'registration') {
      return new Response(
        JSON.stringify({ success: false, error: 'Only registration payments can process referral earnings' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const paymentAmount = Number(payment.tp_amount ?? payment.subscription?.plan?.tsp_price ?? 0);
    const parentIncomeSetting = Number(payment.subscription?.plan?.tsp_parent_income ?? 0);
    const normalizedParentIncome = Number.isFinite(parentIncomeSetting) && parentIncomeSetting > 0
      ? parentIncomeSetting
      : 0;
    let parentIncomeApplied = 0;
    let adminNetAmount = paymentAmount;
    let sponsorUserId: string | null = null;
    let sponsorSponsorshipNumber: string | null = null;
    let isDefaultParent = false;

    const { data: userProfile } = await supabase
      .from('tbl_user_profiles')
      .select('tup_parent_account, tup_sponsorship_number')
      .eq('tup_user_id', payment.tp_user_id)
      .maybeSingle();

    const parentAccount = userProfile?.tup_parent_account?.trim();
    const childSponsorshipNumber = userProfile?.tup_sponsorship_number?.trim();

    if (parentAccount) {
      const { data: sponsorProfile } = await supabase
        .from('tbl_user_profiles')
        .select('tup_user_id, tup_sponsorship_number, tup_username, tup_is_default_parent')
        .eq('tup_sponsorship_number', parentAccount)
        .maybeSingle();

      if (sponsorProfile) {
        sponsorUserId = sponsorProfile.tup_user_id;
        sponsorSponsorshipNumber = sponsorProfile.tup_sponsorship_number;
        isDefaultParent = sponsorProfile.tup_is_default_parent === true;

        const { data: sponsorUser } = await supabase
          .from('tbl_users')
          .select('tu_is_active, tu_registration_paid')
          .eq('tu_id', sponsorUserId)
          .maybeSingle();

        if (!sponsorUser?.tu_is_active || !sponsorUser?.tu_registration_paid) {
          return new Response(
            JSON.stringify({ success: false, error: 'Parent A/C is not active or registration-paid' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

      }
    }

    const { error: updateSubscriptionError } = await supabase
      .from('tbl_user_subscriptions')
      .update({ tus_status: 'active' })
      .eq('tus_id', payment.tp_subscription_id);

    if (updateSubscriptionError) {
      throw updateSubscriptionError;
    }

    if (sponsorUserId && normalizedParentIncome > 0) {
      parentIncomeApplied = Math.min(normalizedParentIncome, paymentAmount);
      adminNetAmount = Math.max(0, paymentAmount - parentIncomeApplied);
    }

    const { error: updatePaymentError } = await supabase
      .from('tbl_payments')
      .update({
        tp_payment_status: 'completed',
        tp_verified_at: new Date().toISOString(),
        tp_gateway_response: {
          ...(payment.tp_gateway_response || {}),
          gross_amount: paymentAmount,
          parent_income: parentIncomeApplied,
          admin_income: adminNetAmount,
          commission_amount: 0,
          commission_percentage: null,
          direct_account_number: null,
          is_default_parent: isDefaultParent,
          parent_account: parentAccount || null,
          parent_user_id: sponsorUserId || null
        }
      })
      .eq('tp_id', paymentId);

    if (updatePaymentError) {
      throw updatePaymentError;
    }

    await supabase
      .from('tbl_users')
      .update({
        tu_registration_paid: true,
        tu_registration_paid_at: new Date().toISOString()
      })
      .eq('tu_id', payment.tp_user_id);

    if (sponsorUserId) {
        const walletCache = new Map<string, { walletId: string; baseBalance: number; totalInserted: number }>();

        const ensureWalletForUser = async (userId: string) => {
          const cached = walletCache.get(userId);
          if (cached) return cached;

          const { data: existingWallet, error: existingError } = await supabase
            .from('tbl_wallets')
            .select('tw_id, tw_balance')
            .eq('tw_user_id', userId)
            .maybeSingle();

          if (existingError) {
            console.error('Failed to load wallet:', existingError);
            return null;
          }

          let resolvedWalletId = existingWallet?.tw_id || null;
          let resolvedBalance = parseFloat(String(existingWallet?.tw_balance || 0));

          if (!resolvedWalletId) {
            const { data: createdWallet, error: createError } = await supabase
              .from('tbl_wallets')
              .insert({
                tw_user_id: userId,
                tw_balance: 0,
                tw_currency: 'USDT'
              })
              .select()
              .single();

            if (createError) {
              console.error('Failed to create wallet:', createError);
              return null;
            }

            resolvedWalletId = createdWallet?.tw_id || null;
            resolvedBalance = 0;
          }

          if (!resolvedWalletId) return null;

          const entry = { walletId: resolvedWalletId, baseBalance: resolvedBalance, totalInserted: 0 };
          walletCache.set(userId, entry);
          return entry;
        };

        const insertWalletTxIfMissing = async (
          userId: string,
          referenceType: 'registration_parent_income' | 'mlm_level_reward',
          amount: number,
          description: string,
          referenceId: string
        ) => {
          if (amount <= 0) return 0;

          const walletInfo = await ensureWalletForUser(userId);
          if (!walletInfo) return 0;

          const { count, error: countError } = await supabase
            .from('tbl_wallet_transactions')
            .select('twt_id', { count: 'exact', head: true })
            .eq('twt_reference_id', referenceId)
            .eq('twt_reference_type', referenceType);

          if (countError) {
            console.error('Failed to check existing wallet transaction:', countError);
            return 0;
          }

          if (count && count > 0) {
            return 0;
          }

          const { error: insertError } = await supabase
            .from('tbl_wallet_transactions')
            .insert({
              twt_wallet_id: walletInfo.walletId,
              twt_user_id: userId,
              twt_transaction_type: 'credit',
              twt_amount: amount,
              twt_description: description,
              twt_status: 'completed',
              twt_reference_type: referenceType,
              twt_reference_id: referenceId
            });

          if (insertError) {
            console.error('Failed to insert wallet transaction:', insertError);
            return 0;
          }

          walletInfo.totalInserted += amount;
          return amount;
        };

        if (parentIncomeApplied > 0 && sponsorUserId) {
          await insertWalletTxIfMissing(
            sponsorUserId,
            'registration_parent_income',
            parentIncomeApplied,
            `Registration commission from ${childSponsorshipNumber || 'unknown account'}`,
            paymentId
          );
        }

        if (childSponsorshipNumber) {
          const { data: milestonesData, error: milestonesError } = await supabase
            .from('tbl_mlm_reward_milestones')
            .select('tmm_id, tmm_title, tmm_level1_required, tmm_level2_required, tmm_level3_required, tmm_reward_amount, tmm_is_active')
            .eq('tmm_is_active', true)
            .order('tmm_reward_amount', { ascending: true });

          if (milestonesError) {
            console.error('Failed to load MLM reward milestones:', milestonesError);
          }

          const milestones = (milestonesData && milestonesData.length > 0)
            ? milestonesData.map((row) => ({
              id: String(row.tmm_id),
              title: String(row.tmm_title),
              level1: Number(row.tmm_level1_required || 0),
              level2: Number(row.tmm_level2_required || 0),
              level3: Number(row.tmm_level3_required || 0),
              amount: Number(row.tmm_reward_amount || 0)
            }))
            : [];

          if (milestones.length === 0) {
            console.warn('No active MLM reward milestones configured');
          }

          const { data: uplines, error: uplinesError } = await supabase
            .rpc('get_upline_sponsorships', {
              p_child_sponsorship: childSponsorshipNumber,
              p_max_levels: 3
            });

          if (uplinesError) {
            console.error('Failed to load upline sponsors:', uplinesError);
          } else if (milestones.length > 0) {
            for (const upline of uplines || []) {
              const sponsorshipNumber = String(upline.sponsorship_number || '').trim();
              const uplineUserId = String(upline.user_id || '').trim();
              if (!sponsorshipNumber || !uplineUserId) continue;

              const { data: countsRow, error: countsError } = await supabase
                .rpc('upsert_mlm_level_counts', { p_sponsorship_number: sponsorshipNumber })
                .maybeSingle();

              if (countsError) {
                console.error('Failed to update MLM level counts:', countsError);
                continue;
              }

              const level1Count = Number(countsRow?.level1_count || 0);
              const level2Count = Number(countsRow?.level2_count || 0);
              const level3Count = Number(countsRow?.level3_count || 0);

              for (const milestone of milestones) {
                if (
                  level1Count >= milestone.level1 &&
                  level2Count >= milestone.level2 &&
                  level3Count >= milestone.level3
                ) {
                  await insertWalletTxIfMissing(
                    uplineUserId,
                    'mlm_level_reward',
                    milestone.amount,
                    milestone.title,
                    milestone.id
                  );
                }
              }
            }
          }
        }

        for (const [userId, walletInfo] of walletCache.entries()) {
          if (walletInfo.totalInserted <= 0) continue;
          const newBalance = walletInfo.baseBalance + walletInfo.totalInserted;
          const { error: updateWalletError } = await supabase
            .from('tbl_wallets')
            .update({ tw_balance: newBalance })
            .eq('tw_id', walletInfo.walletId);

          if (updateWalletError) {
            console.error('Failed to update sponsor wallet:', updateWalletError);
          }
        }
    }

    await supabase
      .from('tbl_admin_activity_logs')
      .insert({
        taal_admin_id: adminUser.tau_id,
        taal_action: 'approve_registration_payment',
        taal_module: 'payment_management',
        taal_details: {
          payment_id: paymentId,
          user_email: payment.user.tu_email,
          amount: payment.tp_amount,
          commission_paid: 0,
          commission_percentage: null,
          parent_income: parentIncomeApplied,
          admin_income: adminNetAmount,
          direct_account_number: null,
          sponsor_user_id: sponsorUserId,
          sponsor_sponsorship_number: sponsorSponsorshipNumber,
          timestamp: new Date().toISOString(),
        },
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment processed successfully',
        commission_paid: 0,
        commission_percentage: null,
        direct_account_number: null,
        parent_income: parentIncomeApplied
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    console.error('Error processing registration payment:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
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
