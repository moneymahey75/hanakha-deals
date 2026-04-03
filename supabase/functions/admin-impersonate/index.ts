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
    const nowIso = new Date().toISOString();

    const { data: adminSession, error: adminError } = await supabase
      .from('tbl_admin_sessions')
      .select(`
        tas_admin_id,
        admin:tas_admin_id(
          tau_id,
          tau_email,
          tau_role,
          tau_is_active
        )
      `)
      .eq('tas_session_token', adminSessionToken)
      .gt('tas_expires_at', nowIso)
      .maybeSingle();

    const adminUser = adminSession?.admin;

    if (adminError || !adminUser || !adminUser.tau_is_active) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid admin session' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!['super_admin', 'sub_admin'].includes(adminUser.tau_role)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient permissions' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { customerId } = await req.json();

    if (!customerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing customer ID' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: customer, error: customerError } = await supabase
      .from('tbl_users')
      .select('tu_id, tu_email, tu_is_active, tu_user_type')
      .eq('tu_id', customerId)
      .maybeSingle();

    if (customerError || !customer) {
      return new Response(
        JSON.stringify({ success: false, error: 'Customer not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (customer.tu_user_type !== 'customer') {
      return new Response(
        JSON.stringify({ success: false, error: 'User is not a customer account' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!customer.tu_is_active) {
      return new Response(
        JSON.stringify({ success: false, error: 'Customer account is not active' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    await supabase
      .from('tbl_admin_activity_logs')
      .insert({
        taal_admin_id: adminUser.tau_id,
        taal_action: 'impersonate_customer',
        taal_module: 'customer_management',
        taal_details: {
          customer_id: customerId,
          customer_email: customer.tu_email,
          timestamp: new Date().toISOString(),
        },
      });

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: customer.tu_email,
      options: {
        redirectTo: `${supabaseUrl.replace('.supabase.co', '')}/customer/dashboard`,
      },
    });

    if (linkError) {
      throw linkError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        customer_id: customer.tu_id,
        customer_email: customer.tu_email,
        signin_url: linkData.properties?.action_link || linkData.properties?.hashed_token,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    console.error('Error in admin-impersonate function:', error);
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
