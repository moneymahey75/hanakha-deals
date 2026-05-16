import { SMTPClient } from 'https://deno.land/x/denomailer/mod.ts';

type MailTheme = 'green' | 'blue' | 'gold';

export type MailCardRow = {
  label: string;
  value: string | number | null | undefined;
};

export type SendMailOptions = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  fromName?: string;
};

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const compactHtml = (html: string) =>
  html
    .replace(/>\s+</g, '><')
    .replace(/\n\s*/g, '')
    .trim();

const getBrand = () => {
  const siteUrl = (Deno.env.get('SITE_URL') || Deno.env.get('PUBLIC_SITE_URL') || 'https://shopclix.live').replace(/\/+$/, '');
  const logoUrl = (Deno.env.get('SITE_LOGO_URL') || '').trim();
  const fallbackLogoUrl = `${siteUrl}/shopclick_logo.png`;

  return {
    siteName: Deno.env.get('SITE_NAME') || 'ShopClix',
    logoUrl: /^https?:\/\//i.test(logoUrl) ? logoUrl : fallbackLogoUrl,
    siteUrl,
  };
};

const themeColors = (theme: MailTheme) => {
  if (theme === 'blue') {
    return { dark: '#1d4ed8', mid: '#2563eb', soft: '#eff6ff', border: '#bfdbfe', accent: '#38bdf8' };
  }
  if (theme === 'gold') {
    return { dark: '#854d0e', mid: '#b45309', soft: '#fffbeb', border: '#fde68a', accent: '#f59e0b' };
  }
  return { dark: '#0f5132', mid: '#15803d', soft: '#f3f7f4', border: '#dbe7dd', accent: '#8bc34a' };
};

export const brandedEmailShell = ({
  eyebrow,
  title,
  subtitle,
  children,
  theme = 'green',
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: string;
  theme?: MailTheme;
}) => {
  const brand = getBrand();
  const colors = themeColors(theme);

  return compactHtml(`
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <title>${escapeHtml(brand.siteName)}</title>
      </head>
      <body style="margin:0;padding:0;background:${colors.soft};font-family:Arial,Helvetica,sans-serif;color:#123026;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${colors.soft};padding:28px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${colors.border};box-shadow:0 16px 45px rgba(18,48,38,0.08);">
                <tr>
                  <td style="padding:22px 34px;background:#ffffff;border-bottom:1px solid ${colors.border};">
                    <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                      <tr>
                        <td style="vertical-align:middle;">
                          <a href="${escapeHtml(brand.siteUrl)}" style="text-decoration:none;display:inline-block;">
                            <img src="${escapeHtml(brand.logoUrl)}" width="180" alt="${escapeHtml(brand.siteName)}" style="display:block;max-width:180px;height:auto;border:0;outline:none;text-decoration:none;" />
                          </a>
                        </td>
                        <td style="vertical-align:middle;padding-left:14px;">
                          <a href="${escapeHtml(brand.siteUrl)}" style="text-decoration:none;color:#0f5132;font-size:22px;font-weight:800;line-height:1;">${escapeHtml(brand.siteName)}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="background:${colors.dark};padding:32px 34px;color:#ffffff;">
                    <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#c8f7d8;font-weight:700;margin-bottom:10px;">${escapeHtml(eyebrow)}</div>
                    <div style="font-size:31px;line-height:1.2;font-weight:800;margin-bottom:10px;">${escapeHtml(title)}</div>
                    <div style="font-size:16px;line-height:1.6;color:#eefcf3;">${escapeHtml(subtitle)}</div>
                  </td>
                </tr>
                ${children}
                <tr>
                  <td style="padding:24px 34px;background:#f8fbf9;border-top:1px solid ${colors.border};">
                    <div style="font-size:13px;line-height:1.6;color:#607267;">This email was sent by ${escapeHtml(brand.siteName)}. If you did not request this activity, please contact support immediately.</div>
                    <div style="font-size:12px;color:#8a9a90;margin-top:10px;">&copy; ${new Date().getFullYear()} ${escapeHtml(brand.siteName)}. All rights reserved.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `);
};

export const detailTable = (rows: MailCardRow[]) => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dbe7dd;border-radius:14px;background:#fbfdfb;margin-top:20px;">
    ${rows
      .filter((row) => row.value !== null && row.value !== undefined && String(row.value).trim() !== '')
      .map((row) => `
        <tr>
          <td style="padding:13px 18px;border-bottom:1px solid #e8efe9;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#64756b;font-weight:700;width:38%;">${escapeHtml(row.label)}</td>
          <td style="padding:13px 18px;border-bottom:1px solid #e8efe9;font-size:15px;color:#123026;font-weight:700;word-break:break-word;">${escapeHtml(row.value)}</td>
        </tr>
      `)
      .join('')}
  </table>
`;

export const otpEmailTemplate = (otp: string) => {
  const brand = getBrand();
  return brandedEmailShell({
    eyebrow: `${brand.siteName} Security`,
    title: 'Verify your email',
    subtitle: 'Use this one-time code to finish securing your account.',
    theme: 'blue',
    children: `
      <tr>
        <td style="padding:34px;">
          <div style="font-size:18px;line-height:1.7;color:#25372d;margin-bottom:22px;">Enter this verification code on ${escapeHtml(brand.siteName)}. The code expires in 10 minutes.</div>
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:16px;text-align:center;padding:28px 18px;">
            <div style="font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#2563eb;font-weight:800;margin-bottom:12px;">Verification Code</div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:42px;line-height:1;font-weight:900;letter-spacing:10px;color:#0f172a;">${escapeHtml(otp)}</div>
          </div>
          <div style="font-size:14px;line-height:1.7;color:#637067;margin-top:22px;">Do not share this code with anyone. Our team will never ask for your OTP.</div>
        </td>
      </tr>
    `,
  });
};

export const welcomeEmailTemplate = (name?: string | null, rows: MailCardRow[] = []) => {
  const brand = getBrand();
  return brandedEmailShell({
    eyebrow: `Welcome to ${brand.siteName}`,
    title: 'Your account is ready',
    subtitle: 'You can now continue your registration payment and start using your referral dashboard.',
    children: `
      <tr>
        <td style="padding:34px;">
          <div style="font-size:22px;font-weight:800;color:#123026;margin-bottom:14px;">Hi ${escapeHtml(name || 'there')},</div>
          <div style="font-size:16px;line-height:1.8;color:#405247;">Welcome aboard. Your ${escapeHtml(brand.siteName)} account has been created successfully. Complete your registration payment to activate earning features and unlock your dashboard.</div>
          ${rows.length > 0 ? detailTable(rows) : ''}
          <div style="margin-top:26px;">
            <a href="${escapeHtml(brand.siteUrl)}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:800;border-radius:10px;padding:14px 22px;">Open ${escapeHtml(brand.siteName)}</a>
          </div>
        </td>
      </tr>
    `,
  });
};

export const paymentEmailTemplate = ({
  name,
  title,
  subtitle,
  rows,
  theme = 'green',
}: {
  name?: string | null;
  title: string;
  subtitle: string;
  rows: MailCardRow[];
  theme?: MailTheme;
}) => brandedEmailShell({
  eyebrow: 'Payment Confirmation',
  title,
  subtitle,
  theme,
  children: `
    <tr>
      <td style="padding:34px;">
        <div style="font-size:21px;font-weight:800;color:#123026;margin-bottom:12px;">Hi ${escapeHtml(name || 'there')},</div>
        <div style="font-size:16px;line-height:1.8;color:#405247;">Your payment has been confirmed. Here are the transaction details for your records.</div>
        ${detailTable(rows)}
      </td>
    </tr>
  `,
});

export const sendSmtpMail = async ({ to, subject, html, text, replyTo, fromName }: SendMailOptions) => {
  const gmailUser = Deno.env.get('GMAIL_SMTP_USER') || Deno.env.get('SMTP_USERNAME');
  const gmailPassword = Deno.env.get('GMAIL_SMTP_APP_PASSWORD') || Deno.env.get('SMTP_PASSWORD');
  const smtpHost = Deno.env.get('GMAIL_SMTP_HOST') || Deno.env.get('SMTP_HOST') || 'smtp.gmail.com';
  const smtpPort = Number(Deno.env.get('GMAIL_SMTP_PORT') || Deno.env.get('SMTP_PORT') || '465');
  const resolvedFromName = fromName || Deno.env.get('GMAIL_SMTP_FROM_NAME') || Deno.env.get('SMTP_FROM_NAME') || getBrand().siteName;

  if (!gmailUser || !gmailPassword) {
    throw new Error('Gmail SMTP credentials are not configured');
  }

  const client = new SMTPClient({
    debug: { encodeLB: true },
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
      from: `"${resolvedFromName}" <${gmailUser}>`,
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

export const getDisplayName = (
  profile?: { tup_first_name?: string | null; tup_last_name?: string | null; tup_username?: string | null } | null,
  fallbackEmail?: string | null
) => {
  const fullName = `${profile?.tup_first_name || ''} ${profile?.tup_last_name || ''}`.trim();
  return fullName || profile?.tup_username || fallbackEmail || '';
};
