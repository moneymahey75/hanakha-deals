import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X, Loader2 } from 'lucide-react';
import { processingIndicator } from '../../lib/processingIndicator';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

interface NotificationContextType {
  showNotification: (notification: Omit<Notification, 'id'>) => void;
  showSuccess: (title: string, message?: string) => void;
  showError: (title: string, message?: string) => void;
  showWarning: (title: string, message?: string) => void;
  showInfo: (title: string, message?: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [processingState, setProcessingState] = useState({ activeCount: 0, message: 'Processing...' });

  useEffect(() => {
    return processingIndicator.subscribe(setProcessingState);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const showNotification = useCallback((notification: Omit<Notification, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNotification: Notification = {
      ...notification,
      id,
      duration: notification.duration || 10000
    };

    setNotifications(prev => [...prev, newNotification]);

    // Auto-remove after duration
    setTimeout(() => {
      removeNotification(id);
    }, newNotification.duration);
  }, [removeNotification]);

  const showSuccess = useCallback((title: string, message?: string) => {
    showNotification({ type: 'success', title, message });
  }, [showNotification]);

  const showError = useCallback((title: string, message?: string) => {
    showNotification({ type: 'error', title, message });
  }, [showNotification]);

  const showWarning = useCallback((title: string, message?: string) => {
    showNotification({ type: 'warning', title, message });
  }, [showNotification]);

  const showInfo = useCallback((title: string, message?: string) => {
    showNotification({ type: 'info', title, message });
  }, [showNotification]);

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      case 'info':
        return <Info className="h-5 w-5 text-blue-600" />;
    }
  };

  const getBackgroundColor = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'info':
        return 'bg-blue-50 border-blue-200';
    }
  };

  const value = {
    showNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}

      {processingState.activeCount > 0 && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/35 backdrop-blur-[2px]">
          <div className="mx-4 flex min-w-[260px] items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-2xl">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{processingState.message}</p>
              <p className="text-xs text-gray-500">Please wait while we complete your request.</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Notification Container */}
      <div className="fixed top-20 right-4 z-50 space-y-3 max-w-sm w-full">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`${getBackgroundColor(notification.type)} border rounded-2xl p-5 shadow-xl backdrop-blur-sm animate-in slide-in-from-right duration-300 transform hover:scale-105 transition-transform`}
          >
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                {getIcon(notification.type)}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-gray-900">
                  {notification.title}
                </h4>
                {notification.message && (
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                    {notification.message}
                  </p>
                )}
              </div>
              <button
                onClick={() => removeNotification(notification.id)}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};
