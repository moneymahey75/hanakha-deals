/// <reference types="deno.ns" />
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { sendSmtpMail } from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { to, subject, html, text } = await req.json();

    if (!to || !subject || !html) {
      return new Response(JSON.stringify({
        success: false,
        error: 'to, subject, and html are required',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    await sendSmtpMail({
      to: Array.isArray(to) ? to.join(',') : String(to),
      subject: String(subject),
      html: String(html),
      text: String(text || subject),
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'Email sent successfully via SMTP',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: unknown) {
    console.error('Email send error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({
      success: false,
      error: message,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
