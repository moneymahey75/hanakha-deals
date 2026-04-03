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
      userEmail,
      password,
      companyName,
      brandName,
      businessType,
      businessCategory,
      registrationNumber,
      gstin,
      websiteUrl,
      officialEmail,
      affiliateCode,
      verificationStatus
    } = await req.json();

    if (!userEmail || !password || !companyName || !registrationNumber || !gstin || !officialEmail) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: adminAuthData, error: adminAuthError } = await supabase.auth.admin.createUser({
      email: String(userEmail).trim(),
      password: String(password),
      email_confirm: true
    });

    if (adminAuthError || !adminAuthData?.user) {
      throw new Error(adminAuthError?.message || 'Failed to create user account');
    }

    const userId = adminAuthData.user.id;

    const { error: userError } = await supabase
      .from('tbl_users')
      .insert({
        tu_id: userId,
        tu_email: String(userEmail).trim(),
        tu_user_type: 'company',
        tu_is_verified: true,
        tu_email_verified: true,
        tu_mobile_verified: true,
        tu_is_active: true
      });

    if (userError) {
      await supabase.auth.admin.deleteUser(userId);
      throw userError;
    }

    const { error: companyError } = await supabase
      .from('tbl_companies')
      .insert({
        tc_user_id: userId,
        tc_company_name: companyName,
        tc_brand_name: brandName || null,
        tc_business_type: businessType || null,
        tc_business_category: businessCategory || null,
        tc_registration_number: registrationNumber,
        tc_gstin: gstin,
        tc_website_url: websiteUrl || null,
        tc_official_email: officialEmail,
        tc_affiliate_code: affiliateCode || null,
        tc_verification_status: verificationStatus || 'verified'
      });

    if (companyError) {
      await supabase.auth.admin.deleteUser(userId);
      throw companyError;
    }

    await logAdminAction(supabase, admin.tau_id, 'create_company', 'companies', {
      company_id: userId,
      company_name: companyName,
      company_email: officialEmail
    });

    return new Response(JSON.stringify({ success: true, data: { userId } }), {
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
