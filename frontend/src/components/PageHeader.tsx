import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-8">
      <div className="min-w-0 flex-1">
        <h1 className="font-display font-semibold text-xl sm:text-2xl text-navy-900 tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-navy-500 mt-1">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0 w-full sm:w-auto flex sm:block">{action}</div>}
    </div>
  );
}
