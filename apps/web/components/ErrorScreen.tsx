import { ReactNode } from 'react';

/**
 * The full-page fallback shared by the 404 and the route error boundary: an eyebrow kicker over a
 * Bricolage display title on a paper card floating on the ground canvas — the same layering the
 * console and login use, instead of Next's unstyled default screens.
 */
export function ErrorScreen({
  eyebrow,
  title,
  description,
  actions,
  footnote,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-6 py-16">
      <div className="w-full max-w-md rounded-xl border border-rule bg-paper px-8 py-10 text-center">
        <div className="mb-2 font-body text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{eyebrow}</div>
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink">{title}</h1>
        {description && <p className="mt-3 font-body text-sm leading-relaxed text-muted">{description}</p>}
        {actions && <div className="mt-7 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
        {footnote && <p className="mt-6 border-t border-rule pt-4 font-mono text-[11px] text-muted">{footnote}</p>}
      </div>
    </main>
  );
}
