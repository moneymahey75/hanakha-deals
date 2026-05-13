import React, { useEffect, useId, useRef, useState } from 'react';
import { Shield, CheckCircle, AlertCircle } from 'lucide-react';
import { useAdmin } from '../../contexts/AdminContext';

interface ReCaptchaProps {
  onVerify: (token: string | null) => void;
  siteKey?: string;
}

let turnstileScriptPromise: Promise<void> | null = null;

const loadTurnstileScript = () => {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile-script="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Unable to load Turnstile')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstileScript = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load Turnstile'));
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
};

const ReCaptcha: React.FC<ReCaptchaProps> = ({ onVerify, siteKey }) => {
  const { settings } = useAdmin();
  const containerId = useId().replace(/:/g, '');
  const widgetIdRef = useRef<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const isDevelopmentMode = (settings.siteMode || 'live') === 'development';
  const turnstileSiteKey = siteKey || import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

  useEffect(() => {
    if (isDevelopmentMode) return;

    let cancelled = false;
    onVerify(null);
    setIsVerified(false);
    setLoadError('');

    if (!turnstileSiteKey) {
      setLoadError('Turnstile site key is not configured.');
      return;
    }

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        const element = document.getElementById(containerId);
        if (!element || widgetIdRef.current) return;

        widgetIdRef.current = window.turnstile.render(element, {
          sitekey: turnstileSiteKey,
          theme: 'light',
          size: 'flexible',
          callback: (token: string) => {
            setIsVerified(true);
            onVerify(token);
          },
          'expired-callback': () => {
            setIsVerified(false);
            onVerify(null);
          },
          'error-callback': () => {
            setIsVerified(false);
            onVerify(null);
            setLoadError('Security verification failed. Please try again.');
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Security verification could not be loaded.');
          onVerify(null);
        }
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [containerId, isDevelopmentMode, onVerify, turnstileSiteKey]);

  const handleMockVerification = async () => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    const token = `mock-turnstile-token-${Date.now()}`;
    setIsVerified(true);
    setIsLoading(false);
    onVerify(token);
  };

  const handleReset = () => {
    setIsVerified(false);
    onVerify(null);
    if (!isDevelopmentMode && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  };

  if (!isDevelopmentMode) {
    return (
      <div className="flex justify-center">
        <div className="w-full max-w-sm">
          <div id={containerId} className="min-h-[65px]" />
          {isVerified && (
            <div className="mt-2 flex items-center justify-center space-x-2 text-xs text-green-700">
              <CheckCircle className="h-4 w-4" />
              <span>Security verification completed</span>
            </div>
          )}
          {loadError && (
            <div className="mt-2 flex items-center justify-center space-x-2 text-xs text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span>{loadError}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 w-full max-w-sm">
        {!isVerified ? (
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-3">
              <Shield className="h-5 w-5 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Security Verification</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Click to verify you're not a robot
            </p>
            <button
              type="button"
              onClick={handleMockVerification}
              disabled={isLoading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4" />
                  <span>I'm not a robot</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-700">Verified</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Security verification completed
            </p>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-blue-600 hover:text-blue-700 underline"
            >
              Reset verification
            </button>
          </div>
        )}
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-400 text-center">
            Development Mode - Mock Turnstile
          </p>
        </div>
      </div>
    </div>
  );
};

export default ReCaptcha;
