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
      name,
      description,
      price,
      durationDays,
      features,
      parentIncome,
      isActive,
      planType
    } = await req.json();

    const normalizedName = String(name || '').trim();
    const normalizedPlanType = String(planType || '').trim();
    const normalizedPrice = Number(price);
    const normalizedDurationDays = Number(durationDays);

    // durationDays can be 0 for "lifetime"
    if (!normalizedName || !normalizedPlanType || !Number.isFinite(normalizedPrice) || normalizedPrice <= 0 || !Number.isFinite(normalizedDurationDays) || normalizedDurationDays < 0) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (id) {
      const { error } = await supabase
        .from('tbl_subscription_plans')
        .update({
          tsp_name: normalizedName,
          tsp_description: description,
          tsp_price: normalizedPrice,
          tsp_duration_days: Math.trunc(normalizedDurationDays),
          tsp_features: features,
          tsp_parent_income: parentIncome,
          tsp_is_active: isActive
        })
        .eq('tsp_id', id);

      if (error) {
        throw error;
      }
    } else {
      const { error } = await supabase
        .from('tbl_subscription_plans')
        .insert({
          tsp_name: normalizedName,
          tsp_description: description,
          tsp_price: normalizedPrice,
          tsp_duration_days: Math.trunc(normalizedDurationDays),
          tsp_features: features,
          tsp_parent_income: parentIncome,
          tsp_is_active: isActive,
          tsp_type: normalizedPlanType
        });

      if (error) {
        throw error;
      }
    }

    await logAdminAction(supabase, admin.tau_id, id ? 'update_subscription_plan' : 'create_subscription_plan', 'subscriptions', {
      plan_id: id || null,
      name,
      price,
      duration_days: durationDays,
      plan_type: planType,
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
