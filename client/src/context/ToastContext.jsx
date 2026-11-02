import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);
let seq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = 'success', timeout = 3800) => {
    const id = ++seq;
    setToasts(list => [...list, { id, message, type }]);
    window.setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), timeout);
  }, []);

  const value = {
    toast: push,
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error', 5200),
    info: (m) => push(m, 'info'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.message}</span>
            <button type="button" onClick={() => setToasts(list => list.filter(x => x.id !== t.id))} aria-label="Close">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
