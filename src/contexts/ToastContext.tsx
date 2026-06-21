import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';

export interface ToastAction {
  label: string;
  onClick: () => void;
  icon?: string;
  className?: string;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration: number;
  actions?: ToastAction[];
  skipBroadcast?: boolean;
}

interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'> & { id: string }) => void;
  hideToast: (id: string) => void;
  toasts: Toast[];
}

const ToastContext = createContext<ToastContextType | null>(null);

const CHANNEL_NAME = 'np_toast_channel';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const activeIdsRef = useRef(new Set<string>());
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => {
      const toast = prev.find((t) => t.id === id);
      if (toast) {
        activeIdsRef.current.delete(id);
        console.log('[TOAST] removed:', id, toast.message);
      }
      return prev.filter((t) => t.id !== id);
    });
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  const showToast = useCallback((toastInput: Omit<Toast, 'id'> & { id: string }) => {
    const id = toastInput.id;
    if (activeIdsRef.current.has(id)) {
      console.log('[TOAST] skipped duplicate (id exists):', id);
      return;
    }

    activeIdsRef.current.add(id);
    console.log('[TOAST] added:', id, toastInput.message);

    const toast: Toast = {
      id,
      message: toastInput.message,
      type: toastInput.type,
      duration: toastInput.duration || 4000,
      actions: toastInput.actions,
      skipBroadcast: toastInput.skipBroadcast,
    };

    setToasts((prev) => [...prev, toast]);

    // Auto-hide
    const timer = setTimeout(() => {
      hideToast(id);
    }, toast.duration);
    timersRef.current[id] = timer;

    // Broadcast to other tabs — only if not marked as local-only
    if (!toastInput.skipBroadcast) {
      try {
        const bc = new BroadcastChannel(CHANNEL_NAME);
        bc.postMessage({ id, message: toast.message, type: toast.type, duration: toast.duration, actions: toast.actions });
        bc.close();
      } catch { /* BroadcastChannel not supported */ }
    }
  }, [hideToast]);

  // Listen for toasts from other tabs — with deduplication check
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = (e: MessageEvent<{ id: string; message: string; type: Toast['type']; duration: number; actions?: ToastAction[] }>) => {
        const { id, message, type, duration, actions } = e.data;
        if (activeIdsRef.current.has(id)) {
          console.log('[TOAST] skipped duplicate from other tab (id exists):', id);
          return;
        }
        activeIdsRef.current.add(id);
        console.log('[TOAST] added from other tab:', id, message);
        const toast: Toast = { id, message, type, duration, actions };
        setToasts((prev) => [...prev, toast]);
        const timer = setTimeout(() => {
          hideToast(id);
        }, duration);
        timersRef.current[id] = timer;
      };
    } catch { /* ignore */ }
    return () => {
      if (bc) bc.close();
      // Clear all timers on unmount
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, [hideToast]);

  return (
    <ToastContext.Provider value={{ showToast, hideToast, toasts }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useGlobalToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useGlobalToast must be used within a ToastProvider');
  }
  return context;
}