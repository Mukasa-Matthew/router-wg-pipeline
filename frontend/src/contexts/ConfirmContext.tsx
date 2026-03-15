import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolveRef, setResolveRef] = useState<((value: boolean) => void) | null>(null);

  const confirmFn = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setOptions(opts);
      setResolveRef(() => resolve);
      setOpen(true);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef?.(true);
    setOpen(false);
    setOptions(null);
    setResolveRef(null);
  }, [resolveRef]);

  const handleCancel = useCallback(() => {
    resolveRef?.(false);
    setOpen(false);
    setOptions(null);
    setResolveRef(null);
  }, [resolveRef]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel();
    },
    [handleCancel]
  );

  const value: ConfirmContextValue = {
    confirm: confirmFn,
  };

  if (!open || !options) {
    return (
      <ConfirmContext.Provider value={value}>
        {children}
      </ConfirmContext.Provider>
    );
  }

  const variant = options.variant ?? 'default';
  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-navy-900/50 backdrop-blur-sm"
        onClick={handleCancel}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div
          className="w-full max-w-md rounded-2xl bg-white shadow-elevated border border-navy-200 p-6 animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex gap-4">
            <div
              className={`shrink-0 p-3 rounded-xl ${
                isDanger ? 'bg-red-50' : isWarning ? 'bg-amber-50' : 'bg-navy-100'
              }`}
            >
              <AlertTriangle
                className={`w-6 h-6 ${isDanger ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-navy-600'}`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h2 id="confirm-title" className="text-lg font-semibold text-navy-900">
                {options.title}
              </h2>
              <p className="text-navy-600 mt-1 text-sm">{options.message}</p>
            </div>
          </div>
          <div className="flex gap-3 mt-6 justify-end">
            <button onClick={handleCancel} className="btn-secondary">
              {options.cancelLabel ?? 'Cancel'}
            </button>
            <button
              onClick={handleConfirm}
              className={
                isDanger
                  ? 'px-4 py-2.5 rounded-xl font-semibold bg-red-600 text-white hover:bg-red-700 transition'
                  : isWarning
                    ? 'px-4 py-2.5 rounded-xl font-semibold bg-amber-600 text-white hover:bg-amber-700 transition'
                    : 'btn-primary'
              }
            >
              {options.confirmLabel ?? 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </ConfirmContext.Provider>
  );
}
