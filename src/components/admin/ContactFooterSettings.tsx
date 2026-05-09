import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Contact, Save } from 'lucide-react';
import { useAdmin } from '../../contexts/AdminContext';
import { adminApi } from '../../lib/adminApi';

const ContactFooterSettings: React.FC = () => {
  const { settings, updateSettings, loading, refreshSettings } = useAdmin();
  const [formData, setFormData] = useState({
    contactEmail: settings.contactEmail,
    contactEmailNote: settings.contactEmailNote,
    contactPhone: settings.contactPhone,
    contactPhoneNote: settings.contactPhoneNote,
    contactAddress: settings.contactAddress,
    contactBusinessHours: settings.contactBusinessHours,
    contactQuickSupportLinks: (settings.contactQuickSupportLinks || []).join('\n'),
    socialFacebookUrl: settings.socialFacebookUrl,
    socialTwitterUrl: settings.socialTwitterUrl,
    socialLinkedinUrl: settings.socialLinkedinUrl,
    socialInstagramUrl: settings.socialInstagramUrl,
    socialYoutubeUrl: settings.socialYoutubeUrl,
    socialWhatsappUrl: settings.socialWhatsappUrl
  });
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    setFormData({
      contactEmail: settings.contactEmail,
      contactEmailNote: settings.contactEmailNote,
      contactPhone: settings.contactPhone,
      contactPhoneNote: settings.contactPhoneNote,
      contactAddress: settings.contactAddress,
      contactBusinessHours: settings.contactBusinessHours,
      contactQuickSupportLinks: (settings.contactQuickSupportLinks || []).join('\n'),
      socialFacebookUrl: settings.socialFacebookUrl,
      socialTwitterUrl: settings.socialTwitterUrl,
      socialLinkedinUrl: settings.socialLinkedinUrl,
      socialInstagramUrl: settings.socialInstagramUrl,
      socialYoutubeUrl: settings.socialYoutubeUrl,
      socialWhatsappUrl: settings.socialWhatsappUrl
    });
  }, [settings]);

  const parseLines = (value: string) =>
    String(value || '')
      .split(/\n+/g)
      .map((line) => line.trim())
      .filter(Boolean);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveResult(null);

    const payload = {
      contactEmail: String(formData.contactEmail || '').trim(),
      contactEmailNote: String(formData.contactEmailNote || '').trim(),
      contactPhone: String(formData.contactPhone || '').trim(),
      contactPhoneNote: String(formData.contactPhoneNote || '').trim(),
      contactAddress: String(formData.contactAddress || '').trim(),
      contactBusinessHours: String(formData.contactBusinessHours || '').trim(),
      contactQuickSupportLinks: parseLines(formData.contactQuickSupportLinks),
      socialFacebookUrl: String(formData.socialFacebookUrl || '').trim(),
      socialTwitterUrl: String(formData.socialTwitterUrl || '').trim(),
      socialLinkedinUrl: String(formData.socialLinkedinUrl || '').trim(),
      socialInstagramUrl: String(formData.socialInstagramUrl || '').trim(),
      socialYoutubeUrl: String(formData.socialYoutubeUrl || '').trim(),
      socialWhatsappUrl: String(formData.socialWhatsappUrl || '').trim()
    };

    try {
      const updates = [
        { key: 'contact_email', value: payload.contactEmail },
        { key: 'contact_email_note', value: payload.contactEmailNote },
        { key: 'contact_phone', value: payload.contactPhone },
        { key: 'contact_phone_note', value: payload.contactPhoneNote },
        { key: 'contact_address', value: payload.contactAddress },
        { key: 'contact_business_hours', value: payload.contactBusinessHours },
        { key: 'contact_quick_support_links', value: payload.contactQuickSupportLinks },
        { key: 'social_facebook_url', value: payload.socialFacebookUrl },
        { key: 'social_twitter_url', value: payload.socialTwitterUrl },
        { key: 'social_linkedin_url', value: payload.socialLinkedinUrl },
        { key: 'social_instagram_url', value: payload.socialInstagramUrl },
        { key: 'social_youtube_url', value: payload.socialYoutubeUrl },
        { key: 'social_whatsapp_url', value: payload.socialWhatsappUrl }
      ];

      await adminApi.post('admin-upsert-settings', {
        updates: updates.map((update) => ({
          key: update.key,
          value: update.value,
          description: `${update.key.replace('_', ' ')} setting`
        }))
      });

      updateSettings(payload);
      await refreshSettings();

      setSaveResult({
        success: true,
        message: 'Contact and footer settings updated successfully!'
      });
    } catch (error) {
      console.error('Failed to save contact and footer settings:', error);
      setSaveResult({
        success: false,
        message: 'Failed to save contact and footer settings. Please try again.'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="bg-blue-100 p-3 rounded-lg">
          <Contact className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Contact & Footer Information</h3>
          <p className="text-gray-600">Manage frontend contact details, quick support links, and footer social icons</p>
        </div>
      </div>

      {saveResult && (
        <div className={`border rounded-lg p-4 mb-6 ${
          saveResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
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
        <div className="border border-gray-200 rounded-xl p-5 bg-gray-50">
          <h4 className="text-sm font-semibold text-gray-900">Contact Information</h4>
          <p className="text-xs text-gray-600 mt-1">
            These values appear on the Contact Us page and in the footer only when filled.
          </p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="contactEmail" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input type="email" id="contactEmail" name="contactEmail" value={formData.contactEmail} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" placeholder="support@example.com" />
            </div>
            <div>
              <label htmlFor="contactEmailNote" className="block text-sm font-medium text-gray-700 mb-2">Email Note</label>
              <input type="text" id="contactEmailNote" name="contactEmailNote" value={formData.contactEmailNote} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" placeholder="24/7 Support Available" />
            </div>
            <div>
              <label htmlFor="contactPhone" className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
              <input type="tel" id="contactPhone" name="contactPhone" value={formData.contactPhone} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" placeholder="+91 98765 43210" />
            </div>
            <div>
              <label htmlFor="contactPhoneNote" className="block text-sm font-medium text-gray-700 mb-2">Phone Note</label>
              <input type="text" id="contactPhoneNote" name="contactPhoneNote" value={formData.contactPhoneNote} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" placeholder="Mon-Fri: 9AM-6PM" />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="contactAddress" className="block text-sm font-medium text-gray-700 mb-2">Office Address</label>
              <textarea id="contactAddress" name="contactAddress" value={formData.contactAddress} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" rows={4} placeholder="Office address shown on Contact Us and footer" />
            </div>
            <div>
              <label htmlFor="contactBusinessHours" className="block text-sm font-medium text-gray-700 mb-2">Business Hours</label>
              <textarea id="contactBusinessHours" name="contactBusinessHours" value={formData.contactBusinessHours} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" rows={4} placeholder="Monday - Friday: 9:00 AM - 6:00 PM" />
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="contactQuickSupportLinks" className="block text-sm font-medium text-gray-700 mb-2">Quick Support Links</label>
            <textarea id="contactQuickSupportLinks" name="contactQuickSupportLinks" value={formData.contactQuickSupportLinks} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" rows={4} placeholder="Live Chat Support | /contact&#10;Customer Portal | /customer/login" />
            <p className="text-xs text-gray-500 mt-2">Enter one link per line. Use “Label | URL”. Lines without a URL will still show as text.</p>
          </div>
        </div>

        <div className="border border-gray-200 rounded-xl p-5 bg-gray-50">
          <h4 className="text-sm font-semibold text-gray-900">Social Media Links</h4>
          <p className="text-xs text-gray-600 mt-1">Icons appear in the footer only when their URL is filled.</p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="socialFacebookUrl" className="block text-sm font-medium text-gray-700 mb-2">Facebook URL</label>
              <input type="url" id="socialFacebookUrl" name="socialFacebookUrl" value={formData.socialFacebookUrl} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" placeholder="https://facebook.com/yourpage" />
            </div>
            <div>
              <label htmlFor="socialTwitterUrl" className="block text-sm font-medium text-gray-700 mb-2">X / Twitter URL</label>
              <input type="url" id="socialTwitterUrl" name="socialTwitterUrl" value={formData.socialTwitterUrl} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" placeholder="https://x.com/yourhandle" />
            </div>
            <div>
              <label htmlFor="socialLinkedinUrl" className="block text-sm font-medium text-gray-700 mb-2">LinkedIn URL</label>
              <input type="url" id="socialLinkedinUrl" name="socialLinkedinUrl" value={formData.socialLinkedinUrl} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" placeholder="https://linkedin.com/company/yourcompany" />
            </div>
            <div>
              <label htmlFor="socialInstagramUrl" className="block text-sm font-medium text-gray-700 mb-2">Instagram URL</label>
              <input type="url" id="socialInstagramUrl" name="socialInstagramUrl" value={formData.socialInstagramUrl} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" placeholder="https://instagram.com/yourhandle" />
            </div>
            <div>
              <label htmlFor="socialYoutubeUrl" className="block text-sm font-medium text-gray-700 mb-2">YouTube URL</label>
              <input type="url" id="socialYoutubeUrl" name="socialYoutubeUrl" value={formData.socialYoutubeUrl} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" placeholder="https://youtube.com/@yourchannel" />
            </div>
            <div>
              <label htmlFor="socialWhatsappUrl" className="block text-sm font-medium text-gray-700 mb-2">WhatsApp URL</label>
              <input type="url" id="socialWhatsappUrl" name="socialWhatsappUrl" value={formData.socialWhatsappUrl} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" placeholder="https://wa.me/919876543210" />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2">
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Save Contact & Footer</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ContactFooterSettings;
