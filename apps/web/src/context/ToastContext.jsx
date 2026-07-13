import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const ToastContext = createContext();

export const ToastProvider = ({ children }) => {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const removeToast = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'error', duration = 5000, options = {}) => {
    const id = Date.now() + Math.random();
    const toast = {
      id,
      message,
      type,
      duration,
      placement: options.placement || (options.action ? 'bottom-center' : 'default'),
      action: options.action || null,
      onDismiss: options.onDismiss || null,
    };
    setToasts((prev) => [...prev, toast]);

    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      if (typeof toast.onDismiss === 'function') {
        toast.onDismiss();
      }
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
    timersRef.current.set(id, timer);
  }, []);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  useEffect(() => {
    const handleProjectLifecycle = (browserEvent) => {
      const event = browserEvent.detail;
      if (!event?.project_name) return;
      if (event.action === 'trashed') {
        addToast(
          t('projectTrash.moved_by_teammate', { name: event.project_name }),
          'info',
          6000,
        );
      } else if (event.action === 'restored') {
        addToast(
          t('projectTrash.restored_by_teammate', { name: event.project_name }),
          'success',
          6000,
        );
      }
    };
    window.addEventListener('siteweave:project-lifecycle', handleProjectLifecycle);
    return () => window.removeEventListener('siteweave:project-lifecycle', handleProjectLifecycle);
  }, [addToast, t]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
};

const ToastContainer = ({ toasts, removeToast }) => {
  const errorToasts = toasts.filter((t) => t.type === 'error');
  const bottomToasts = toasts.filter((t) => t.type !== 'error' && t.placement === 'bottom-center');
  const otherToasts = toasts.filter((t) => t.type !== 'error' && t.placement !== 'bottom-center');

  return (
    <>
      {errorToasts.length > 0 && (
        <div className="fixed top-4 left-1/2 z-[60] w-full max-w-md -translate-x-1/2 space-y-3">
          {errorToasts.map((toast) => (
            <Toast key={toast.id} toast={toast} onRemove={removeToast} />
          ))}
        </div>
      )}
      {otherToasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 w-full max-w-sm space-y-3">
          {otherToasts.map((toast) => (
            <Toast key={toast.id} toast={toast} onRemove={removeToast} />
          ))}
        </div>
      )}
      {bottomToasts.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-[60] w-full max-w-lg -translate-x-1/2 space-y-3 px-4">
          {bottomToasts.map((toast) => (
            <Toast key={toast.id} toast={toast} onRemove={removeToast} />
          ))}
        </div>
      )}
    </>
  );
};

const Toast = ({ toast, onRemove }) => {
  const { id, message, type, action } = toast;
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleRemove = () => {
    setIsLeaving(true);
    setTimeout(() => onRemove(id), 300);
  };

  const handleAction = () => {
    if (action?.onClick) {
      action.onClick();
    }
    handleRemove();
  };

  const typeStyles = {
    error: 'bg-red-100 border-red-400 border-2 text-red-900 shadow-xl ring-2 ring-red-300',
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    undo: 'bg-slate-900 border-slate-700 text-white shadow-lg',
  };

  const iconPaths = {
    error: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z',
    info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    undo: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6',
  };

  const resolvedType = action ? 'undo' : type;

  return (
    <div
      className={`${typeStyles[resolvedType] || typeStyles.info} rounded-lg ${type === 'error' ? 'p-6' : 'p-4'} flex items-center gap-3 transition-all duration-300 ${
        isLeaving ? 'toast-exit-active' : isVisible ? 'toast-enter-active' : 'toast-enter'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex-shrink-0">
        <svg className={type === 'error' ? 'w-6 h-6' : 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={type === 'error' ? 2.5 : 2} d={iconPaths[resolvedType] || iconPaths.info} />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`${type === 'error' ? 'text-base font-bold' : 'text-sm font-medium'} leading-relaxed`}>{message}</p>
      </div>
      {action ? (
        <button
          type="button"
          onClick={handleAction}
          className="flex-shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors"
        >
          {action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={handleRemove}
        className={`flex-shrink-0 transition-colors p-1 rounded ${
          action ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
        }`}
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
