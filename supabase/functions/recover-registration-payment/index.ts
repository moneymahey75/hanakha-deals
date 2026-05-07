import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ethers } from 'npm:ethers@6.10.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const DEFAULT_MAINNET_RPCS = ['https://bsc-dataseed1.binance.org/', 'https://bsc-dataseed2.binance.org/'];
const DEFAULT_TESTNET_RPCS = [
  'https://data-seed-prebsc-1-s1.binance.org:8545/',
  'https://data-seed-prebsc-2-s1.binance.org:8545/'
];

const parseSetting = (raw: any) => {
  if (raw === null || raw === undefined) return raw;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const normalizeAddress = (address?: string | null) => String(address || '').trim().toLowerCase();

const buildRpcUrls = (isMainnet: boolean) => {
  const envUrl = isMainnet ? Deno.env.get('BSC_MAINNET_RPC_URL') : Deno.env.get('BSC_TESTNET_RPC_URL');
  const defaults = isMainnet ? DEFAULT_MAINNET_RPCS : DEFAULT_TESTNET_RPCS;
  return [...new Set([envUrl, ...defaults].filter(Boolean) as string[])];
};

const scanProvider = async ({
  provider,
  usdtAddress,
  fromAddress,
  toAddress,
  amount,
  fromBlock,
}: {
  provider: ethers.JsonRpcProvider;
  usdtAddress: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  fromBlock?: number | null;
}) => {
  const token = new ethers.Contract(usdtAddress, ['function decimals() view returns (uint8)'], provider);
  let decimals = 18;
  try {
    decimals = Number(await token.decimals());
  } catch {
    // configured USDT-like registration tokens generally use 18 decimals
  }

  const currentBlock = await provider.getBlockNumber();
  const startBlock = Math.max(0, Number.isFinite(Number(fromBlock)) ? Number(fromBlock) - 20 : currentBlock - 8000);
  const expectedAmount = ethers.parseUnits(String(amount), decimals);
  const topics = [
    TRANSFER_TOPIC,
    ethers.zeroPadValue(ethers.getAddress(fromAddress), 32),
    ethers.zeroPadValue(ethers.getAddress(toAddress), 32)
  ];

  const chunkSize = 750;
  for (let toBlock = currentBlock; toBlock >= startBlock; toBlock -= chunkSize) {
    const fromChunk = Math.max(startBlock, toBlock - chunkSize + 1);
    const logs = await provider.getLogs({
      address: usdtAddress,
      fromBlock: fromChunk,
      toBlock,
      topics
    });

    const match = logs
      .filter((log) => {
        try {
          return BigInt(log.data) === expectedAmount;
        } catch {
          return false;
        }
      })
      .sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return b.blockNumber - a.blockNumber;
        return b.index - a.index;
      })[0];

    if (match?.transactionHash) {
      return match.transactionHash;
    }
  }

  return null;
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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Missing auth token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '').trim();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid user session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = authData.user.id;
    const { walletAddress, toAddress, amount, startBlock } = await req.json();

    if (!ethers.isAddress(walletAddress)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid source wallet' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: settingsRows, error: settingsError } = await supabase
      .from('tbl_system_settings')
      .select('tss_setting_key, tss_setting_value')
      .in('tss_setting_key', ['admin_payment_wallet', 'payment_mode', 'usdt_address']);

    if (settingsError) throw settingsError;

    const settingsMap: Record<string, any> = {};
    for (const row of settingsRows || []) {
      settingsMap[row.tss_setting_key] = parseSetting(row.tss_setting_value);
    }

    const adminWallet = String(settingsMap.admin_payment_wallet || '').trim();
    const requestToAddress = String(toAddress || '').trim();
    const usdtAddress = String(settingsMap.usdt_address || '').trim();
    const paymentMode = settingsMap.payment_mode;

    if (!ethers.isAddress(adminWallet) || normalizeAddress(requestToAddress) !== normalizeAddress(adminWallet)) {
      return new Response(JSON.stringify({ success: false, error: 'Recipient wallet does not match admin wallet' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!ethers.isAddress(usdtAddress)) {
      return new Response(JSON.stringify({ success: false, error: 'USDT contract address not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: registrationPlan, error: planError } = await supabase
      .from('tbl_subscription_plans')
      .select('tsp_price')
      .eq('tsp_type', 'registration')
      .eq('tsp_is_active', true)
      .maybeSingle();

    if (planError) throw planError;

    const expectedAmount = Number(registrationPlan?.tsp_price || 0);
    if (!Number.isFinite(expectedAmount) || Number(amount) !== expectedAmount) {
      return new Response(JSON.stringify({ success: false, error: 'Amount does not match registration fee' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isMainnet = paymentMode === true || paymentMode === '1' || paymentMode === 1 || paymentMode === 'true';
    const rpcUrls = buildRpcUrls(isMainnet);
    let lastError: any = null;

    for (const rpcUrl of rpcUrls) {
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const txHash = await scanProvider({
          provider,
          usdtAddress,
          fromAddress: walletAddress,
          toAddress: adminWallet,
          amount: expectedAmount,
          fromBlock: startBlock
        });

        if (txHash) {
          return new Response(JSON.stringify({
            success: true,
            status: 'found',
            txHash,
            network: isMainnet ? 'BSC Mainnet' : 'BSC Testnet'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (error) {
        lastError = error;
        console.warn('Registration payment recovery RPC failed:', error?.message || error);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      status: 'pending',
      message: 'Payment transaction not visible yet',
      userId,
      last_error: lastError?.message || null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('recover-registration-payment error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message || 'Recovery failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
