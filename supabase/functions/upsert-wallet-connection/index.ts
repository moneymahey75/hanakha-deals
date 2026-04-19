import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const normalizeAddress = (address?: string | null) => (address || '').trim();
const normalizeAddressLower = (address?: string | null) => normalizeAddress(address).toLowerCase();

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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Missing auth token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid user session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = authData.user.id;
    const body = await req.json().catch(() => ({}));

    const walletAddressRaw = normalizeAddress(body.wallet_address);
    const walletName = typeof body.wallet_name === 'string' ? body.wallet_name : 'Unknown Wallet';
    const walletType = typeof body.wallet_type === 'string' ? body.wallet_type : 'web3';
    const chainId = body.chain_id === null || body.chain_id === undefined ? null : Number(body.chain_id);

    if (!walletAddressRaw || !isEvmAddress(walletAddressRaw)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid wallet address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const walletAddressLower = normalizeAddressLower(walletAddressRaw);

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
      const { data: otherUserWallet } = await supabase
        .from('tbl_user_wallet_connections')
        .select('tuwc_id, tuwc_user_id')
        .ilike('tuwc_wallet_address', walletAddressLower)
        .neq('tuwc_user_id', userId)
        .limit(1)
        .maybeSingle();

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

    // Deactivate any existing active connections for this user.
    await supabase
      .from('tbl_user_wallet_connections')
      .update({
        tuwc_is_active: false,
        tuwc_updated_at: new Date().toISOString(),
      })
      .eq('tuwc_user_id', userId)
      .eq('tuwc_is_active', true);

    // Update existing wallet or create a new one.
    const { data: existingWallet, error: existingWalletError } = await supabase
      .from('tbl_user_wallet_connections')
      .select('tuwc_id')
      .eq('tuwc_user_id', userId)
      .ilike('tuwc_wallet_address', walletAddressLower)
      .maybeSingle();

    if (existingWalletError) {
      throw existingWalletError;
    }

    if (existingWallet?.tuwc_id) {
      await supabase
        .from('tbl_user_wallet_connections')
        .update({
          tuwc_is_active: true,
          tuwc_wallet_address: walletAddressLower,
          tuwc_wallet_name: walletName,
          tuwc_wallet_type: walletType,
          tuwc_chain_id: Number.isFinite(chainId) ? chainId : null,
          tuwc_last_connected_at: new Date().toISOString(),
          tuwc_updated_at: new Date().toISOString(),
        })
        .eq('tuwc_id', existingWallet.tuwc_id)
        .eq('tuwc_user_id', userId);
    } else {
      await supabase
        .from('tbl_user_wallet_connections')
        .insert({
          tuwc_user_id: userId,
          tuwc_wallet_address: walletAddressLower,
          tuwc_wallet_name: walletName,
          tuwc_wallet_type: walletType,
          tuwc_chain_id: Number.isFinite(chainId) ? chainId : null,
          tuwc_is_active: true,
          tuwc_last_connected_at: new Date().toISOString(),
        });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('upsert-wallet-connection error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
