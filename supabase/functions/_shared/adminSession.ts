import { createClient } from 'jsr:@supabase/supabase-js@2';

export type AdminUser = {
  tau_id: string;
  tau_email: string;
  tau_role?: string | null;
  tau_permissions?: Record<string, any> | null;
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
        tau_permissions,
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

export const adminHasPermission = (
  admin: AdminUser,
  module: string,
  action: 'read' | 'write' | 'delete'
): boolean => {
  if (admin.tau_role === 'super_admin') {
    return true;
  }

  const permissions = admin.tau_permissions ?? {};
  let modulePermissions = permissions[module];

  // Keep server-side permission behavior aligned with AdminAuthContext's
  // backward compatibility for older sub-admin permission records.
  if (module === 'withdrawals' && permissions.withdrawals == null) {
    modulePermissions = permissions.payments;
  }
  if (module === 'mlm' && permissions.mlm == null) {
    modulePermissions = permissions.settings;
  }

  return Boolean(modulePermissions?.[action]);
};

export const adminHasAnyPermission = (
  admin: AdminUser,
  permissions: Array<[string, 'read' | 'write' | 'delete']>
): boolean => permissions.some(([module, action]) => adminHasPermission(admin, module, action));

export const requireAdminPermission = async (
  supabase: ReturnType<typeof createClient>,
  token: string | null,
  module: string,
  action: 'read' | 'write' | 'delete'
): Promise<AdminUser> => {
  const admin = await requireAdminSession(supabase, token);
  if (!adminHasPermission(admin, module, action)) {
    throw new Error(`Permission denied: ${module}.${action}`);
  }
  return admin;
};

export const requireAdminAnyPermission = async (
  supabase: ReturnType<typeof createClient>,
  token: string | null,
  permissions: Array<[string, 'read' | 'write' | 'delete']>
): Promise<AdminUser> => {
  const admin = await requireAdminSession(supabase, token);
  if (!adminHasAnyPermission(admin, permissions)) {
    throw new Error('Permission denied');
  }
  return admin;
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
  } catch {
    console.warn('Failed to log admin action');
  }
};
