import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { UserCheck, Mail, Smartphone, Save, AlertCircle, CheckCircle, Key, Settings, User, Lock } from 'lucide-react';

const RegistrationSettings: React.FC = () => {
    const [formData, setFormData] = useState({
        emailVerificationRequired: true,
        mobileVerificationRequired: true,
        referralMandatory: false,
        eitherVerificationRequired: false,
        testOtpEnabled: false,
        testOtpCode: '123456',
        // Username validation settings
        usernameMinLength: 8,
        usernameMaxLength: 30,
        usernameAllowSpaces: false,
        usernameAllowSpecialChars: true,
        usernameAllowedSpecialChars: '._-',
        usernameForceLowerCase: true,
        usernameUniqueRequired: true,
        usernameAllowNumbers: true,
        usernameMustStartWithLetter: true,
        // Password validation settings
        passwordMinLength: 8,
        passwordMaxLength: 128,
        passwordRequireUppercase: true,
        passwordRequireLowercase: true,
        passwordRequireNumbers: true,
        passwordRequireSpecialChars: true,
        passwordAllowedSpecialChars: '!@#$%^&*()_+-=[]{};:\'"|,.<>?/~`',
        passwordPreventCommon: true,
        passwordPreventSequences: true,
        passwordPreventRepeats: true,
        passwordMaxConsecutive: 3,
        passwordMinUniqueChars: 5,
        passwordExpiryDays: 90,
        passwordHistoryCount: 5
    });
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const { data, error } = await supabase
                .from('tbl_system_settings')
                .select('tss_setting_key, tss_setting_value')
                .in('tss_setting_key', [
                    'email_verification_required',
                    'mobile_verification_required',
                    'referral_mandatory',
                    'either_verification_required',
                    'test_otp_enabled',
                    'test_otp_code',
                    // Username settings
                    'username_min_length',
                    'username_max_length',
                    'username_allow_spaces',
                    'username_allow_special_chars',
                    'username_allowed_special_chars',
                    'username_force_lower_case',
                    'username_unique_required',
                    'username_allow_numbers',
                    'username_must_start_with_letter',
                    // Password settings
                    'password_min_length',
                    'password_max_length',
                    'password_require_uppercase',
                    'password_require_lowercase',
                    'password_require_numbers',
                    'password_require_special_chars',
                    'password_allowed_special_chars',
                    'password_prevent_common',
                    'password_prevent_sequences',
                    'password_prevent_repeats',
                    'password_max_consecutive',
                    'password_min_unique_chars',
                    'password_expiry_days',
                    'password_history_count'
                ]);

            if (error) {
                console.warn('Failed to load settings from database, using defaults:', error);
                setDefaultSettings();
            } else {
                const settingsMap = data?.reduce((acc: any, setting: any) => {
                    try {
                        acc[setting.tss_setting_key] = JSON.parse(setting.tss_setting_value);
                    } catch (parseError) {
                        console.warn('Failed to parse setting value:', setting.tss_setting_key, parseError);
                        setDefaultSettings();
                    }
                    return acc;
                }, {}) || {};

                setFormData({
                    emailVerificationRequired: settingsMap.email_verification_required ?? true,
                    mobileVerificationRequired: settingsMap.mobile_verification_required ?? true,
                    referralMandatory: settingsMap.referral_mandatory ?? false,
                    eitherVerificationRequired: settingsMap.either_verification_required ?? false,
                    testOtpEnabled: settingsMap.test_otp_enabled ?? false,
                    testOtpCode: settingsMap.test_otp_code ?? '123456',
                    // Username settings with defaults
                    usernameMinLength: settingsMap.username_min_length ?? 8,
                    usernameMaxLength: settingsMap.username_max_length ?? 30,
                    usernameAllowSpaces: settingsMap.username_allow_spaces ?? false,
                    usernameAllowSpecialChars: settingsMap.username_allow_special_chars ?? true,
                    usernameAllowedSpecialChars: settingsMap.username_allowed_special_chars ?? '._-',
                    usernameForceLowerCase: settingsMap.username_force_lower_case ?? true,
                    usernameUniqueRequired: settingsMap.username_unique_required ?? true,
                    usernameAllowNumbers: settingsMap.username_allow_numbers ?? true,
                    usernameMustStartWithLetter: settingsMap.username_must_start_with_letter ?? true,
                    // Password settings with defaults
                    passwordMinLength: settingsMap.password_min_length ?? 8,
                    passwordMaxLength: settingsMap.password_max_length ?? 128,
                    passwordRequireUppercase: settingsMap.password_require_uppercase ?? true,
                    passwordRequireLowercase: settingsMap.password_require_lowercase ?? true,
                    passwordRequireNumbers: settingsMap.password_require_numbers ?? true,
                    passwordRequireSpecialChars: settingsMap.password_require_special_chars ?? true,
                    passwordAllowedSpecialChars: settingsMap.password_allowed_special_chars ?? '!@#$%^&*()_+-=[]{};:\'"|,.<>?/~`',
                    passwordPreventCommon: settingsMap.password_prevent_common ?? true,
                    passwordPreventSequences: settingsMap.password_prevent_sequences ?? true,
                    passwordPreventRepeats: settingsMap.password_prevent_repeats ?? true,
                    passwordMaxConsecutive: settingsMap.password_max_consecutive ?? 3,
                    passwordMinUniqueChars: settingsMap.password_min_unique_chars ?? 5,
                    passwordExpiryDays: settingsMap.password_expiry_days ?? 90,
                    passwordHistoryCount: settingsMap.password_history_count ?? 5
                });
            }
        } catch (error) {
            console.error('Unexpected error loading settings:', error);
            setDefaultSettings();
        } finally {
            setLoading(false);
        }
    };

    const setDefaultSettings = () => {
        setFormData({
            emailVerificationRequired: true,
            mobileVerificationRequired: true,
            referralMandatory: false,
            eitherVerificationRequired: false,
            testOtpEnabled: false,
            testOtpCode: '123456',
            usernameMinLength: 8,
            usernameMaxLength: 30,
            usernameAllowSpaces: false,
            usernameAllowSpecialChars: true,
            usernameAllowedSpecialChars: '._-',
            usernameForceLowerCase: true,
            usernameUniqueRequired: true,
            usernameAllowNumbers: true,
            usernameMustStartWithLetter: true,
            passwordMinLength: 8,
            passwordMaxLength: 128,
            passwordRequireUppercase: true,
            passwordRequireLowercase: true,
            passwordRequireNumbers: true,
            passwordRequireSpecialChars: true,
            passwordAllowedSpecialChars: '!@#$%^&*()_+-=[]{};:\'"|,.<>?/~`',
            passwordPreventCommon: true,
            passwordPreventSequences: true,
            passwordPreventRepeats: true,
            passwordMaxConsecutive: 3,
            passwordMinUniqueChars: 5,
            passwordExpiryDays: 90,
            passwordHistoryCount: 5
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setSaveResult(null);

        try {
            const updates = [
                // Existing settings
                {
                    tss_setting_key: 'email_verification_required',
                    tss_setting_value: JSON.stringify(formData.emailVerificationRequired),
                    tss_description: 'Require email verification during registration'
                },
                {
                    tss_setting_key: 'mobile_verification_required',
                    tss_setting_value: JSON.stringify(formData.mobileVerificationRequired),
                    tss_description: 'Require mobile verification during registration'
                },
                {
                    tss_setting_key: 'referral_mandatory',
                    tss_setting_value: JSON.stringify(formData.referralMandatory),
                    tss_description: 'Make referral code mandatory for registration'
                },
                {
                    tss_setting_key: 'either_verification_required',
                    tss_setting_value: JSON.stringify(formData.eitherVerificationRequired),
                    tss_description: 'Allow users to verify either email or mobile (but not both)'
                },
                {
                    tss_setting_key: 'test_otp_enabled',
                    tss_setting_value: JSON.stringify(formData.testOtpEnabled),
                    tss_description: 'Enable test OTP for development/testing purposes'
                },
                // Username settings
                {
                    tss_setting_key: 'username_min_length',
                    tss_setting_value: JSON.stringify(formData.usernameMinLength),
                    tss_description: 'Minimum length required for usernames'
                },
                {
                    tss_setting_key: 'username_max_length',
                    tss_setting_value: JSON.stringify(formData.usernameMaxLength),
                    tss_description: 'Maximum length allowed for usernames'
                },
                {
                    tss_setting_key: 'username_allow_spaces',
                    tss_setting_value: JSON.stringify(formData.usernameAllowSpaces),
                    tss_description: 'Allow spaces in usernames'
                },
                {
                    tss_setting_key: 'username_allow_special_chars',
                    tss_setting_value: JSON.stringify(formData.usernameAllowSpecialChars),
                    tss_description: 'Allow special characters in usernames'
                },
                {
                    tss_setting_key: 'username_allowed_special_chars',
                    tss_setting_value: JSON.stringify(formData.usernameAllowedSpecialChars),
                    tss_description: 'List of allowed special characters for usernames'
                },
                {
                    tss_setting_key: 'username_force_lower_case',
                    tss_setting_value: JSON.stringify(formData.usernameForceLowerCase),
                    tss_description: 'Force usernames to lowercase'
                },
                {
                    tss_setting_key: 'username_unique_required',
                    tss_setting_value: JSON.stringify(formData.usernameUniqueRequired),
                    tss_description: 'Require usernames to be unique'
                },
                {
                    tss_setting_key: 'username_allow_numbers',
                    tss_setting_value: JSON.stringify(formData.usernameAllowNumbers),
                    tss_description: 'Allow numbers in usernames'
                },
                {
                    tss_setting_key: 'username_must_start_with_letter',
                    tss_setting_value: JSON.stringify(formData.usernameMustStartWithLetter),
                    tss_description: 'Username must start with a letter'
                },
                // Password settings
                {
                    tss_setting_key: 'password_min_length',
                    tss_setting_value: JSON.stringify(formData.passwordMinLength),
                    tss_description: 'Minimum length required for passwords'
                },
                {
                    tss_setting_key: 'password_max_length',
                    tss_setting_value: JSON.stringify(formData.passwordMaxLength),
                    tss_description: 'Maximum length allowed for passwords'
                },
                {
                    tss_setting_key: 'password_require_uppercase',
                    tss_setting_value: JSON.stringify(formData.passwordRequireUppercase),
                    tss_description: 'Require at least one uppercase letter in passwords'
                },
                {
                    tss_setting_key: 'password_require_lowercase',
                    tss_setting_value: JSON.stringify(formData.passwordRequireLowercase),
                    tss_description: 'Require at least one lowercase letter in passwords'
                },
                {
                    tss_setting_key: 'password_require_numbers',
                    tss_setting_value: JSON.stringify(formData.passwordRequireNumbers),
                    tss_description: 'Require at least one number in passwords'
                },
                {
                    tss_setting_key: 'password_require_special_chars',
                    tss_setting_value: JSON.stringify(formData.passwordRequireSpecialChars),
                    tss_description: 'Require at least one special character in passwords'
                },
                {
                    tss_setting_key: 'password_allowed_special_chars',
                    tss_setting_value: JSON.stringify(formData.passwordAllowedSpecialChars),
                    tss_description: 'List of allowed special characters for passwords'
                },
                {
                    tss_setting_key: 'password_prevent_common',
                    tss_setting_value: JSON.stringify(formData.passwordPreventCommon),
                    tss_description: 'Prevent common passwords'
                },
                {
                    tss_setting_key: 'password_prevent_sequences',
                    tss_setting_value: JSON.stringify(formData.passwordPreventSequences),
                    tss_description: 'Prevent sequential characters in passwords'
                },
                {
                    tss_setting_key: 'password_prevent_repeats',
                    tss_setting_value: JSON.stringify(formData.passwordPreventRepeats),
                    tss_description: 'Prevent repeated characters in passwords'
                },
                {
                    tss_setting_key: 'password_max_consecutive',
                    tss_setting_value: JSON.stringify(formData.passwordMaxConsecutive),
                    tss_description: 'Maximum consecutive identical characters allowed'
                },
                {
                    tss_setting_key: 'password_min_unique_chars',
                    tss_setting_value: JSON.stringify(formData.passwordMinUniqueChars),
                    tss_description: 'Minimum number of unique characters required'
                },
                {
                    tss_setting_key: 'password_expiry_days',
                    tss_setting_value: JSON.stringify(formData.passwordExpiryDays),
                    tss_description: 'Number of days before password expires'
                },
                {
                    tss_setting_key: 'password_history_count',
                    tss_setting_value: JSON.stringify(formData.passwordHistoryCount),
                    tss_description: 'Number of previous passwords to remember'
                }
            ];

            // Only add test OTP code if test OTP is enabled
            if (formData.testOtpEnabled) {
                updates.push({
                    tss_setting_key: 'test_otp_code',
                    tss_setting_value: JSON.stringify(formData.testOtpCode),
                    tss_description: 'Test OTP code for development/testing'
                });
            } else {
                // Remove test OTP code from database when disabled
                const { error: deleteError } = await supabase
                    .from('tbl_system_settings')
                    .delete()
                    .eq('tss_setting_key', 'test_otp_code');

                if (deleteError) {
                    console.warn('Failed to delete test OTP code:', deleteError);
                }
            }

            for (const update of updates) {
                const { error } = await supabase
                    .from('tbl_system_settings')
                    .upsert(update, {
                        onConflict: 'tss_setting_key'
                    });

                if (error) throw error;
            }

            setSaveResult({
                success: true,
                message: 'Registration settings updated successfully!'
            });
        } catch (error) {
            console.error('Failed to save settings:', error);
            setSaveResult({
                success: false,
                message: 'Failed to save settings. Please try again.'
            });
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, type, checked, value } = e.target;

        if (name === 'testOtpCode') {
            // Only allow 6 digits for OTP code
            if (/^\d{0,6}$/.test(value)) {
                setFormData(prev => ({ ...prev, [name]: value }));
            }
            return;
        }

        // Handle username validation settings
        if (name === 'usernameMinLength' || name === 'usernameMaxLength') {
            const numValue = parseInt(value) || 0;
            if (numValue >= 0) {
                setFormData(prev => ({ ...prev, [name]: numValue }));
            }
            return;
        }

        if (name === 'usernameAllowedSpecialChars') {
            // Sanitize special characters input
            const sanitizedValue = value.replace(/[^!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/g, '');
            setFormData(prev => ({ ...prev, [name]: sanitizedValue }));
            return;
        }

        // Handle password validation settings
        if (name === 'passwordMinLength' || name === 'passwordMaxLength' ||
            name === 'passwordMaxConsecutive' || name === 'passwordMinUniqueChars' ||
            name === 'passwordExpiryDays' || name === 'passwordHistoryCount') {
            const numValue = parseInt(value) || 0;
            if (numValue >= 0) {
                setFormData(prev => ({ ...prev, [name]: numValue }));
            }
            return;
        }

        if (name === 'passwordAllowedSpecialChars') {
            // Allow all special characters for passwords
            setFormData(prev => ({ ...prev, [name]: value }));
            return;
        }

        if (name === 'eitherVerificationRequired' && checked) {
            setFormData(prev => ({
                ...prev,
                eitherVerificationRequired: checked,
                emailVerificationRequired: false,
                mobileVerificationRequired: false
            }));
        } else if (name === 'emailVerificationRequired' && checked) {
            setFormData(prev => ({
                ...prev,
                emailVerificationRequired: checked,
                eitherVerificationRequired: false
            }));
        } else if (name === 'mobileVerificationRequired' && checked) {
            setFormData(prev => ({
                ...prev,
                mobileVerificationRequired: checked,
                eitherVerificationRequired: false
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                [name]: type === 'checkbox' ? checked : value
            }));
        }
    };

    // Generate username validation rules summary
    const getUsernameRulesSummary = () => {
        const rules = [];

        rules.push(`Minimum ${formData.usernameMinLength} characters`);
        rules.push(`Maximum ${formData.usernameMaxLength} characters`);

        if (!formData.usernameAllowSpaces) {
            rules.push('No spaces allowed');
        }

        if (formData.usernameMustStartWithLetter) {
            rules.push('Must start with a letter');
        }

        if (formData.usernameAllowNumbers) {
            rules.push('Numbers allowed');
        } else {
            rules.push('No numbers allowed');
        }

        if (formData.usernameAllowSpecialChars && formData.usernameAllowedSpecialChars) {
            rules.push(`Special characters allowed: ${formData.usernameAllowedSpecialChars}`);
        } else {
            rules.push('No special characters allowed');
        }

        if (formData.usernameForceLowerCase) {
            rules.push('Lowercase only');
        }

        if (formData.usernameUniqueRequired) {
            rules.push('Must be unique');
        }

        return rules;
    };

    // Generate password validation rules summary
    const getPasswordRulesSummary = () => {
        const rules = [];

        rules.push(`Minimum ${formData.passwordMinLength} characters`);
        rules.push(`Maximum ${formData.passwordMaxLength} characters`);

        if (formData.passwordRequireUppercase) {
            rules.push('At least one uppercase letter (A-Z)');
        }

        if (formData.passwordRequireLowercase) {
            rules.push('At least one lowercase letter (a-z)');
        }

        if (formData.passwordRequireNumbers) {
            rules.push('At least one number (0-9)');
        }

        if (formData.passwordRequireSpecialChars) {
            rules.push(`At least one special character: ${formData.passwordAllowedSpecialChars}`);
        }

        if (formData.passwordPreventCommon) {
            rules.push('Cannot be a common password');
        }

        if (formData.passwordPreventSequences) {
            rules.push('Cannot contain sequences (abc, 123, etc.)');
        }

        if (formData.passwordPreventRepeats) {
            rules.push(`Maximum ${formData.passwordMaxConsecutive} consecutive identical characters`);
        }

        if (formData.passwordMinUniqueChars > 1) {
            rules.push(`At least ${formData.passwordMinUniqueChars} unique characters`);
        }

        if (formData.passwordExpiryDays > 0) {
            rules.push(`Expires after ${formData.passwordExpiryDays} days`);
        }

        if (formData.passwordHistoryCount > 0) {
            rules.push(`Cannot reuse last ${formData.passwordHistoryCount} passwords`);
        }

        return rules;
    };

    if (loading) {
        return (
            <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                    <span className="ml-3 text-gray-600">Loading settings...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center space-x-3 mb-6">
                <div className="bg-green-100 p-3 rounded-lg">
                    <UserCheck className="h-6 w-6 text-green-600" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">Registration Settings</h3>
                    <p className="text-gray-600">Configure user registration requirements and verification</p>
                </div>
            </div>

            {saveResult && (
                <div className={`border rounded-lg p-4 mb-6 ${
                    saveResult.success
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                }`}>
                    <div className="flex items-center space-x-2">
                        {saveResult.success ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                            <AlertCircle className="h-5 w-5 text-red-600" />
                        )}
                        <span className={`text-sm font-medium ${
                            saveResult.success ? 'text-green-800' : 'text-red-800'
                        }`}>
                            {saveResult.message}
                        </span>
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-6">

                    {/* Email Verification */}
                    <div className="border border-gray-200 rounded-lg p-6">
                        <div className="flex items-start space-x-4">
                            <div className="bg-blue-100 p-2 rounded-lg mt-1">
                                <Mail className="h-5 w-5 text-blue-600" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-lg font-medium text-gray-900">Email Verification</h4>
                                        <p className="text-sm text-gray-600 mt-1">
                                            Require users to verify their email address during registration
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="emailVerificationRequired"
                                            checked={formData.emailVerificationRequired}
                                            onChange={handleChange}
                                            disabled={formData.eitherVerificationRequired}
                                            className="sr-only peer"
                                        />
                                        <div className={`w-11 h-6 rounded-full peer 
                                            ${formData.eitherVerificationRequired
                                            ? 'bg-gray-300'
                                            : 'bg-gray-200 peer-checked:bg-blue-600'} 
                                            peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 
                                            after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                                            after:bg-white after:border-gray-300 after:border after:rounded-full 
                                            after:h-5 after:w-5 after:transition-all 
                                            ${formData.emailVerificationRequired ? 'after:translate-x-full after:border-white' : ''}`}>
                                        </div>
                                    </label>
                                </div>
                                <div className="mt-3 text-sm text-gray-500">
                                    {formData.emailVerificationRequired ? (
                                        <span className="text-green-600">✓ Email verification is required</span>
                                    ) : (
                                        <span className="text-gray-500">Email verification is optional</span>
                                    )}
                                    {formData.eitherVerificationRequired && (
                                        <span className="text-gray-500"> (disabled when "Either Verification" is enabled)</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Mobile Verification */}
                    <div className="border border-gray-200 rounded-lg p-6">
                        <div className="flex items-start space-x-4">
                            <div className="bg-green-100 p-2 rounded-lg mt-1">
                                <Smartphone className="h-5 w-5 text-green-600" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-lg font-medium text-gray-900">Mobile Verification</h4>
                                        <p className="text-sm text-gray-600 mt-1">
                                            Require users to verify their mobile number via SMS OTP
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="mobileVerificationRequired"
                                            checked={formData.mobileVerificationRequired}
                                            onChange={handleChange}
                                            disabled={formData.eitherVerificationRequired}
                                            className="sr-only peer"
                                        />
                                        <div className={`w-11 h-6 rounded-full peer 
                                            ${formData.eitherVerificationRequired
                                            ? 'bg-gray-300'
                                            : 'bg-gray-200 peer-checked:bg-green-600'} 
                                            peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 
                                            after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                                            after:bg-white after:border-gray-300 after:border after:rounded-full 
                                            after:h-5 after:w-5 after:transition-all 
                                            ${formData.mobileVerificationRequired ? 'after:translate-x-full after:border-white' : ''}`}>
                                        </div>
                                    </label>
                                </div>
                                <div className="mt-3 text-sm text-gray-500">
                                    {formData.mobileVerificationRequired ? (
                                        <span className="text-green-600">✓ Mobile verification is required</span>
                                    ) : (
                                        <span className="text-gray-500">Mobile verification is optional</span>
                                    )}
                                    {formData.eitherVerificationRequired && (
                                        <span className="text-gray-500"> (disabled when "Either Verification" is enabled)</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Either Verification */}
                    <div className="border border-gray-200 rounded-lg p-6">
                        <div className="flex items-start space-x-4">
                            <div className="bg-orange-100 p-2 rounded-lg mt-1">
                                <UserCheck className="h-5 w-5 text-orange-600" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-lg font-medium text-gray-900">Either Verification</h4>
                                        <p className="text-sm text-gray-600 mt-1">
                                            Allow users to verify either email or mobile (but not both required)
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="eitherVerificationRequired"
                                            checked={formData.eitherVerificationRequired}
                                            onChange={handleChange}
                                            disabled={formData.emailVerificationRequired || formData.mobileVerificationRequired}
                                            className="sr-only peer"
                                        />
                                        <div className={`w-11 h-6 rounded-full peer 
                                            ${(formData.emailVerificationRequired || formData.mobileVerificationRequired)
                                            ? 'bg-gray-300'
                                            : 'bg-gray-200 peer-checked:bg-orange-600'} 
                                            peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 
                                            after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                                            after:bg-white after:border-gray-300 after:border after:rounded-full 
                                            after:h-5 after:w-5 after:transition-all 
                                            ${formData.eitherVerificationRequired ? 'after:translate-x-full after:border-white' : ''}`}>
                                        </div>
                                    </label>
                                </div>
                                <div className="mt-3 text-sm text-gray-500">
                                    {formData.eitherVerificationRequired ? (
                                        <span className="text-orange-600">✓ Users can verify either email or mobile</span>
                                    ) : (
                                        <span className="text-gray-500">Both email and mobile verification are controlled separately</span>
                                    )}
                                    {(formData.emailVerificationRequired || formData.mobileVerificationRequired) && (
                                        <span className="text-gray-500"> (disabled when email or mobile verification is enabled)</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Referral Mandatory */}
                    <div className="border border-gray-200 rounded-lg p-6">
                        <div className="flex items-start space-x-4">
                            <div className="bg-purple-100 p-2 rounded-lg mt-1">
                                <UserCheck className="h-5 w-5 text-purple-600" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-lg font-medium text-gray-900">Referral Requirement</h4>
                                        <p className="text-sm text-gray-600 mt-1">
                                            Make referral code mandatory for new user registration
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="referralMandatory"
                                            checked={formData.referralMandatory}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                    </label>
                                </div>
                                <div className="mt-3 text-sm text-gray-500">
                                    {formData.referralMandatory ? (
                                        <span className="text-purple-600">✓ Referral code is mandatory</span>
                                    ) : (
                                        <span className="text-gray-500">Referral code is optional</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Test OTP Settings */}
                    <div className="border border-yellow-200 rounded-lg p-6 bg-yellow-50">
                        <div className="flex items-start space-x-4">
                            <div className="bg-yellow-100 p-2 rounded-lg mt-1">
                                <Key className="h-5 w-5 text-yellow-600" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-lg font-medium text-gray-900">Test OTP Configuration</h4>
                                        <p className="text-sm text-gray-600 mt-1">
                                            Enable test OTP for development and testing purposes
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="testOtpEnabled"
                                            checked={formData.testOtpEnabled}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-yellow-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-600"></div>
                                    </label>
                                </div>

                                <div className="mt-3 text-sm text-gray-500">
                                    {formData.testOtpEnabled ? (
                                        <span className="text-yellow-600">✓ Test OTP is enabled</span>
                                    ) : (
                                        <span className="text-gray-500">Test OTP is disabled</span>
                                    )}
                                </div>

                                {/* Test OTP Code Input */}
                                {formData.testOtpEnabled && (
                                    <div className="mt-4">
                                        <label htmlFor="testOtpCode" className="block text-sm font-medium text-gray-700 mb-2">
                                            Test OTP Code
                                        </label>
                                        <div className="flex items-center space-x-3">
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <Settings className="h-4 w-4 text-gray-400" />
                                                </div>
                                                <input
                                                    type="text"
                                                    id="testOtpCode"
                                                    name="testOtpCode"
                                                    value={formData.testOtpCode}
                                                    onChange={handleChange}
                                                    maxLength={6}
                                                    placeholder="123456"
                                                    className="block w-32 pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-yellow-500 focus:border-yellow-500 text-center font-mono text-lg"
                                                />
                                            </div>
                                            <span className="text-sm text-gray-500">6-digit code</span>
                                        </div>
                                        <p className="text-xs text-yellow-700 mt-2">
                                            ⚠️ This code will work for all OTP verifications when test mode is enabled.
                                            Use only in development/testing environments.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Username Validation Settings */}
                <div className="border border-blue-200 rounded-lg p-6 bg-blue-50">
                    <div className="flex items-start space-x-4">
                        <div className="bg-blue-100 p-2 rounded-lg mt-1">
                            <User className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="flex-1">
                            <h4 className="text-lg font-medium text-gray-900 mb-4">Username Validation Rules</h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Minimum Length */}
                                <div>
                                    <label htmlFor="usernameMinLength" className="block text-sm font-medium text-gray-700 mb-2">
                                        Minimum Length
                                    </label>
                                    <input
                                        type="number"
                                        id="usernameMinLength"
                                        name="usernameMinLength"
                                        value={formData.usernameMinLength}
                                        onChange={handleChange}
                                        min="3"
                                        max="50"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                {/* Maximum Length */}
                                <div>
                                    <label htmlFor="usernameMaxLength" className="block text-sm font-medium text-gray-700 mb-2">
                                        Maximum Length
                                    </label>
                                    <input
                                        type="number"
                                        id="usernameMaxLength"
                                        name="usernameMaxLength"
                                        value={formData.usernameMaxLength}
                                        onChange={handleChange}
                                        min="5"
                                        max="100"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                {/* Allow Spaces */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label htmlFor="usernameAllowSpaces" className="text-sm font-medium text-gray-700">
                                            Allow Spaces
                                        </label>
                                        <p className="text-sm text-gray-500">Allow spaces in usernames</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="usernameAllowSpaces"
                                            checked={formData.usernameAllowSpaces}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>

                                {/* Must Start with Letter */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label htmlFor="usernameMustStartWithLetter" className="text-sm font-medium text-gray-700">
                                            Start with Letter
                                        </label>
                                        <p className="text-sm text-gray-500">Username must begin with a letter</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="usernameMustStartWithLetter"
                                            checked={formData.usernameMustStartWithLetter}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>

                                {/* Allow Numbers */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label htmlFor="usernameAllowNumbers" className="text-sm font-medium text-gray-700">
                                            Allow Numbers
                                        </label>
                                        <p className="text-sm text-gray-500">Allow numbers in usernames</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="usernameAllowNumbers"
                                            checked={formData.usernameAllowNumbers}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>

                                {/* Force Lowercase */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label htmlFor="usernameForceLowerCase" className="text-sm font-medium text-gray-700">
                                            Force Lowercase
                                        </label>
                                        <p className="text-sm text-gray-500">Convert to lowercase automatically</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="usernameForceLowerCase"
                                            checked={formData.usernameForceLowerCase}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>

                                {/* Unique Required */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label htmlFor="usernameUniqueRequired" className="text-sm font-medium text-gray-700">
                                            Unique Required
                                        </label>
                                        <p className="text-sm text-gray-500">Usernames must be unique</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="usernameUniqueRequired"
                                            checked={formData.usernameUniqueRequired}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>

                                {/* Allow Special Characters */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label htmlFor="usernameAllowSpecialChars" className="text-sm font-medium text-gray-700">
                                            Allow Special Characters
                                        </label>
                                        <p className="text-sm text-gray-500">Allow special characters in usernames</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="usernameAllowSpecialChars"
                                            checked={formData.usernameAllowSpecialChars}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>

                                {/* Allowed Special Characters */}
                                {formData.usernameAllowSpecialChars && (
                                    <div className="md:col-span-2">
                                        <label htmlFor="usernameAllowedSpecialChars" className="block text-sm font-medium text-gray-700 mb-2">
                                            Allowed Special Characters
                                        </label>
                                        <input
                                            type="text"
                                            id="usernameAllowedSpecialChars"
                                            name="usernameAllowedSpecialChars"
                                            value={formData.usernameAllowedSpecialChars}
                                            onChange={handleChange}
                                            placeholder="._-"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-mono"
                                        />
                                        <p className="text-sm text-gray-500 mt-1">Enter allowed special characters (e.g., ._-)</p>
                                    </div>
                                )}
                            </div>

                            {/* Username Rules Summary */}
                            <div className="mt-6 p-4 bg-white border border-gray-200 rounded-lg">
                                <h5 className="text-sm font-medium text-gray-900 mb-2">Current Username Rules:</h5>
                                <div className="text-sm text-gray-600">
                                    <ul className="list-disc list-inside space-y-1">
                                        {getUsernameRulesSummary().map((rule, index) => (
                                            <li key={index}>{rule}</li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="mt-3 text-xs text-gray-500">
                                    <p>Example valid usernames: {formData.usernameMustStartWithLetter ? 'john_doe123' : '123john'}, user.name</p>
                                    <p>Example invalid usernames: {formData.usernameMinLength > 3 ? 'short' : 'tooolongusername'}, user name{!formData.usernameAllowSpaces ? '' : ' (if spaces not allowed)'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Password Validation Settings */}
                <div className="border border-purple-200 rounded-lg p-6 bg-purple-50">
                    <div className="flex items-start space-x-4">
                        <div className="bg-purple-100 p-2 rounded-lg mt-1">
                            <Lock className="h-5 w-5 text-purple-600" />
                        </div>
                        <div className="flex-1">
                            <h4 className="text-lg font-medium text-gray-900 mb-4">Password Validation Rules</h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Minimum Length */}
                                <div>
                                    <label htmlFor="passwordMinLength" className="block text-sm font-medium text-gray-700 mb-2">
                                        Minimum Length
                                    </label>
                                    <input
                                        type="number"
                                        id="passwordMinLength"
                                        name="passwordMinLength"
                                        value={formData.passwordMinLength}
                                        onChange={handleChange}
                                        min="6"
                                        max="256"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                                    />
                                </div>

                                {/* Maximum Length */}
                                <div>
                                    <label htmlFor="passwordMaxLength" className="block text-sm font-medium text-gray-700 mb-2">
                                        Maximum Length
                                    </label>
                                    <input
                                        type="number"
                                        id="passwordMaxLength"
                                        name="passwordMaxLength"
                                        value={formData.passwordMaxLength}
                                        onChange={handleChange}
                                        min="8"
                                        max="512"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                                    />
                                </div>

                                {/* Require Uppercase */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label htmlFor="passwordRequireUppercase" className="text-sm font-medium text-gray-700">
                                            Require Uppercase
                                        </label>
                                        <p className="text-sm text-gray-500">At least one capital letter (A-Z)</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="passwordRequireUppercase"
                                            checked={formData.passwordRequireUppercase}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                    </label>
                                </div>

                                {/* Require Lowercase */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label htmlFor="passwordRequireLowercase" className="text-sm font-medium text-gray-700">
                                            Require Lowercase
                                        </label>
                                        <p className="text-sm text-gray-500">At least one small letter (a-z)</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="passwordRequireLowercase"
                                            checked={formData.passwordRequireLowercase}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                    </label>
                                </div>

                                {/* Require Numbers */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label htmlFor="passwordRequireNumbers" className="text-sm font-medium text-gray-700">
                                            Require Numbers
                                        </label>
                                        <p className="text-sm text-gray-500">At least one number (0-9)</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="passwordRequireNumbers"
                                            checked={formData.passwordRequireNumbers}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                    </label>
                                </div>

                                {/* Require Special Characters */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label htmlFor="passwordRequireSpecialChars" className="text-sm font-medium text-gray-700">
                                            Require Special Characters
                                        </label>
                                        <p className="text-sm text-gray-500">At least one special character</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="passwordRequireSpecialChars"
                                            checked={formData.passwordRequireSpecialChars}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                    </label>
                                </div>

                                {/* Allowed Special Characters */}
                                {formData.passwordRequireSpecialChars && (
                                    <div className="md:col-span-2">
                                        <label htmlFor="passwordAllowedSpecialChars" className="block text-sm font-medium text-gray-700 mb-2">
                                            Allowed Special Characters
                                        </label>
                                        <input
                                            type="text"
                                            id="passwordAllowedSpecialChars"
                                            name="passwordAllowedSpecialChars"
                                            value={formData.passwordAllowedSpecialChars}
                                            onChange={handleChange}
                                            placeholder="!@#$%^&*()_+-=[]{};:'|,.<>?/~`"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500 font-mono"
                                        />
                                        <p className="text-sm text-gray-500 mt-1">Enter allowed special characters</p>
                                    </div>
                                )}

                                {/* Prevent Common Passwords */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label htmlFor="passwordPreventCommon" className="text-sm font-medium text-gray-700">
                                            Prevent Common Passwords
                                        </label>
                                        <p className="text-sm text-gray-500">Block common passwords (password123, etc.)</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="passwordPreventCommon"
                                            checked={formData.passwordPreventCommon}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                    </label>
                                </div>

                                {/* Prevent Sequences */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label htmlFor="passwordPreventSequences" className="text-sm font-medium text-gray-700">
                                            Prevent Sequences
                                        </label>
                                        <p className="text-sm text-gray-500">Block sequences (abc, 123, etc.)</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="passwordPreventSequences"
                                            checked={formData.passwordPreventSequences}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                    </label>
                                </div>

                                {/* Prevent Repeats */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label htmlFor="passwordPreventRepeats" className="text-sm font-medium text-gray-700">
                                            Prevent Character Repeats
                                        </label>
                                        <p className="text-sm text-gray-500">Limit consecutive identical characters</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="passwordPreventRepeats"
                                            checked={formData.passwordPreventRepeats}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                    </label>
                                </div>

                                {/* Max Consecutive Characters */}
                                {formData.passwordPreventRepeats && (
                                    <div>
                                        <label htmlFor="passwordMaxConsecutive" className="block text-sm font-medium text-gray-700 mb-2">
                                            Max Consecutive Characters
                                        </label>
                                        <input
                                            type="number"
                                            id="passwordMaxConsecutive"
                                            name="passwordMaxConsecutive"
                                            value={formData.passwordMaxConsecutive}
                                            onChange={handleChange}
                                            min="2"
                                            max="10"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                                        />
                                    </div>
                                )}

                                {/* Minimum Unique Characters */}
                                <div>
                                    <label htmlFor="passwordMinUniqueChars" className="block text-sm font-medium text-gray-700 mb-2">
                                        Minimum Unique Characters
                                    </label>
                                    <input
                                        type="number"
                                        id="passwordMinUniqueChars"
                                        name="passwordMinUniqueChars"
                                        value={formData.passwordMinUniqueChars}
                                        onChange={handleChange}
                                        min="3"
                                        max="20"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                                    />
                                </div>

                                {/* Password Expiry */}
                                <div>
                                    <label htmlFor="passwordExpiryDays" className="block text-sm font-medium text-gray-700 mb-2">
                                        Password Expiry (Days)
                                    </label>
                                    <input
                                        type="number"
                                        id="passwordExpiryDays"
                                        name="passwordExpiryDays"
                                        value={formData.passwordExpiryDays}
                                        onChange={handleChange}
                                        min="0"
                                        max="365"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                                    />
                                    <p className="text-sm text-gray-500 mt-1">0 = never expires</p>
                                </div>

                                {/* Password History */}
                                <div>
                                    <label htmlFor="passwordHistoryCount" className="block text-sm font-medium text-gray-700 mb-2">
                                        Password History Count
                                    </label>
                                    <input
                                        type="number"
                                        id="passwordHistoryCount"
                                        name="passwordHistoryCount"
                                        value={formData.passwordHistoryCount}
                                        onChange={handleChange}
                                        min="0"
                                        max="20"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                                    />
                                    <p className="text-sm text-gray-500 mt-1">0 = no history check</p>
                                </div>
                            </div>

                            {/* Password Rules Summary */}
                            <div className="mt-6 p-4 bg-white border border-gray-200 rounded-lg">
                                <h5 className="text-sm font-medium text-gray-900 mb-2">Current Password Rules:</h5>
                                <div className="text-sm text-gray-600">
                                    <ul className="list-disc list-inside space-y-1">
                                        {getPasswordRulesSummary().map((rule, index) => (
                                            <li key={index}>{rule}</li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="mt-3 text-xs text-gray-500">
                                    <p>Example valid passwords: {formData.passwordRequireUppercase && formData.passwordRequireLowercase && formData.passwordRequireNumbers && formData.passwordRequireSpecialChars ? 'SecurePass123!' : 'meets-current-rules'}</p>
                                    <p>Example invalid passwords: {formData.passwordMinLength > 6 ? 'short' : 'weak'}, common words, sequences</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Verification Flow Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-blue-800 mb-2">Registration Flow</h4>
                    <div className="text-sm text-blue-700">
                        <p className="mb-2">Based on your current settings, users will need to:</p>
                        <ol className="list-decimal list-inside space-y-1">
                            <li>Complete registration form (with username and password validation)</li>
                            {formData.eitherVerificationRequired ? (
                                <li>Verify either email address or mobile number via OTP</li>
                            ) : (
                                <>
                                    {formData.emailVerificationRequired && <li>Verify email address via OTP</li>}
                                    {formData.mobileVerificationRequired && <li>Verify mobile number via SMS OTP</li>}
                                </>
                            )}
                            <li>Choose and pay for subscription plan</li>
                            <li>Access dashboard and start using the platform</li>
                        </ol>
                        {formData.testOtpEnabled && (
                            <div className="mt-3 p-3 bg-yellow-100 border border-yellow-300 rounded-md">
                                <p className="text-yellow-800 font-medium">Test Mode Active:</p>
                                <p className="text-yellow-700 text-xs">
                                    Test OTP "{formData.testOtpCode}" will work for all verifications when enabled.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={saving}
                        className="bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                    >
                        {saving ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>Saving...</span>
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4" />
                                <span>Save Registration Settings</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default RegistrationSettings;