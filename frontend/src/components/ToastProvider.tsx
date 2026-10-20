import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import "./toast.css";

export type ToastKind = "error" | "success";
export type ToastItem = { id: number; kind: ToastKind; message: string };

type ToastApi = {
  showToast: (kind: ToastKind, message: string, durationMs?: number) => number;
  dismissToast: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((kind: ToastKind, message: string, durationMs = 6000) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, kind, message }]);
    if (durationMs > 0) window.setTimeout(() => dismissToast(id), durationMs);
    return id;
  }, [dismissToast]);

  const api = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-label="Notifications">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  return (
    <div className={`toast-item toast-item-${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}>
      {toast.kind === "error" ? <X size={16} /> : <Check size={16} />}
      <span className="toast-message">{toast.message}</span>
      <button type="button" className="toast-dismiss" onClick={onDismiss} aria-label="Dismiss notification"><X size={15} /></button>
    </div>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>.");
  return context;
}

/** Drop-in replacement for the old `error` / `notice` string state: empty strings are ignored. */
export function useNotifier() {
  const { showToast } = useToast();
  return useMemo(() => ({
    setError: (message: string) => { if (message) showToast("error", message); },
    setNotice: (message: string) => { if (message) showToast("success", message); },
  }), [showToast]);
}
