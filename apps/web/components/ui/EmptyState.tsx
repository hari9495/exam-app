import { ReactNode } from 'react';
import clsx from 'clsx';

/**
 * A considered empty state: a hairline icon chip, a Bricolage title, an optional line of guidance,
 * and an optional action — instead of a bare "No results." sentence. Used as the empty rendering
 * for Table / CardGrid / ListView, and directly on pages that have their own empty block.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}>
      {icon && (
        <span
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-rule bg-ground text-muted"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <div>
        <p className="font-display text-base font-bold text-ink">{title}</p>
        {description && <p className="mt-1 font-body text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
