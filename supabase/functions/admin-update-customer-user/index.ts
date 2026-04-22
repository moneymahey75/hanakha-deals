import { createClient } from 'jsr:@supabase/supabase-js@2';
import { logAdminAction, requireAdminSession } from '../_shared/adminSession.ts';

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

    const { userId, email, isVerified, emailVerified, mobileVerified, isActive, isDummy } = await req.json();
    if (!userId || !email) {
      return new Response(JSON.stringify({ success: false, error: 'Missing parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const updatePayload: Partial<{
      tu_email: string;
      tu_is_verified: boolean;
      tu_email_verified: boolean;
      tu_mobile_verified: boolean;
      tu_is_active: boolean;
      tu_is_dummy: boolean;
      tu_updated_at: string;
    }> = {
      tu_email: email,
      tu_is_verified: isVerified,
      tu_email_verified: emailVerified,
      tu_mobile_verified: mobileVerified,
      tu_is_active: isActive,
      tu_updated_at: new Date().toISOString()
    };

    if (typeof isDummy === 'boolean') {
      updatePayload.tu_is_dummy = isDummy;
    }

    const { error } = await supabase
      .from('tbl_users')
      .update(updatePayload)
      .eq('tu_id', userId);

    if (error) {
      throw error;
    }

    await logAdminAction(supabase, admin.tau_id, 'update_customer_user', 'customers', {
      user_id: userId,
      email,
      is_verified: isVerified,
      email_verified: emailVerified,
      mobile_verified: mobileVerified,
      is_active: isActive,
      is_dummy: typeof isDummy === 'boolean' ? isDummy : undefined
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
