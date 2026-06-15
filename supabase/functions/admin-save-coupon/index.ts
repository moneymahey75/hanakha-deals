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
        tau_auth_uid,
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

const getErrorStatus = (message: string) => {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('daily launched coupon rewards') ||
    normalized.includes('configure at least one active launch plan') ||
    normalized.includes('missing required fields')
  ) {
    return 400;
  }
  return 500;
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

    const {
      id,
      companyId,
      title,
      description,
      couponCode,
      discountType,
      discountValue,
      imageUrl,
      termsConditions,
      validFrom,
      validUntil,
      usageLimit,
      shareRewardAmount,
      rewardPercentage,
      status,
      isActive,
      launchDate,
      launchNow,
      dailyStartTime,
      dailyEndTime,
      websiteUrl,
      revealTimerSeconds,
      feedbackEnabled,
      feedbackSamples
    } = await req.json();

    if (!title) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedCompanyId = companyId || null;
    const normalizedCouponCode = couponCode || null;
    const normalizedDiscountType = discountType || null;
    const normalizedDiscountValue = discountValue ?? null;
    const normalizedUsageLimit = usageLimit ?? 1000;
    const normalizedWebsiteUrl = websiteUrl || null;
    const normalizedImageUrl = imageUrl || null;
    const normalizedTermsConditions = termsConditions || null;
    const normalizedDescription = description || null;
    const normalizedLaunchDate = launchDate || null;
    const normalizedDailyStartTime = String(dailyStartTime || '00:00').trim();
    const normalizedDailyEndTime = String(dailyEndTime || '23:59').trim();
    const normalizedRevealTimerSeconds = Math.max(0, Math.min(86400, Number(revealTimerSeconds ?? 30) || 0));
    const normalizedFeedbackEnabled = feedbackEnabled === true;
    const normalizedFeedbackSamples = Array.isArray(feedbackSamples)
      ? feedbackSamples
          .map((sample) => String(sample || '').trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];
    const parsedRewardPercentage =
      rewardPercentage === null || rewardPercentage === undefined || rewardPercentage === ''
        ? null
        : Math.max(0, Math.min(1, Number(rewardPercentage) || 0));
    const normalizedRewardPercentage =
      parsedRewardPercentage && parsedRewardPercentage > 0 ? parsedRewardPercentage : null;
    const normalizedShareRewardAmount = Math.max(0, Number(shareRewardAmount ?? 0) || 0);

    const timePattern = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
    if (!timePattern.test(normalizedDailyStartTime) || !timePattern.test(normalizedDailyEndTime)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Set a valid daily coupon start and end time'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (normalizedDailyStartTime >= normalizedDailyEndTime) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Daily coupon end time must be after start time'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (launchNow && normalizedLaunchDate && !normalizedRewardPercentage && normalizedShareRewardAmount <= 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Set a daily reward percentage before launching this coupon'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (id) {
      const { error } = await supabase
        .from('tbl_coupons')
        .update({
          tc_company_id: normalizedCompanyId,
          tc_created_by_admin_uid: normalizedCompanyId ? null : (admin.tau_auth_uid || null),
          tc_title: title,
          tc_description: normalizedDescription,
          tc_coupon_code: normalizedCouponCode,
          tc_discount_type: normalizedDiscountType,
          tc_discount_value: normalizedDiscountValue,
          tc_image_url: normalizedImageUrl,
          tc_terms_conditions: normalizedTermsConditions,
          tc_valid_from: validFrom,
          tc_valid_until: validUntil,
          tc_usage_limit: normalizedUsageLimit,
          tc_share_reward_amount: normalizedShareRewardAmount,
          tc_reward_percentage: normalizedRewardPercentage,
          tc_status: status,
          tc_is_active: isActive,
          tc_launch_date: normalizedLaunchDate,
          tc_launch_now: launchNow,
          tc_daily_start_time: normalizedDailyStartTime,
          tc_daily_end_time: normalizedDailyEndTime,
          tc_website_url: normalizedWebsiteUrl,
          tc_reveal_timer_seconds: normalizedRevealTimerSeconds,
          tc_feedback_enabled: normalizedFeedbackEnabled,
          tc_feedback_samples: normalizedFeedbackSamples
        })
        .eq('tc_id', id);

      if (error) {
        throw error;
      }
    } else {
      const { error } = await supabase
        .from('tbl_coupons')
        .insert({
          tc_created_by: null,
          tc_created_by_admin_uid: admin.tau_auth_uid || null,
          tc_company_id: normalizedCompanyId,
          tc_title: title,
          tc_description: normalizedDescription,
          tc_coupon_code: normalizedCouponCode,
          tc_discount_type: normalizedDiscountType,
          tc_discount_value: normalizedDiscountValue,
          tc_image_url: normalizedImageUrl,
          tc_terms_conditions: normalizedTermsConditions,
          tc_valid_from: validFrom,
          tc_valid_until: validUntil,
          tc_usage_limit: normalizedUsageLimit,
          tc_share_reward_amount: normalizedShareRewardAmount,
          tc_reward_percentage: normalizedRewardPercentage,
          tc_status: status,
          tc_is_active: isActive,
          tc_launch_date: normalizedLaunchDate,
          tc_launch_now: launchNow,
          tc_daily_start_time: normalizedDailyStartTime,
          tc_daily_end_time: normalizedDailyEndTime,
          tc_website_url: normalizedWebsiteUrl,
          tc_reveal_timer_seconds: normalizedRevealTimerSeconds,
          tc_feedback_enabled: normalizedFeedbackEnabled,
          tc_feedback_samples: normalizedFeedbackSamples
        });

      if (error) {
        throw error;
      }
    }

    await logAdminAction(supabase, admin.tau_id, id ? 'update_coupon' : 'create_coupon', 'coupons', {
      coupon_id: id || null,
      company_id: normalizedCompanyId,
      title,
      status,
      is_active: isActive
    });

    return new Response(JSON.stringify({ success: true, data: { id: id || null } }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    const message = error?.message || 'Failed';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: getErrorStatus(message),
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
