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
      status,
      isActive,
      launchDate,
      launchNow,
      websiteUrl
    } = await req.json();

    if (!companyId || !title || !couponCode) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (id) {
      const { error } = await supabase
        .from('tbl_coupons')
        .update({
          tc_company_id: companyId,
          tc_title: title,
          tc_description: description,
          tc_coupon_code: couponCode,
          tc_discount_type: discountType,
          tc_discount_value: discountValue,
          tc_image_url: imageUrl,
          tc_terms_conditions: termsConditions,
          tc_valid_from: validFrom,
          tc_valid_until: validUntil,
          tc_usage_limit: usageLimit,
          tc_share_reward_amount: shareRewardAmount,
          tc_status: status,
          tc_is_active: isActive,
          tc_launch_date: launchDate,
          tc_launch_now: launchNow,
          tc_website_url: websiteUrl
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
          tc_created_by_admin_uid: null,
          tc_company_id: companyId,
          tc_title: title,
          tc_description: description,
          tc_coupon_code: couponCode,
          tc_discount_type: discountType,
          tc_discount_value: discountValue,
          tc_image_url: imageUrl,
          tc_terms_conditions: termsConditions,
          tc_valid_from: validFrom,
          tc_valid_until: validUntil,
          tc_usage_limit: usageLimit,
          tc_share_reward_amount: shareRewardAmount,
          tc_status: status,
          tc_is_active: isActive,
          tc_launch_date: launchDate,
          tc_launch_now: launchNow,
          tc_website_url: websiteUrl
        });

      if (error) {
        throw error;
      }
    }

    await logAdminAction(supabase, admin.tau_id, id ? 'update_coupon' : 'create_coupon', 'coupons', {
      coupon_id: id || null,
      company_id: companyId,
      title,
      status,
      is_active: isActive
    });

    return new Response(JSON.stringify({ success: true, data: { id: id || null } }), {
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
