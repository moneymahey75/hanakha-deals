import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { sessionManager, supabase } from '../../lib/supabase';
import { useNotification } from '../ui/NotificationProvider';

const AuthUrlHandler: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const notification = useNotification();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;

    const type = searchParams.get('type');
    const code = searchParams.get('code');
    const token = searchParams.get('token');
    const next = searchParams.get('next') || '/';

    // Run only when URL contains auth callback parameters.
    if (!type && !code && !token) return;
    handledRef.current = true;

    const run = async () => {
      try {
        // Ensure this tab is in customer mode and does not inherit admin session markers.
        try {
          sessionStorage.setItem('session_type', 'customer');
          sessionStorage.removeItem('admin_session_token');
          sessionStorage.removeItem('admin_session_data');
        } catch {
          // ignore
        }

        // Destroy any previous customer session to avoid non-deterministic behavior.
        try {
          sessionManager.clearAllSessions();
          await supabase.auth.signOut();
        } catch {
          // ignore
        }

        // Preferred: PKCE code exchange.
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (!data.session) throw new Error('Failed to exchange auth code for session');
          sessionManager.saveSession(data.session);
        } else if (type === 'magiclink' && token) {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: 'magiclink',
          });
          if (error) throw error;
          if (!data.session) throw new Error('Failed to verify sign-in token');
          sessionManager.saveSession(data.session);
        } else if (type === 'recovery' && token) {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: 'recovery',
          });
          if (error) throw error;
          if (!data.session) throw new Error('Failed to verify reset token');
          notification.showSuccess('Email Verified', 'You can now reset your password.');
          navigate('/reset-password', { replace: true });
          return;
        } else {
          // Unknown callback type; bail out.
          throw new Error('Unsupported authentication callback');
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;
        if (!userId) throw new Error('Session not established');

        // Gate navigation: active + required verification + registration paid.
        const [{ data: userRow, error: userError }, { data: settingsRows }, { data: profileRow }] = await Promise.all([
          supabase
            .from('tbl_users')
            .select('tu_id, tu_email, tu_is_active, tu_email_verified, tu_mobile_verified, tu_registration_paid')
            .eq('tu_id', userId)
            .maybeSingle(),
          supabase
            .from('tbl_system_settings')
            .select('tss_setting_key, tss_setting_value')
            .in('tss_setting_key', ['email_verification_required', 'mobile_verification_required', 'either_verification_required']),
          supabase.from('tbl_user_profiles').select('tup_mobile').eq('tup_user_id', userId).maybeSingle(),
        ]);

        if (userError || !userRow) throw new Error('Failed to load customer status after sign-in');

        if (!userRow.tu_is_active) {
          try {
            sessionManager.clearAllSessions();
            await supabase.auth.signOut();
          } catch {
            // ignore
          }
          notification.showError('Account Inactive', 'This customer account is inactive.');
          navigate('/customer/login', { replace: true });
          return;
        }

        const settingsMap =
          (settingsRows || []).reduce((acc: any, s: any) => {
            try {
              acc[s.tss_setting_key] = JSON.parse(s.tss_setting_value);
            } catch {
              acc[s.tss_setting_key] = s.tss_setting_value;
            }
            return acc;
          }, {}) || {};

        const emailRequired = Boolean(settingsMap.email_verification_required);
        const mobileRequired = Boolean(settingsMap.mobile_verification_required);
        const eitherRequired = Boolean(settingsMap.either_verification_required);

        let needsVerification = false;
        if (eitherRequired) {
          needsVerification = !userRow.tu_email_verified && !userRow.tu_mobile_verified;
        } else {
          if (emailRequired && !userRow.tu_email_verified) needsVerification = true;
          if (mobileRequired && !userRow.tu_mobile_verified) needsVerification = true;
        }

        if (needsVerification) {
          notification.showInfo('Verification Needed', 'Please complete verification to continue.');
          navigate('/verify-otp', {
            replace: true,
            state: {
              userId,
              email: userRow.tu_email,
              mobile: profileRow?.tup_mobile || '',
              verificationSettings: { emailRequired, mobileRequired, eitherRequired },
              from: { pathname: next },
              returnTo: next,
            },
          });
          return;
        }

        if (!userRow.tu_registration_paid) {
          notification.showInfo('Registration Payment Needed', 'Please complete registration payment to continue.');
          navigate('/registration-payment', { replace: true, state: { from: { pathname: next } } });
          return;
        }

        notification.showSuccess('Signed In', 'Customer session started.');
        navigate(next, { replace: true });
      } catch (error: any) {
        console.error('Auth URL handling error:', error);
        notification.showError('Sign-in Failed', 'The sign-in link is invalid or has expired.');
        navigate('/customer/login', { replace: true });
      }
    };

    void run();
  }, [navigate, notification, searchParams]);

  return null;
};

export default AuthUrlHandler;

