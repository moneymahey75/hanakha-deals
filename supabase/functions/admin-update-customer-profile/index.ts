import { createClient } from 'jsr:@supabase/supabase-js@2';
import { adminHasPermission, logAdminAction, requireAdminSession } from '../_shared/adminSession.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
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
    const admin = await requireAdminSession(supabase, adminSessionToken);
    if (!adminHasPermission(admin, 'customers', 'write')) {
      return new Response(JSON.stringify({ success: false, error: 'Permission denied: customers.write' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { userId, firstName, lastName, username, mobile, gender } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing userId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error } = await supabase
      .from('tbl_user_profiles')
      .update({
        tup_first_name: firstName,
        tup_last_name: lastName,
        tup_username: username,
        tup_mobile: mobile,
        tup_gender: gender,
        tup_updated_at: new Date().toISOString()
      })
      .eq('tup_user_id', userId);

    if (error) {
      throw error;
    }

    await logAdminAction(supabase, admin.tau_id, 'update_customer_profile', 'customers', {
      user_id: userId,
      fields_updated: {
        first_name: firstName !== undefined,
        last_name: lastName !== undefined,
        username: username !== undefined,
        mobile: mobile !== undefined,
        gender: gender !== undefined
      }
    });

    return new Response(JSON.stringify({ success: true, data: { userId } }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    const message = error?.message || 'Failed';
    const status = message.includes('admin session') ? 401 : 500;
    return new Response(JSON.stringify({ success: false, error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
