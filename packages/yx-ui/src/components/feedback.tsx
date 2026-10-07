import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Lock, RotateCcw } from 'lucide-react';
import { cx } from '../lib/cx';
import { groupIndian } from '../lib/format';
import { Icon } from './foundations';
import { Button, IconButton } from './button';
import { Select } from './select';
import { Tooltip } from './tooltip';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger' | 'ai';

// AI uses the text badge, never a sparkle icon (§0, §8).
const ALERT_ICON = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: AlertCircle, ai: Info } as const;

export interface InlineAlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Buttons that resolve the alert, e.g. <Button size="sm">Retry</Button>. */
  actions?: ReactNode;
  className?: string;
}

/** Message tied to a form or section (§25). Errors use role="alert"; others are polite. */
export function InlineAlert({ tone = 'info', title, children, actions, className }: InlineAlertProps) {
  return (
    <div className={cx('yx-alert', className)} data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      {tone === 'ai' ? <span className="yx-badge" data-tone="ai">AI</span> : <Icon icon={ALERT_ICON[tone]} />}
      <div className="yx-alert__body">
        {title && <p className="yx-alert__title">{title}</p>}
        {children && <div className="yx-alert__text">{children}</div>}
        {actions && <div className="yx-alert__actions">{actions}</div>}
      </div>
    </div>
  );
}

export interface EmptyStateProps {
  /** One sentence: "No leave types yet." */
  title: ReactNode;
  description?: ReactNode;
  /** The primary way forward, e.g. <Button variant="primary">Add leave type</Button>. */
  action?: ReactNode;
  /** A help link, e.g. <Link>How leave types work</Link>. */
  help?: ReactNode;
  compact?: boolean;
  /** A 48 px colour icon (§8), e.g. <ColorIcon name="leave" size={48} />. Never an illustration (§9). */
  icon?: ReactNode;
}

/** First-use and filtered empty states: words and a way forward, no illustration (§26). */
export function EmptyState({ title, description, action, help, compact, icon }: EmptyStateProps) {
  return (
    <div className="yx-empty" data-compact={compact || undefined}>
      {icon}
      <p className="yx-empty__title">{title}</p>
      {description && <p className="yx-empty__desc">{description}</p>}
      {(action || help) && (
        <div className="yx-empty__actions">
          {action}
          {help}
        </div>
      )}
    </div>
  );
}

export interface ErrorStateProps {
  /** What failed: "We couldn't load employees." */
  title: ReactNode;
  /** What to do next. */
  description?: ReactNode;
  onRetry?: () => void;
  /** Shown so support can find the failure (§26). */
  reference?: string;
}

export function ErrorState({ title, description, onRetry, reference }: ErrorStateProps) {
  return (
    <div className="yx-empty" role="alert">
      <Icon icon={AlertCircle} size="md" className="yx-empty__icon--danger" />
      <p className="yx-empty__title">{title}</p>
      {description && <p className="yx-empty__desc">{description}</p>}
      {onRetry && (
        <div className="yx-empty__actions">
          <Button icon={RotateCcw} onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
      {reference && <p className="yx-empty__ref">Reference {reference}</p>}
    </div>
  );
}

/** Page or section the user cannot open: say who can grant access (§26). */
export function NoAccessState({ grantedBy, what = 'this page' }: { grantedBy: ReactNode; what?: ReactNode }) {
  return (
    <div className="yx-empty">
      <Icon icon={Lock} size="md" />
      <p className="yx-empty__title">You don't have access to {what}</p>
      <p className="yx-empty__desc">Ask {grantedBy} to give you access.</p>
    </div>
  );
}

/** Static placeholder in the shape of the real content (§26). No shimmer sweep; a gentle pulse only. */
export function Skeleton({ width = '100%', height, className }: { width?: string | number; height?: string | number; className?: string }) {
  return <span className={cx('yx-skeleton', className)} style={{ width, height }} aria-hidden="true" />;
}

export interface MeterProps {
  value: number;
  max: number;
  /** Accessible name, e.g. "Hours used". */
  label: string;
  /** % at which the bar turns amber, then red (M12 starter 80 / 100). */
  warnAt?: number;
  dangerAt?: number;
  /** Text after the bar; default "62%". */
  valueText?: ReactNode;
  /** Extra detail in a tooltip on the value text, e.g. "15 for 2026 + 4 carried from 2025". Also read out with the value. */
  hint?: string;
}

/** Budget burn, utilisation, quota. Colour plus the number, never colour alone (§3). */
export function Meter({ value, max, label, warnAt = 80, dangerAt = 100, valueText, hint }: MeterProps) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const tone = pct >= dangerAt ? 'danger' : pct >= warnAt ? 'warning' : 'normal';
  const text = valueText ?? `${Math.round(pct)}%`;
  return (
    <span className="yx-meter" data-tone={tone}>
      <span
        className="yx-meter__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={hint ? `${Math.round(pct)}%, ${hint}` : `${Math.round(pct)}%`}
      >
        <span className="yx-meter__fill" style={{ width: `${Math.min(pct, 100)}%` }} />
      </span>
      {hint ? (
        <Tooltip content={hint}>
          <span className="yx-meter__text" data-hint tabIndex={0}>
            {text}
          </span>
        </Tooltip>
      ) : (
        <span className="yx-meter__text">{text}</span>
      )}
    </span>
  );
}

export interface PaginationProps {
  page: number; // 1-based
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  pageSizes?: number[];
  onPageSizeChange?: (size: number) => void;
}

/** "1–50 of 248" with previous / next; bordered icon buttons (§15). */
export function Pagination({ page, pageSize, total: count, onPageChange, pageSizes = [25, 50, 100], onPageSizeChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const from = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(count, page * pageSize);
  return (
    <nav className="yx-pagination" aria-label="Pages">
      <span className="yx-pagination__range" aria-live="polite">
        {groupIndian(from)}–{groupIndian(to)} of {groupIndian(count)}
      </span>
      {onPageSizeChange && (
        <span className="yx-pagination__size">
          <Select
            size="sm"
            aria-label="Rows per page"
            value={String(pageSize)}
            onChange={(v) => v && onPageSizeChange(Number(v))}
            options={[...new Set([...pageSizes, pageSize])].sort((x, y) => x - y).map((s) => ({ value: String(s), label: `${s} per page` }))}
          />
        </span>
      )}
      <IconButton icon={ChevronLeft} label="Previous page" variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} />
      <span className="yx-pagination__page">
        Page {page} of {pages}
      </span>
      <IconButton icon={ChevronRight} label="Next page" variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)} />
    </nav>
  );
}
