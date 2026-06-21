import { useGlobalToast } from "@/contexts/ToastContext";
import type { Toast } from "@/contexts/ToastContext";

export default function ToastContainer() {
  const { toasts, hideToast } = useGlobalToast();

  if (toasts.length === 0) return null;

  const icons = {
    success: "ri-check-double-line",
    error: "ri-error-warning-line",
    warning: "ri-alert-line",
    info: "ri-information-line",
  };

  const colors = {
    success: "bg-np-green-600 border-np-green-500",
    error: "bg-red-600 border-red-500",
    warning: "bg-np-gold-500 border-np-gold-400",
    info: "bg-np-purple-600 border-np-purple-500",
  };

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${colors[toast.type]} text-white px-4 py-3 rounded-lg shadow-lg border flex items-start gap-3 animate-fade-in-up`}
        >
          <i className={`${icons[toast.type]} text-lg flex-shrink-0 mt-0.5`}></i>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{toast.message}</p>
            {toast.actions && toast.actions.length > 0 && (
              <div className="flex gap-2 mt-2">
                {toast.actions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      action.onClick();
                      hideToast(toast.id);
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${action.className || "bg-white/20 hover:bg-white/30"}`}
                  >
                    {action.icon && <i className={action.icon}></i>}
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => hideToast(toast.id)}
            className="text-white/70 hover:text-white flex-shrink-0"
          >
            <i className="ri-close-line"></i>
          </button>
        </div>
      ))}
    </div>
  );
}