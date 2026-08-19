import { ReactNode } from 'react';
import clsx from 'clsx';

type Variant = 'default' | 'success' | 'warning' | 'danger';

// Retoned onto the semantic status.* tokens (same palette as StatusBadge) and squared. Badge stays
// label-only -- no marker dot -- so it reads as a lightweight tag, distinct from StatusBadge's
// stateful roster chip.
const VARIANT_CLASSES: Record<Variant, string> = {
  default: 'bg-status-neutral-bg text-status-neutral',
  success: 'bg-status-success-bg text-status-success',
  warning: 'bg-status-warning-bg text-status-warning',
  danger: 'bg-status-danger-bg text-status-danger',
};

export function Badge({ variant = 'default', children }: { variant?: Variant; children: ReactNode }) {
  return (
    <span className={clsx('inline-block rounded px-2 py-0.5 font-body text-xs font-semibold', VARIANT_CLASSES[variant])}>
      {children}
    </span>
  );
}
