import { ReactNode } from 'react';
import clsx from 'clsx';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'purple';

// Colour is unchanged from the shipped design -- the semantic status.* tokens already read AA and
// mean the same thing everywhere. Only the shape changes: a squared tag with a filled marker,
// replacing the rounded pill that read as generic SaaS.
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
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-body text-xs font-semibold',
        TONE_CLASSES[tone],
      )}
    >
      {/* Filled marker in the tone colour (via currentColor). Keeps state legible without relying
          on the background alone, and echoes the roster/attention-rail language. aria-hidden
          because the text label carries the meaning for assistive tech. */}
      <span data-status-marker aria-hidden="true" className="h-1.5 w-1.5 rounded-[2px] bg-current opacity-90" />
      {children}
    </span>
  );
}
