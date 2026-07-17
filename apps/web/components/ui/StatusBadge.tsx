import { ReactNode } from 'react';
import clsx from 'clsx';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'purple';

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-status-success-bg text-status-success',
  warning: 'bg-status-warning-bg text-status-warning',
  danger: 'bg-status-danger-bg text-status-danger',
  neutral: 'bg-status-neutral-bg text-status-neutral',
  info: 'bg-status-info-bg text-status-info',
  purple: 'bg-status-purple-bg text-status-purple',
};

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', TONE_CLASSES[tone])}>
      {children}
    </span>
  );
}
