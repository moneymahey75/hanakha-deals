// import { supabase } from './supabase';
//
// export const generateOTP = (): string => {
//     return Math.floor(100000 + Math.random() * 900000).toString();
// };
//
// export const formatPhoneNumber = (countryCode: string, mobile: string): string => {
//     return `${countryCode}${mobile}`;
// };
//
// export const registerUser = async (userData: RegistrationFormData) => {
//     try {
//         // Generate a temporary password for Supabase Auth
//         const tempPassword = Math.random().toString(36).slice(-12) + 'A1!';
//
//         // Create user in Supabase Auth with temporary password
//         const { data: authData, error: authError } = await supabase.auth.signUp({
//             email: userData.email,
//             password: tempPassword,
//             options: {
//                 emailRedirectTo: undefined,
//             }
//         });
//
//         if (authError) {
//             if (authError.message === 'User already registered') {
//                 throw new Error('This email is already registered. Please try logging in or use a different email.');
//             }
//             throw authError;
//         }
//         if (!authData.user) throw new Error('User creation failed');
//
//         const userId = authData.user.id;
//         const fullMobile = formatPhoneNumber(userData.countryCode, userData.mobile);
//
//         console.log('Creating user with ID:', userId);
//
//         // Insert into tbl_users
//         const { error: userError } = await supabase
//             .from('tbl_users')
//             .insert({
//                 tu_id: userId,
//                 tu_email: userData.email,
//                 tu_user_type: 'customer',
//                 tu_is_verified: false,
//                 tu_email_verified: false,
//                 tu_mobile_verified: false,
//                 tu_is_active: true,
//             });
//
//         if (userError) {
//             console.error('User insert error:', userError);
//             throw userError;
//         }
//
//         console.log('User inserted successfully');
//
//         // Insert into tbl_user_profiles
//         const { error: profileError } = await supabase
//             .from('tbl_user_profiles')
//             .insert({
//                 tup_user_id: userId,
//                 tup_first_name: userData.firstName,
//                 tup_last_name: userData.lastName,
//                 tup_mobile: fullMobile,
//             });
//
//         if (profileError) {
//             console.error('Profile insert error:', profileError);
//             throw profileError;
//         }
//
//         console.log('Profile inserted successfully');
//
//         // Generate and save OTP
//         const otpCode = generateOTP();
//         const expiresAt = new Date();
//         expiresAt.setMinutes(expiresAt.getMinutes() + 10); // OTP expires in 10 minutes
//
//         console.log('Generated OTP:', otpCode);
//
//         const { error: otpError } = await supabase
//             .from('tbl_otp_verifications')
//             .insert({
//                 tov_user_id: userId,
//                 tov_otp_code: otpCode,
//                 tov_otp_type: 'mobile',
//                 tov_contact_info: fullMobile,
//                 tov_expires_at: expiresAt.toISOString(),
//                 tov_is_verified: false,
//                 tov_attempts: 0,
//             });
//
//         if (otpError) {
//             console.error('OTP insert error:', otpError);
//             throw otpError;
//         }
//
//         console.log('OTP saved successfully');
//
//         // Send OTP via Twilio
//         try {
//             await sendOTP(fullMobile, otpCode);
//             console.log('OTP sent successfully');
//         } catch (smsError) {
//             console.error('SMS sending failed:', smsError);
//             // Don't throw here - user is registered, just SMS failed
//         }
//
//         return { success: true, userId, mobile: fullMobile };
//     } catch (error) {
//         console.error('Registration error:', error);
//         throw new Error(error instanceof Error ? error.message : 'Registration failed');
//     }
// };
//
// export const sendOTP = async (mobile: string, otp: string) => {
//     try {
//         const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
//         const response = await fetch(`${supabaseUrl}/functions/v1/send-otp`, {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//                 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
//             },
//             body: JSON.stringify({ mobile, otp }),
//         });
//
//         if (!response.ok) {
//             const errorData = await response.json();
//             throw new Error(errorData.error || 'Failed to send OTP');
//         }
//
//         return { success: true };
//     } catch (error) {
//         console.error('Send OTP error:', error);
//         throw error;
//     }
// };
//
// export const verifyOTP = async (userId: string, otp: string) => {
//     try {
//         // Find valid OTP
//         const { data: otpData, error: otpFetchError } = await supabase
//             .from('tbl_otp_verifications')
//             .select('*')
//             .eq('tov_user_id', userId)
//             .eq('tov_otp_code', otp)
//             .eq('tov_otp_type', 'mobile')
//             .eq('tov_is_verified', false)
//             .gt('tov_expires_at', new Date().toISOString())
//             .order('tov_created_at', { ascending: false })
//             .limit(1);
//
//         if (otpFetchError) throw otpFetchError;
//         if (!otpData || otpData.length === 0) {
//             throw new Error('Invalid or expired OTP');
//         }
//
//         const otpRecord = otpData[0];
//
//         // Mark OTP as verified
//         const { error: otpUpdateError } = await supabase
//             .from('tbl_otp_verifications')
//             .update({ tov_is_verified: true })
//             .eq('tov_id', otpRecord.tov_id);
//
//         if (otpUpdateError) throw otpUpdateError;
//
//         // Update user mobile verification status
//         const { error: userUpdateError } = await supabase
//             .from('tbl_users')
//             .update({ tu_mobile_verified: true })
//             .eq('tu_id', userId);
//
//         if (userUpdateError) throw userUpdateError;
//
//         return { success: true };
//     } catch (error) {
//         console.error('OTP verification error:', error);
//         throw error;
//     }
// };
//
// export const resendOTP = async (userId: string, mobile: string) => {
//     try {
//         // Generate new OTP
//         const otpCode = generateOTP();
//         const expiresAt = new Date();
//         expiresAt.setMinutes(expiresAt.getMinutes() + 10);
//
//         // Save new OTP
//         const { error: otpError } = await supabase
//             .from('tbl_otp_verifications')
//             .insert({
//                 tov_user_id: userId,
//                 tov_otp_code: otpCode,
//                 tov_otp_type: 'mobile',
//                 tov_contact_info: mobile,
//                 tov_expires_at: expiresAt.toISOString(),
//             });
//
//         if (otpError) throw otpError;
//
//         // Send OTP via Twilio
//         await sendOTP(mobile, otpCode);
//
//         return { success: true };
//     } catch (error) {
//         console.error('Resend OTP error:', error);
//         throw error;
//     }
// };