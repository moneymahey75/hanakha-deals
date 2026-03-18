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
          plan:tus_plan_id(tsp_price, tsp_type)
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
    let commissionAmount = 0;
    let commissionPercentage: number | null = null;
    let directAccountNumber: number | null = null;
    let sponsorUserId: string | null = null;
    let sponsorSponsorshipNumber: string | null = null;

    const { data: userProfile } = await supabase
      .from('tbl_user_profiles')
      .select('tup_parent_account, tup_sponsorship_number')
      .eq('tup_user_id', payment.tp_user_id)
      .maybeSingle();

    const parentAccount = userProfile?.tup_parent_account?.trim();

    if (parentAccount) {
      const { data: sponsorProfile } = await supabase
        .from('tbl_user_profiles')
        .select('tup_user_id, tup_sponsorship_number')
        .eq('tup_sponsorship_number', parentAccount)
        .maybeSingle();

      if (sponsorProfile) {
        sponsorUserId = sponsorProfile.tup_user_id;
        sponsorSponsorshipNumber = sponsorProfile.tup_sponsorship_number;

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

    const { error: updatePaymentError } = await supabase
      .from('tbl_payments')
      .update({ tp_payment_status: 'completed' })
      .eq('tp_id', paymentId);

    if (updatePaymentError) {
      throw updatePaymentError;
    }

    const { error: updateSubscriptionError } = await supabase
      .from('tbl_user_subscriptions')
      .update({ tus_status: 'active' })
      .eq('tus_id', payment.tp_subscription_id);

    if (updateSubscriptionError) {
      throw updateSubscriptionError;
    }

    if (sponsorUserId && commissionAmount > 0) {
      const { data: sponsorWallet, error: walletError } = await supabase
        .from('tbl_user_wallets')
        .select('tuw_id, tuw_balance')
        .eq('tuw_user_id', sponsorUserId)
        .maybeSingle();

      if (walletError) {
        console.error('Failed to get sponsor wallet:', walletError);
      } else if (sponsorWallet) {
        const newBalance = parseFloat(String(sponsorWallet.tuw_balance || 0)) + commissionAmount;

        const { error: updateWalletError } = await supabase
          .from('tbl_user_wallets')
          .update({ tuw_balance: newBalance })
          .eq('tuw_id', sponsorWallet.tuw_id);

        if (updateWalletError) {
          console.error('Failed to update sponsor wallet:', updateWalletError);
        } else {
          await supabase
            .from('tbl_wallet_transactions')
            .insert({
              twt_wallet_id: sponsorWallet.tuw_id,
              twt_transaction_type: 'credit',
              twt_amount: commissionAmount,
              twt_description: `Referral commission for ${payment.user.tu_email}`,
              twt_status: 'completed',
              twt_reference_type: 'registration_payment',
              twt_reference_id: paymentId
            });
        }
      } else {
        const { data: newWallet, error: createWalletError } = await supabase
          .from('tbl_user_wallets')
          .insert({
            tuw_user_id: sponsorUserId,
            tuw_balance: commissionAmount,
            tuw_currency: 'USD'
          })
          .select()
          .single();

        if (!createWalletError && newWallet) {
          await supabase
            .from('tbl_wallet_transactions')
            .insert({
              twt_wallet_id: newWallet.tuw_id,
              twt_transaction_type: 'credit',
              twt_amount: commissionAmount,
              twt_description: `Referral commission for ${payment.user.tu_email}`,
              twt_status: 'completed',
              twt_reference_type: 'registration_payment',
              twt_reference_id: paymentId
            });
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
