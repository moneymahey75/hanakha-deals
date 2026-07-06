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

    const { userId, email, isVerified, emailVerified, mobileVerified, isActive, isDummy } = await req.json();
    if (!userId || !email) {
      return new Response(JSON.stringify({ success: false, error: 'Missing parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid email address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existingUser, error: existingUserError } = await supabase
      .from('tbl_users')
      .select('tu_id, tu_email')
      .eq('tu_id', userId)
      .eq('tu_user_type', 'customer')
      .maybeSingle();

    if (existingUserError) throw existingUserError;
    if (!existingUser) {
      return new Response(JSON.stringify({ success: false, error: 'Customer not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: duplicateUser, error: duplicateUserError } = await supabase
      .from('tbl_users')
      .select('tu_id')
      .ilike('tu_email', normalizedEmail)
      .neq('tu_id', userId)
      .limit(1)
      .maybeSingle();

    if (duplicateUserError) throw duplicateUserError;
    if (duplicateUser) {
      return new Response(JSON.stringify({ success: false, error: 'Email is already used by another customer' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: authUserData, error: authUserError } = await supabase.auth.admin.getUserById(userId);
    if (authUserError || !authUserData?.user) {
      throw authUserError || new Error('Customer auth account not found');
    }

    const previousAuthEmail = String(authUserData.user.email || '').trim().toLowerCase();
    const emailChangedInAuth = previousAuthEmail !== normalizedEmail;

    if (emailChangedInAuth) {
      const { error: updateAuthError } = await supabase.auth.admin.updateUserById(userId, {
        email: normalizedEmail,
        email_confirm: Boolean(emailVerified),
      });

      if (updateAuthError) {
        throw updateAuthError;
      }
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
      tu_email: normalizedEmail,
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
      if (emailChangedInAuth && previousAuthEmail) {
        await supabase.auth.admin.updateUserById(userId, {
          email: previousAuthEmail,
        });
      }
      throw error;
    }

    await logAdminAction(supabase, admin.tau_id, 'update_customer_user', 'customers', {
      user_id: userId,
      auth_email_changed: emailChangedInAuth,
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
