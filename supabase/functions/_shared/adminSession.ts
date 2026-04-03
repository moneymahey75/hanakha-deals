import { createClient } from 'jsr:@supabase/supabase-js@2';

export type AdminUser = {
  tau_id: string;
  tau_email: string;
  tau_role?: string | null;
  tau_is_active: boolean;
};

export const requireAdminSession = async (
  supabase: ReturnType<typeof createClient>,
  token: string | null
): Promise<AdminUser> => {
  if (!token) {
    throw new Error('Missing admin session token');
  }

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

  if (error || !data?.admin || !data.admin.tau_is_active) {
    throw new Error('Invalid admin session');
  }

  return data.admin as AdminUser;
};

export const logAdminAction = async (
  supabase: ReturnType<typeof createClient>,
  adminId: string,
  action: string,
  module: string,
  details: Record<string, any>
) => {
  try {
    await supabase.from('tbl_admin_activity_logs').insert({
      taal_admin_id: adminId,
      taal_action: action,
      taal_module: module,
      taal_details: details
    });
  } catch (error) {
    console.warn('Failed to log admin action:', action, error);
  }
};
