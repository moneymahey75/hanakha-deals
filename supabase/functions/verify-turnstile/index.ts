const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const getIpFromHeaders = (headers: Headers): string | null => {
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf;

  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp;

  return null;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
    const expectedSiteKey = Deno.env.get('TURNSTILE_SITE_KEY') || Deno.env.get('VITE_TURNSTILE_SITE_KEY') || '';
    if (!secret) {
      return new Response(JSON.stringify({ success: false, error: 'Turnstile secret is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { token, action } = await req.json();
    const response = String(token || '').trim();

    if (!response || response.length > 2048) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid security verification token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const remoteip = getIpFromHeaders(req.headers);
    const idempotencyKey = crypto.randomUUID();

    const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        response,
        remoteip,
        idempotency_key: idempotencyKey,
      }),
    });

    const result = await verifyResponse.json();

    if (!result?.success) {
      console.warn('Turnstile verification failed', {
        action,
        remoteip,
        errorCodes: result?.['error-codes'] || [],
      });

      return new Response(JSON.stringify({
        success: false,
        error: 'Security verification failed. Please try again.',
        errorCodes: result?.['error-codes'] || [],
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (expectedSiteKey && result?.sitekey && result.sitekey !== expectedSiteKey) {
      console.warn('Turnstile site key mismatch', {
        action,
        remoteip,
        hostname: result?.hostname,
      });

      return new Response(JSON.stringify({
        success: false,
        error: 'Security verification failed. Please try again.',
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      challengeTs: result.challenge_ts,
      hostname: result.hostname,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Security verification failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
