import { ReactNode } from 'react';
import clsx from 'clsx';

/**
 * The console page header: an uppercase eyebrow kicker over a Bricolage display title, an optional
 * supporting subtitle, and a right-pinned actions slot. Gives every console page the same designed
 * header the login/landing use, instead of a lone semibold word.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2 font-body text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{eyebrow}</div>
        )}
        <h1 className="font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-ink">{title}</h1>
        {subtitle && <div className="mt-2 font-body text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A paper surface with a rule hairline, floating on the slate (ground) canvas — the layering that
 * makes a console page read as designed rather than a flat full-width table. Wrap a page's main
 * content (toolbar + table, or a form) in this.
 */
export function PageSurface({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('overflow-hidden rounded-xl border border-rule bg-paper', className)}>{children}</div>;
}
