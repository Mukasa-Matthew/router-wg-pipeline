import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
      <div className="min-w-0">
        <h1 className="font-display font-semibold text-xl sm:text-display-lg text-navy-900 tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-body text-navy-500 mt-1 sm:mt-1.5 truncate sm:whitespace-normal">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0 w-full sm:w-auto">{action}</div>}
    </div>
  );
}
