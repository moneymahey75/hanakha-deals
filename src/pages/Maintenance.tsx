import React from 'react';
import { useAdmin } from '../contexts/AdminContext';
import { Settings } from 'lucide-react';

const Maintenance: React.FC = () => {
  const { settings } = useAdmin();
  const siteName = settings?.siteName || 'Site';
  const logoUrl = settings?.logoUrl || '/shopclick_logo.png';
  const message =
    settings?.maintenanceMessage ||
    'We’re doing some maintenance right now. Please check back shortly.';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="rounded-3xl bg-white shadow-xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <div className="flex items-center gap-3">
              <img
                src={logoUrl}
                alt={siteName}
                className="h-10 w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/shopclick_logo.png';
                }}
              />
              <div className="ml-auto inline-flex items-center gap-2 rounded-full bg-slate-50 border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                <Settings className="h-3.5 w-3.5" />
                Maintenance
              </div>
            </div>

            <h1 className="mt-6 text-2xl sm:text-3xl font-extrabold text-gray-900">
              We’ll be back soon
            </h1>
            <p className="mt-3 text-gray-600 leading-relaxed">
              {String(message || '').trim() || 'We’re doing some maintenance right now. Please check back shortly.'}
            </p>

            <div className="mt-6 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-900">
              Thank you for your patience and understanding.
            </div>
          </div>
          <div className="px-6 py-4 sm:px-10 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
            © {new Date().getFullYear()} {siteName}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Maintenance;
