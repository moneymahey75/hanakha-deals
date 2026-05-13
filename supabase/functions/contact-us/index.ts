import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const emailShell = (content: string) => `
  <!doctype html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <title>ShopClix</title>
    </head>
    <body style="margin:0;padding:0;background:#f3f7f4;font-family:Arial,Helvetica,sans-serif;color:#123026;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f7f4;padding:28px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #dbe7dd;box-shadow:0 16px 45px rgba(18,48,38,0.08);">
              ${content}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
`;

const compactHtml = (html: string) =>
  html
    .replace(/>\s+</g, '><')
    .replace(/\n\s*/g, '')
    .trim();

const brandHeader = (eyebrow: string, title: string, subtitle: string) => `
  <tr>
    <td style="background:#0f5132;padding:30px 34px;color:#ffffff;">
      <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#b7f0cf;font-weight:700;margin-bottom:10px;">${eyebrow}</div>
      <div style="font-size:30px;line-height:1.2;font-weight:800;margin-bottom:10px;">${title}</div>
      <div style="font-size:15px;line-height:1.6;color:#e5fff0;">${subtitle}</div>
    </td>
  </tr>
`;

const fieldRow = (label: string, value: string) => `
  <tr>
    <td style="padding:12px 0;border-bottom:1px solid #e8efe9;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7d72;font-weight:700;margin-bottom:4px;">${label}</div>
      <div style="font-size:16px;line-height:1.5;color:#123026;font-weight:600;">${value}</div>
    </td>
  </tr>
`;

const sendSmtpMail = async ({
  smtpHost,
  smtpPort,
  gmailUser,
  gmailPassword,
  fromName,
  to,
  replyTo,
  subject,
  html,
  text,
}: {
  smtpHost: string;
  smtpPort: number;
  gmailUser: string;
  gmailPassword: string;
  fromName: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}) => {
  const client = new SMTPClient({
    debug: {
      encodeLB: true,
    },
    connection: {
      hostname: smtpHost,
      port: smtpPort,
      tls: smtpPort === 465,
      auth: {
        username: gmailUser,
        password: gmailPassword,
      },
    },
  });

  try {
    await client.send({
      from: `"${fromName}" <${gmailUser}>`,
      to,
      replyTo,
      subject,
      html: compactHtml(html),
      content: text,
    });
  } finally {
    await client.close();
  }
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

const getSetting = async (supabase: ReturnType<typeof createClient>, key: string): Promise<string> => {
  const { data } = await supabase
    .from('tbl_system_settings')
    .select('tss_setting_value')
    .eq('tss_setting_key', key)
    .maybeSingle();

  const value = data?.tss_setting_value;
  return typeof value === 'string' ? value.trim() : '';
};

const verifyTurnstile = async (token: string, siteMode: string, remoteip: string | null) => {
  if (siteMode === 'development') {
    if (token.startsWith('mock-turnstile-token-') || token.startsWith('mock-recaptcha-token-')) {
      return;
    }
    throw new Error('Invalid development security token');
  }

  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) {
    throw new Error('Turnstile secret is not configured');
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret,
      response: token,
      remoteip,
      idempotency_key: crypto.randomUUID(),
    }),
  });

  const result = await response.json();
  if (!result?.success) {
    console.warn('Contact form Turnstile verification failed', {
      remoteip,
      errorCodes: result?.['error-codes'] || [],
    });
    throw new Error('Security verification failed. Please try again.');
  }
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const gmailUser = Deno.env.get('GMAIL_SMTP_USER') || Deno.env.get('SMTP_USERNAME');
    const gmailPassword = Deno.env.get('GMAIL_SMTP_APP_PASSWORD') || Deno.env.get('SMTP_PASSWORD');
    const smtpHost = Deno.env.get('GMAIL_SMTP_HOST') || Deno.env.get('SMTP_HOST') || 'smtp.gmail.com';
    const smtpPort = Number(Deno.env.get('GMAIL_SMTP_PORT') || Deno.env.get('SMTP_PORT') || '465');
    const fromName = Deno.env.get('GMAIL_SMTP_FROM_NAME') || Deno.env.get('SMTP_FROM_NAME') || 'ShopClix Support';

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    if (!gmailUser || !gmailPassword) {
      throw new Error('Gmail SMTP credentials are not configured');
    }

    const body = await req.json();
    const name = String(body?.name || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const subject = String(body?.subject || '').trim();
    const message = String(body?.message || '').trim();
    const type = String(body?.type || 'general').trim();
    const turnstileToken = String(body?.turnstileToken || '').trim();
    const honeypot = String(body?.companyWebsite || '').trim();

    if (honeypot) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!name || name.length > 120) throw new Error('Please enter a valid name');
    if (!emailRegex.test(email) || email.length > 160) throw new Error('Please enter a valid email address');
    if (!subject || subject.length > 180) throw new Error('Please enter a valid subject');
    if (!message || message.length > 5000) throw new Error('Please enter a valid message');
    if (!turnstileToken) throw new Error('Please complete the security verification');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const siteMode = (await getSetting(supabase, 'site_mode')) || 'live';
    const remoteip = getIpFromHeaders(req.headers);
    await verifyTurnstile(turnstileToken, siteMode, remoteip);

    const configuredAdminEmail = Deno.env.get('CONTACT_ADMIN_EMAIL') || Deno.env.get('ADMIN_CONTACT_EMAIL');
    const settingsContactEmail = await getSetting(supabase, 'contact_email');
    const adminEmail = String(configuredAdminEmail || settingsContactEmail || gmailUser).trim();

    if (!emailRegex.test(adminEmail)) {
      throw new Error('Admin contact email is not configured');
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeType = escapeHtml(type);
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br />');
    const safeIp = escapeHtml(remoteip || 'unknown');

    const adminHtml = emailShell(`
      ${brandHeader(
        'ShopClix Contact',
        'New message received',
        'A visitor submitted the Contact Us form. Reply directly to this email to continue the conversation.'
      )}
      <tr>
        <td style="padding:30px 34px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${fieldRow('From', `${safeName} &lt;${safeEmail}&gt;`)}
            ${fieldRow('Inquiry Type', safeType)}
            ${fieldRow('Subject', safeSubject)}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 34px 30px;">
          <div style="background:#f7fbf8;border:1px solid #dbe7dd;border-radius:14px;padding:20px;">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#47705a;font-weight:800;margin-bottom:10px;">Message</div>
            <div style="font-size:16px;line-height:1.7;color:#123026;">${safeMessage}</div>
          </div>
          <div style="margin-top:18px;font-size:12px;line-height:1.6;color:#6b7d72;">
            Submitted from IP: ${safeIp}
          </div>
        </td>
      </tr>
      <tr>
        <td style="background:#f7fbf8;padding:18px 34px;border-top:1px solid #e1ebe3;">
          <a href="mailto:${safeEmail}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;padding:12px 18px;">Reply to ${safeName}</a>
        </td>
      </tr>
    `);

    const thankYouHtml = emailShell(`
      ${brandHeader(
        'ShopClix Support',
        'We received your message',
        'Thanks for reaching out. Our team will review your inquiry and get back to you as soon as possible.'
      )}
      <tr>
        <td style="padding:32px 34px 12px;">
          <div style="font-size:18px;line-height:1.6;color:#123026;">Hi ${safeName},</div>
          <div style="font-size:16px;line-height:1.7;color:#40564a;margin-top:12px;">
            Your message is safely with our support team. We usually reply within 24 hours during business days.
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 34px 28px;">
          <div style="background:#f7fbf8;border:1px solid #dbe7dd;border-radius:14px;padding:20px;">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#47705a;font-weight:800;margin-bottom:8px;">Your Request</div>
            <div style="font-size:18px;line-height:1.45;color:#123026;font-weight:800;">${safeSubject}</div>
            <div style="margin-top:12px;font-size:14px;line-height:1.6;color:#607368;">Category: ${safeType}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 34px 34px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ecfdf3;border-radius:14px;">
            <tr>
              <td style="padding:18px 20px;">
                <div style="font-size:14px;line-height:1.6;color:#14532d;">
                  Need to add more details? Reply to this email and keep the same subject line.
                </div>
              </td>
            </tr>
          </table>
          <div style="font-size:15px;line-height:1.7;color:#40564a;margin-top:24px;">
            Regards,<br />
            <strong style="color:#123026;">ShopClix Support</strong>
          </div>
        </td>
      </tr>
    `);

    await sendSmtpMail({
      smtpHost,
      smtpPort,
      gmailUser,
      gmailPassword,
      fromName,
      to: adminEmail,
      replyTo: email,
      subject: `[Contact Us] ${subject}`,
      html: adminHtml,
      text: `New Contact Us Message\n\nName: ${name}\nEmail: ${email}\nType: ${type}\nSubject: ${subject}\n\n${message}\n\nIP: ${remoteip || 'unknown'}`,
    });

    await sendSmtpMail({
      smtpHost,
      smtpPort,
      gmailUser,
      gmailPassword,
      fromName,
      to: email,
      subject: 'Thank you for contacting ShopClix',
      html: thankYouHtml,
      text: `Hi ${name},\n\nWe received your message and our support team will review it shortly.\n\nYour subject: ${subject}\n\nRegards,\nShopClix Support`,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Contact form email error:', error);
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Failed to send message' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
