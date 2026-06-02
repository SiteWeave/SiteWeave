import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const ToastContext = createContext();

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'error', duration = 5000) => {
    const id = Date.now() + Math.random();
    const toast = { id, message, type, duration };
    setToasts(prev => [...prev, toast]);
    
    // Auto remove after specified duration
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
};

const ToastContainer = ({ toasts, removeToast }) => {
  // Separate error toasts from other toasts for more prominent positioning
  const errorToasts = toasts.filter(t => t.type === 'error');
  const otherToasts = toasts.filter(t => t.type !== 'error');
  
  return (
    <>
      {/* Error toasts at top center for maximum visibility */}
      {errorToasts.length > 0 && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-60 space-y-3 max-w-md w-full">
          {errorToasts.map(toast => (
            <Toast key={toast.id} toast={toast} onRemove={removeToast} />
          ))}
        </div>
      )}
      {/* Other toasts at top right */}
      {otherToasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-3 max-w-sm w-full">
          {otherToasts.map(toast => (
            <Toast key={toast.id} toast={toast} onRemove={removeToast} />
          ))}
        </div>
      )}
    </>
  );
};

const Toast = ({ toast, onRemove }) => {
  const { id, message, type } = toast;
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  
  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleRemove = () => {
    setIsLeaving(true);
    setTimeout(() => onRemove(id), 300); // Wait for exit animation
  };
  
  const typeStyles = {
    error: 'bg-red-100 border-red-400 border-2 text-red-900 shadow-xl ring-2 ring-red-300',
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  const iconPaths = {
    error: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z',
    info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
  };

  return (
    <div 
      className={`${typeStyles[type]} rounded-lg ${type === 'error' ? 'p-6' : 'p-4'} flex items-center justify-center gap-3 transition-all duration-300 ${
        isLeaving ? 'toast-exit-active' : isVisible ? 'toast-enter-active' : 'toast-enter'
      }`}
      style={type === 'error' ? { 
        boxShadow: '0 20px 25px -5px rgba(239, 68, 68, 0.3), 0 10px 10px -5px rgba(239, 68, 68, 0.2)'
      } : {}}
    >
      <div className="shrink-0">
        <svg className={type === 'error' ? 'w-6 h-6' : 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={type === 'error' ? 2.5 : 2} d={iconPaths[type]} />
        </svg>
      </div>
      <div className="flex-1 text-center">
        <p className={`${type === 'error' ? 'text-base font-bold' : 'text-sm font-medium'} leading-relaxed`}>{message}</p>
      </div>
      <button type="button" 
        onClick={handleRemove}
        className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-100"
        aria-label="Close notification"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
