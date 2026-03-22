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
    <div className="rounded-2xl border border-dashed border-navy-300 bg-white p-12 lg:p-16 text-center">
      <div className="max-w-md mx-auto">
        <div className="inline-flex p-5 rounded-2xl bg-navy-100 mb-6">{icon}</div>
        <h3 className="font-display font-semibold text-title text-navy-900 mb-2">{title}</h3>
        <p className="text-body text-navy-500 mb-8 leading-relaxed">{description}</p>
        {action}
        {footer && <p className="text-caption text-navy-400 mt-6">{footer}</p>}
      </div>
    </div>
  );
}
