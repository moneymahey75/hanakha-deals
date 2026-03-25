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
        JSON.stringify({ success: false, error: 'Only registration payments can process referral commissions' }),
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
    let commissionAmount = 0;
    let commissionPercentage: number | null = null;
    let directAccountNumber: number | null = null;
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
        .select('tup_user_id, tup_sponsorship_number, tup_username')
        .eq('tup_sponsorship_number', parentAccount)
        .maybeSingle();

      if (sponsorProfile) {
        sponsorUserId = sponsorProfile.tup_user_id;
        sponsorSponsorshipNumber = sponsorProfile.tup_sponsorship_number;
        isDefaultParent =
          sponsorProfile.tup_sponsorship_number === 'SP5433235' &&
          sponsorProfile.tup_username === 'default_parent';

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

        if (!isDefaultParent) {
          const { count } = await supabase
            .from('tbl_user_profiles')
            .select('tup_user_id', { count: 'exact', head: true })
            .eq('tup_parent_account', sponsorSponsorshipNumber);

          directAccountNumber = typeof count === 'number' ? count : null;

          if (directAccountNumber) {
            const { data: rule } = await supabase
              .from('earning_distribution_settings')
              .select('*')
              .eq('is_active', true)
              .lte('direct_account_range_start', directAccountNumber)
              .gte('direct_account_range_end', directAccountNumber)
              .order('direct_account_range_start', { ascending: true })
              .limit(1)
              .maybeSingle();

            if (rule?.direct_referrer_percentage !== null && rule?.direct_referrer_percentage !== undefined) {
              commissionPercentage = Number(rule.direct_referrer_percentage);
              if (Number.isFinite(commissionPercentage)) {
                commissionAmount = Number(((paymentAmount * commissionPercentage) / 100).toFixed(2));
              } else {
                commissionPercentage = null;
              }
            }
          }
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

    if (!isDefaultParent && sponsorUserId && normalizedParentIncome > 0) {
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

    if (sponsorUserId && (commissionAmount > 0 || parentIncomeApplied > 0)) {
      const { data: sponsorWallet, error: walletError } = await supabase
        .from('tbl_wallets')
        .select('tw_id, tw_balance')
        .eq('tw_user_id', sponsorUserId)
        .maybeSingle();

      if (walletError) {
        console.error('Failed to get sponsor wallet:', walletError);
      } else {
        let walletId = sponsorWallet?.tw_id || null;
        let baseBalance = parseFloat(String(sponsorWallet?.tw_balance || 0));

        if (!walletId) {
          const { data: newWallet, error: createWalletError } = await supabase
            .from('tbl_wallets')
            .insert({
              tw_user_id: sponsorUserId,
              tw_balance: 0,
              tw_currency: 'USD'
            })
            .select()
            .single();

          if (!createWalletError && newWallet) {
            walletId = newWallet.tw_id;
            baseBalance = 0;
          } else {
            console.error('Failed to create sponsor wallet:', createWalletError);
            walletId = null;
          }
        }

        const insertWalletTxIfMissing = async (
          referenceType: 'registration_parent_income' | 'registration_payment',
          amount: number,
          description: string
        ) => {
          if (!walletId || amount <= 0) return 0;

          const { count, error: countError } = await supabase
            .from('tbl_wallet_transactions')
            .select('twt_id', { count: 'exact', head: true })
            .eq('twt_reference_id', paymentId)
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
              twt_wallet_id: walletId,
              twt_user_id: sponsorUserId,
              twt_transaction_type: 'credit',
              twt_amount: amount,
              twt_description: description,
              twt_status: 'completed',
              twt_reference_type: referenceType,
              twt_reference_id: paymentId
            });

          if (insertError) {
            console.error('Failed to insert wallet transaction:', insertError);
            return 0;
          }

          return amount;
        };

        if (walletId) {
          let totalInserted = 0;

          if (parentIncomeApplied > 0) {
            totalInserted += await insertWalletTxIfMissing(
              'registration_parent_income',
              parentIncomeApplied,
              `Registration commission from ${childSponsorshipNumber || 'unknown account'}`
            );
          }

          if (commissionAmount > 0) {
            totalInserted += await insertWalletTxIfMissing(
              'registration_payment',
              commissionAmount,
              `Referral commission for ${childSponsorshipNumber || 'unknown account'}`
            );
          }

          if (totalInserted > 0) {
            const newBalance = baseBalance + totalInserted;
            const { error: updateWalletError } = await supabase
              .from('tbl_wallets')
              .update({ tw_balance: newBalance })
              .eq('tw_id', walletId);

            if (updateWalletError) {
              console.error('Failed to update sponsor wallet:', updateWalletError);
            }
          }
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
          commission_paid: commissionAmount,
          commission_percentage: commissionPercentage,
          parent_income: parentIncomeApplied,
          admin_income: adminNetAmount,
          direct_account_number: directAccountNumber,
          sponsor_user_id: sponsorUserId,
          sponsor_sponsorship_number: sponsorSponsorshipNumber,
          timestamp: new Date().toISOString(),
        },
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment processed successfully',
        commission_paid: commissionAmount,
        commission_percentage: commissionPercentage,
        direct_account_number: directAccountNumber
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
