/**
 * Small toast queue used for save confirmations and recoverable errors.
 * Replaces browser alert() so confirmations stay inside the page's visual
 * language and never block interaction.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((current) => (Array.isArray(current) ? current.filter((t) => t && t.id !== id) : []));
  }, []);

  const notify = useCallback(
    ({ title, text, variant = 'default', duration = 4000 }) => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((current) => [...(Array.isArray(current) ? current : []), { id, title, text, variant }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Announced politely so screen readers hear save confirmations. */}
      <div className="toast-stack" role="status" aria-live="polite" aria-atomic="false">
        {(Array.isArray(toasts) ? toasts : []).map((toast) => {
          if (!toast) return null;
          return (
            <div key={toast.id} className={`toast toast-${toast.variant || 'default'}`}>
              <div className="toast-body">
                <div className="toast-title">{toast.title}</div>
                {toast.text && <div className="toast-text">{toast.text}</div>}
              </div>
              <button
                type="button"
                className="toast-close"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside a ToastProvider');
  return ctx;
}
