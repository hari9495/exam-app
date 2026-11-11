import { createContext, useContext, useState, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, KeyRound, Lock, RotateCcw, X } from 'lucide-react';
import { cx } from '../lib/cx';
import { groupIndian } from '../lib/format';
import { Icon } from './foundations';
import { Button, IconButton } from './button';
import { FormField, useTooEarly } from './field';
import { TextArea } from './inputs';
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

export interface NoticeBarProps {
  tone?: 'info' | 'warning' | 'danger';
  /** One short line, e.g. "Add a passkey or an authenticator app by 2 Nov 2026." */
  children: ReactNode;
  /** The way to fix it: a link, e.g. <a className="yx-link" href="/me/security">Set it up</a>. */
  action?: ReactNode;
  /** Adds the close button. Leave it out when the notice may not be hidden (a deadline passed). */
  onDismiss?: () => void;
  dismissLabel?: string;
}

/** A one-line notice above every page (frame banner): icon, short text, one link, and a close button when it may be hidden. */
export function NoticeBar({ tone = 'warning', children, action, onDismiss, dismissLabel = 'Hide until tomorrow' }: NoticeBarProps) {
  return (
    <div className="yx-notice" data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon icon={ALERT_ICON[tone]} />
      <span className="yx-notice__text">{children}</span>
      {action && <span className="yx-notice__action">{action}</span>}
      {onDismiss && <IconButton icon={X} variant="ghost" size="sm" label={dismissLabel} onClick={onDismiss} />}
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
  /** Answer 947: the Not found reference support can look up. A "Not found" state takes the app's latest one by itself. */
  reference?: string;
}

/**
 * Answer 947: the app puts the reference of the last Not found answer for this page here (the API sends one with every
 * 404, the same whether the record is missing or in another company), and every "Not found" empty state shows it.
 */
export const NotFoundReferenceContext = createContext<string | null>(null);

/** First-use and filtered empty states: words and a way forward, no illustration (§26). */
export function EmptyState({ title, description, action, help, compact, icon, reference }: EmptyStateProps) {
  const latest = useContext(NotFoundReferenceContext);
  const ref = reference ?? (title === 'Not found' ? latest : null);
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
      {ref && <p className="yx-empty__ref">Reference {ref}</p>}
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
/** `grantedBy` names who can give access ("HR"); `note` is an optional extra sentence (why, or what it needs). */
export function NoAccessState({ grantedBy, what = 'this page', note }: { grantedBy: ReactNode; what?: ReactNode; note?: ReactNode }) {
  const useRequests = useContext(AccessRequestContext);
  return (
    <div className="yx-empty">
      <Icon icon={Lock} size="md" />
      <p className="yx-empty__title">You don't have access to {what}</p>
      <p className="yx-empty__desc">
        {note ? <>{note} </> : null}Ask {grantedBy} to give you access.
      </p>
      {useRequests && <RequestAccessLoader useRequests={useRequests} what={typeof what === 'string' ? what : 'this page'} />}
    </div>
  );
}

/** A request already sent from this page: when, and how it stands. */
export interface AccessRequestSent {
  askedAt: string;
  state: 'waiting' | 'open' | 'refused' | 'ended';
  /** The last day of open access ("12 Dec 2026"). */
  until?: string | null;
  /** The refusal note. */
  note?: string | null;
}

/**
 * Answer 946: the app gives every "You don't have access" page a Request access action (company settings "Allow access
 * requests" and "Longest access"). The request names the page; a System Admin decides it in Roles & access.
 */
export interface AccessRequests {
  maxDays: number;
  /** The latest request from this page, if any. */
  sent?: AccessRequestSent | null;
  send: (input: { what: string; reason: string; days: number }) => Promise<void>;
  /** Stories: the form shown open. */
  startOpen?: boolean;
}

/** A hook the app provides: it loads the company's rules and the latest request only when a no-access state shows. */
export const AccessRequestContext = createContext<(() => AccessRequests | null) | null>(null);

function RequestAccessLoader({ useRequests, what }: { useRequests: () => AccessRequests | null; what: string }) {
  const requests = useRequests();
  return requests ? <RequestAccess requests={requests} what={what} /> : null;
}

const SENT_TEXT: Record<AccessRequestSent['state'], (s: AccessRequestSent) => { tone: AlertTone; title: string; text?: string }> = {
  waiting: () => ({ tone: 'info', title: 'Access requested', text: 'A System Admin decides it. You get a notification either way.' }),
  open: (s) => ({ tone: 'success', title: 'Access given', text: s.until ? `Until ${s.until}. Reload the page to see it.` : 'Reload the page to see it.' }),
  refused: (s) => ({ tone: 'warning', title: 'Your request was refused', text: s.note ?? undefined }),
  ended: () => ({ tone: 'info', title: 'Your access ended', text: 'You can ask again.' }),
};

function RequestAccess({ requests, what }: { requests: AccessRequests; what: string }) {
  const [open, setOpen] = useState(Boolean(requests.startOpen));
  const [reason, setReason] = useState('');
  const lengths = [...[1, 7, 14, 30, 60, 90].filter((d) => d < requests.maxDays), requests.maxDays];
  const [days, setDays] = useState<string | null>(String(Math.min(7, requests.maxDays)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Never a disabled Send: pressed early, the field says what is missing and takes focus.
  const early = useTooEarly(
    [
      reason.trim().length < 10 && { fieldId: 'ra-reason', message: 'Say why you need access, in a sentence or more.' },
      !days && { fieldId: 'ra-days', message: 'Choose how long.' },
    ].filter(Boolean) as { fieldId: string; message: string }[],
  );
  const sent = requests.sent;
  if (!open && sent) {
    const t = SENT_TEXT[sent.state](sent);
    return (
      <div className="yx-empty__request">
        <InlineAlert tone={t.tone} title={t.title}>
          {t.text}
        </InlineAlert>
        {(sent.state === 'refused' || sent.state === 'ended') && (
          <div className="yx-empty__actions">
            <Button icon={KeyRound} onClick={() => setOpen(true)}>
              Ask again
            </Button>
          </div>
        )}
      </div>
    );
  }
  if (!open)
    return (
      <div className="yx-empty__actions">
        <Button variant="primary" icon={KeyRound} onClick={() => setOpen(true)}>
          Request access
        </Button>
      </div>
    );
  const close = () => {
    setOpen(false);
    setError(null);
    early.reset();
  };
  const send = async () => {
    if (early.stop()) return;
    setBusy(true);
    setError(null);
    try {
      await requests.send({ what, reason: reason.trim(), days: Number(days) });
      setReason('');
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not send it. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="yx-empty__request">
      {error && <InlineAlert tone="danger" title={error} />}
      <FormField id="ra-reason" label="Why do you need access?" required error={early.errorOf('ra-reason')} helper="A System Admin reads it, and it is kept on the record.">
        <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
      </FormField>
      <FormField id="ra-days" label="For how long" required error={early.errorOf('ra-days')} helper={`Up to ${requests.maxDays} days. Access ends by itself.`}>
        <Select aria-label="For how long" value={days} onChange={setDays} options={lengths.map((d) => ({ value: String(d), label: `${d} ${d === 1 ? 'day' : 'days'}` }))} />
      </FormField>
      <div className="yx-empty__actions">
        <Button onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" loading={busy} onClick={() => void send()}>
          Send request
        </Button>
      </div>
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
