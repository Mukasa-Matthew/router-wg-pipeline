import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
}

export function Modal({ open, onClose, title, children, size = 'md', icon }: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const sizeClass = {
    sm: 'max-w-[calc(100vw-2rem)] sm:max-w-md',
    md: 'max-w-[calc(100vw-2rem)] sm:max-w-lg',
    lg: 'max-w-[calc(100vw-2rem)] sm:max-w-2xl',
  }[size];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-navy-900/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={contentRef}
        className={`w-full ${sizeClass} rounded-t-2xl sm:rounded-2xl bg-white shadow-elevated border border-navy-200/80 max-h-[90vh] sm:max-h-[85vh] overflow-hidden flex flex-col animate-fade-in`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-navy-200/80 shrink-0">
          <h2
            id="modal-title"
            className="font-display font-semibold text-base sm:text-title text-navy-900 flex items-center gap-3 min-w-0"
          >
            {icon && (
              <div className="p-2 rounded-xl bg-primary-50 text-primary-600">{icon}</div>
            )}
            <span className="truncate">{title}</span>
          </h2>
          <button
            onClick={onClose}
            className="p-2.5 rounded-lg bg-navy-100 text-navy-600 hover:bg-navy-200 transition touch-manipulation shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>
        <div className="overflow-auto flex-1 overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
