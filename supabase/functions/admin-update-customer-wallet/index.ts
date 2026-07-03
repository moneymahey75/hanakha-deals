import { createClient } from 'jsr:@supabase/supabase-js@2';
import { adminHasPermission, logAdminAction, requireAdminSession } from '../_shared/adminSession.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
};

const normalizeAddress = (address?: string | null) => (address || '').trim().toLowerCase();
const isEvmAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value);

const parseSetting = (raw: unknown) => {
  if (raw === null || raw === undefined) return raw;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const isLocalSupabaseUrl = (supabaseUrl: string) =>
  supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('0.0.0.0');

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
    const admin = await requireAdminSession(supabase, req.headers.get('X-Admin-Session'));
    if (!adminHasPermission(admin, 'wallets', 'write')) {
      return new Response(JSON.stringify({ success: false, error: 'Permission denied: wallets.write' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const walletConnectionId = typeof body.walletConnectionId === 'string' ? body.walletConnectionId.trim() : '';
    const walletAddress = normalizeAddress(body.walletAddress);
    const walletName = typeof body.walletName === 'string' && body.walletName.trim()
      ? body.walletName.trim()
      : 'Admin Updated Wallet';
    const walletType = typeof body.walletType === 'string' && body.walletType.trim()
      ? body.walletType.trim()
      : 'web3';
    const chainId = body.chainId === null || body.chainId === undefined || body.chainId === ''
      ? null
      : Number(body.chainId);
    const isDefault = body.isDefault !== false;
    const isActive = body.isActive !== false;

    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing userId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!walletAddress || !isEvmAddress(walletAddress)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid wallet address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (chainId !== null && !Number.isFinite(chainId)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid chain ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: customer, error: customerError } = await supabase
      .from('tbl_users')
      .select('tu_id, tu_user_type')
      .eq('tu_id', userId)
      .eq('tu_user_type', 'customer')
      .maybeSingle();

    if (customerError) throw customerError;
    if (!customer?.tu_id) {
      return new Response(JSON.stringify({ success: false, error: 'Customer not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: settingRow } = await supabase
      .from('tbl_system_settings')
      .select('tss_setting_value')
      .eq('tss_setting_key', 'wallet_unique_per_customer')
      .maybeSingle();

    const settingValueParsed = settingRow?.tss_setting_value !== undefined
      ? parseSetting(settingRow.tss_setting_value)
      : undefined;

    const enforceUniqueWallet = settingValueParsed === undefined || settingValueParsed === null
      ? !isLocalSupabaseUrl(supabaseUrl)
      : Boolean(settingValueParsed);

    if (enforceUniqueWallet) {
      const { data: otherUserWallet, error: otherUserWalletError } = await supabase
        .from('tbl_user_wallet_connections')
        .select('tuwc_id, tuwc_user_id')
        .ilike('tuwc_wallet_address', walletAddress)
        .neq('tuwc_user_id', userId)
        .limit(1)
        .maybeSingle();

      if (otherUserWalletError) throw otherUserWalletError;
      if (otherUserWallet?.tuwc_id) {
        return new Response(JSON.stringify({
          success: false,
          error: 'This wallet address is already linked to another customer.'
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const now = new Date().toISOString();
    let targetWalletId = walletConnectionId;

    if (targetWalletId) {
      const { data: existingWallet, error: existingWalletError } = await supabase
        .from('tbl_user_wallet_connections')
        .select('tuwc_id')
        .eq('tuwc_id', targetWalletId)
        .eq('tuwc_user_id', userId)
        .maybeSingle();

      if (existingWalletError) throw existingWalletError;
      if (!existingWallet?.tuwc_id) {
        return new Response(JSON.stringify({ success: false, error: 'Wallet connection not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      const { data: existingForUser, error: existingForUserError } = await supabase
        .from('tbl_user_wallet_connections')
        .select('tuwc_id')
        .eq('tuwc_user_id', userId)
        .ilike('tuwc_wallet_address', walletAddress)
        .maybeSingle();

      if (existingForUserError) throw existingForUserError;
      targetWalletId = existingForUser?.tuwc_id || '';
    }

    if (isDefault) {
      await supabase
        .from('tbl_user_wallet_connections')
        .update({
          tuwc_is_default: false,
          tuwc_is_active: false,
          tuwc_updated_at: now,
        })
        .eq('tuwc_user_id', userId)
        .or('tuwc_is_default.eq.true,tuwc_is_active.eq.true');
    }

    let savedWallet;
    if (targetWalletId) {
      const { data, error } = await supabase
        .from('tbl_user_wallet_connections')
        .update({
          tuwc_wallet_address: walletAddress,
          tuwc_wallet_name: walletName,
          tuwc_wallet_type: walletType,
          tuwc_chain_id: chainId,
          tuwc_is_default: isDefault,
          tuwc_is_active: isActive,
          tuwc_last_connected_at: now,
          tuwc_updated_at: now,
        })
        .eq('tuwc_id', targetWalletId)
        .eq('tuwc_user_id', userId)
        .select('tuwc_id, tuwc_wallet_address, tuwc_wallet_name, tuwc_wallet_type, tuwc_chain_id, tuwc_is_default, tuwc_is_active, tuwc_last_connected_at')
        .single();

      if (error) throw error;
      savedWallet = data;
    } else {
      const { data, error } = await supabase
        .from('tbl_user_wallet_connections')
        .insert({
          tuwc_user_id: userId,
          tuwc_wallet_address: walletAddress,
          tuwc_wallet_name: walletName,
          tuwc_wallet_type: walletType,
          tuwc_chain_id: chainId,
          tuwc_is_default: isDefault,
          tuwc_is_active: isActive,
          tuwc_last_connected_at: now,
        })
        .select('tuwc_id, tuwc_wallet_address, tuwc_wallet_name, tuwc_wallet_type, tuwc_chain_id, tuwc_is_default, tuwc_is_active, tuwc_last_connected_at')
        .single();

      if (error) throw error;
      savedWallet = data;
    }

    await logAdminAction(supabase, admin.tau_id, 'update_customer_wallet', 'wallets', {
      user_id: userId,
      wallet_connection_id: savedWallet?.tuwc_id,
      wallet_address: walletAddress,
      wallet_name: walletName,
      wallet_type: walletType,
      chain_id: chainId,
      is_default: isDefault,
      is_active: isActive,
    });

    return new Response(JSON.stringify({ success: true, data: savedWallet }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    const message = error?.message || 'Failed';
    const status = message.includes('admin session') ? 401 : 500;
    const safeMessage = message.includes('wallet_unique_per_customer')
      ? 'This wallet address is already linked to another customer.'
      : message;

    return new Response(JSON.stringify({ success: false, error: safeMessage }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
