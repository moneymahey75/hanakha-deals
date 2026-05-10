import React, { useEffect, useMemo, useState } from 'react';
import { Save, RefreshCw, ShieldCheck, Mail, Phone, BadgeCheck } from 'lucide-react';
import { supabase, UserProfile } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../ui/NotificationProvider';

type ProfileFormState = {
  firstName: string;
  lastName: string;
  username: string;
  gender: string;
};

const emptyForm: ProfileFormState = {
  firstName: '',
  lastName: '',
  username: '',
  gender: ''
};

const normalizeUsername = (value: string) => value.trim().replace(/^@+/, '');

const getErrorMessage = (error: unknown, fallback: string) => {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  ) {
    return 'That username is already taken.';
  }

  return error instanceof Error ? error.message : fallback;
};

const ProfileUpdateForm: React.FC = () => {
  const { user, fetchUserData } = useAuth();
  const notification = useNotification();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState<ProfileFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const initials = useMemo(() => {
    const first = formData.firstName.trim().charAt(0);
    const last = formData.lastName.trim().charAt(0);
    return `${first}${last}`.trim() || 'U';
  }, [formData.firstName, formData.lastName]);

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadProfile = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tbl_user_profiles')
        .select('*')
        .eq('tup_user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      setProfile(data || null);
      setFormData({
        firstName: data?.tup_first_name || user.firstName || '',
        lastName: data?.tup_last_name || user.lastName || '',
        username: data?.tup_username || '',
        gender: data?.tup_gender || ''
      });
    } catch (error: unknown) {
      console.error('Failed to load profile:', error);
      notification.showError('Profile Load Failed', getErrorMessage(error, 'Could not load profile details.'));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof ProfileFormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = async () => {
    const firstName = formData.firstName.trim();
    const lastName = formData.lastName.trim();
    const username = normalizeUsername(formData.username);
    const existingUsername = normalizeUsername(profile?.tup_username || '');

    if (!firstName) {
      throw new Error('First name is required.');
    }

    if (!lastName) {
      throw new Error('Last name is required.');
    }

    if (!username) {
      throw new Error('Username is required.');
    }

    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      throw new Error('Username must be 3-30 characters and use only letters, numbers, or underscores.');
    }

    if (username.toLowerCase() !== existingUsername.toLowerCase()) {
      const { data, error } = await supabase.rpc('check_username_exists', { p_username: username });
      if (error) throw error;
      if (data === true) {
        throw new Error('That username is already taken.');
      }
    }

    return {
      firstName,
      lastName,
      username,
      gender: formData.gender
    };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.id) return;

    setSaving(true);
    try {
      const validData = await validateForm();
      const payload = {
        tup_user_id: user.id,
        tup_first_name: validData.firstName,
        tup_last_name: validData.lastName,
        tup_username: validData.username,
        tup_gender: validData.gender || null,
        tup_updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('tbl_user_profiles')
        .upsert(payload, { onConflict: 'tup_user_id' })
        .select('*')
        .single();

      if (error) throw error;

      setProfile(data);
      setFormData({
        firstName: data.tup_first_name || '',
        lastName: data.tup_last_name || '',
        username: data.tup_username || '',
        gender: data.tup_gender || ''
      });

      await fetchUserData(user.id);
      notification.showSuccess('Profile Updated', 'Your profile details have been saved.');
    } catch (error: unknown) {
      console.error('Failed to update profile:', error);
      notification.showError('Update Failed', getErrorMessage(error, 'Could not update profile.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-b-2 border-indigo-600"></div>
        <p className="mt-3 text-sm text-gray-500">Loading profile...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 border-b border-gray-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-700">
            {initials}
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Profile Details</h3>
            <p className="mt-1 text-sm text-gray-500">@{formData.username || 'username'}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadProfile}
          disabled={loading || saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500">
            <Mail className="h-4 w-4" />
            <span>Email</span>
          </div>
          <p className="break-all text-sm font-semibold text-gray-900">{user?.email || 'Not available'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500">
            <BadgeCheck className="h-4 w-4" />
            <span>Sponsorship Number</span>
          </div>
          <p className="font-mono text-sm font-semibold text-indigo-700">{profile?.tup_sponsorship_number || user?.sponsorshipNumber || 'N/A'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500">
            <Phone className="h-4 w-4" />
            <span>Mobile</span>
          </div>
          <p className="text-sm font-semibold text-gray-900">{profile?.tup_mobile || 'Not provided'}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="profile-first-name">
              First Name
            </label>
            <input
              id="profile-first-name"
              type="text"
              value={formData.firstName}
              onChange={(event) => handleChange('firstName', event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              autoComplete="given-name"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="profile-last-name">
              Last Name
            </label>
            <input
              id="profile-last-name"
              type="text"
              value={formData.lastName}
              onChange={(event) => handleChange('lastName', event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              autoComplete="family-name"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="profile-username">
              Username
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">@</span>
              <input
                id="profile-username"
                type="text"
                value={formData.username}
                onChange={(event) => handleChange('username', normalizeUsername(event.target.value))}
                className="w-full rounded-lg border border-gray-300 py-3 pl-8 pr-4 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                autoComplete="username"
                required
              />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="profile-gender">
              Gender
            </label>
            <select
              id="profile-gender"
              value={formData.gender}
              onChange={(event) => handleChange('gender', event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-gray-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Account contact details stay protected during profile edits.</span>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>{saving ? 'Saving...' : 'Save Profile'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProfileUpdateForm;
