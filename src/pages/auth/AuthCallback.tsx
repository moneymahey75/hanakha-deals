import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { sessionManager, supabase } from '../../lib/supabase';
import { useNotification } from '../../components/ui/NotificationProvider';
import { Shield, Loader } from 'lucide-react';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const notification = useNotification();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleAuthCallback = async () => {
      const type = searchParams.get('type');
      try {
        const code = searchParams.get('code');
        const token = searchParams.get('token');
        const next = searchParams.get('next') || '/';
        
        if (type === 'recovery' && token) {
          // This is a password reset callback
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: 'recovery'
          });
          
          if (error) {
            throw error;
          }
          
          if (data.session) {
            // User is now authenticated, redirect to reset password page
            notification.showSuccess('Email Verified', 'You can now reset your password.');
            navigate('/reset-password');
          } else {
            throw new Error('Failed to verify reset token');
          }
        } else if (type === 'magiclink' && token) {
          // Impersonation sign-in (or normal magiclink sign-in)
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

          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: 'magiclink'
          });

          if (error) throw error;

          if (data.session) {
            sessionManager.saveSession(data.session);
            const userId = data.session.user.id;

            // Before redirecting, validate access conditions:
            // - user must be active
            // - verification must satisfy configured requirements
            // - registration plan must be paid (tu_registration_paid) / subscription active
            const [{ data: userRow, error: userError }, { data: settingsRows }, { data: profileRow }] =
              await Promise.all([
                supabase
                  .from('tbl_users')
                  .select('tu_id, tu_email, tu_is_active, tu_email_verified, tu_mobile_verified, tu_registration_paid')
                  .eq('tu_id', userId)
                  .maybeSingle(),
                supabase
                  .from('tbl_system_settings')
                  .select('tss_setting_key, tss_setting_value')
                  .in('tss_setting_key', [
                    'email_verification_required',
                    'mobile_verification_required',
                    'either_verification_required',
                  ]),
                supabase
                  .from('tbl_user_profiles')
                  .select('tup_mobile')
                  .eq('tup_user_id', userId)
                  .maybeSingle(),
              ]);

            if (userError || !userRow) {
              throw new Error('Failed to load customer status after sign-in');
            }

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
                  verificationSettings: {
                    emailRequired,
                    mobileRequired,
                    eitherRequired,
                  },
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
          } else {
            throw new Error('Failed to verify sign-in token');
          }
        } else if (code) {
          // PKCE magic link callback (preferred path)
          try {
            sessionStorage.setItem('session_type', 'customer');
            sessionStorage.removeItem('admin_session_token');
            sessionStorage.removeItem('admin_session_data');
          } catch {
            // ignore
          }

          try {
            sessionManager.clearAllSessions();
            await supabase.auth.signOut();
          } catch {
            // ignore
          }

          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (!data.session) throw new Error('Failed to exchange auth code for session');

          sessionManager.saveSession(data.session);

          const userId = data.session.user.id;
          const [{ data: userRow, error: userError }, { data: settingsRows }, { data: profileRow }] =
            await Promise.all([
              supabase
                .from('tbl_users')
                .select('tu_id, tu_email, tu_is_active, tu_email_verified, tu_mobile_verified, tu_registration_paid')
                .eq('tu_id', userId)
                .maybeSingle(),
              supabase
                .from('tbl_system_settings')
                .select('tss_setting_key, tss_setting_value')
                .in('tss_setting_key', [
                  'email_verification_required',
                  'mobile_verification_required',
                  'either_verification_required',
                ]),
              supabase
                .from('tbl_user_profiles')
                .select('tup_mobile')
                .eq('tup_user_id', userId)
                .maybeSingle(),
            ]);

          if (userError || !userRow) {
            throw new Error('Failed to load customer status after sign-in');
          }

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
                verificationSettings: {
                  emailRequired,
                  mobileRequired,
                  eitherRequired,
                },
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
        } else {
          // Handle other auth callbacks or redirect to home
          navigate('/');
        }
      } catch (error) {
        console.error('Auth callback error:', error);
        setError(error.message || 'Authentication failed');
        if (type === 'recovery') {
          notification.showError('Authentication Failed', 'The reset link is invalid or has expired.');
          setTimeout(() => {
            navigate('/forgot-password');
          }, 3000);
        } else if (type === 'magiclink' || searchParams.get('code')) {
          notification.showError('Sign-in Failed', 'The sign-in link is invalid or has expired.');
          setTimeout(() => {
            navigate('/customer/login');
          }, 1500);
        } else {
          notification.showError('Authentication Failed', 'The link is invalid or has expired.');
          setTimeout(() => {
            navigate('/');
          }, 1500);
        }
      } finally {
        setLoading(false);
      }
    };

    handleAuthCallback();
  }, [searchParams, navigate, notification]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="bg-white p-8 rounded-2xl shadow-xl text-center">
            <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Loader className="h-8 w-8 text-indigo-600 animate-spin" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Verifying...</h2>
            <p className="text-gray-600">Please wait while we complete sign-in.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="bg-white p-8 rounded-2xl shadow-xl text-center">
            <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Verification Failed</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <p className="text-sm text-gray-500">You will be redirected to the forgot password page shortly.</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default AuthCallback;
