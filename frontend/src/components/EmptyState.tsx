import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  footer?: string;
}

export function EmptyState({ icon, title, description, action, footer }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-navy-200 bg-white p-12 lg:p-16 text-center shadow-card">
      <div className="max-w-md mx-auto">
        <div className="inline-flex p-6 rounded-3xl bg-gradient-to-br from-primary-50 to-accent-50 mb-8">
          {icon}
        </div>
        <h3 className="text-xl font-bold text-navy-900 mb-2">{title}</h3>
        <p className="text-navy-600 mb-8 leading-relaxed text-sm">{description}</p>
        {action}
        {footer && <p className="text-xs text-navy-400 mt-6">{footer}</p>}
      </div>
    </div>
  );
}
