import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import * as RT from '@radix-ui/react-tabs';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Info,
  RotateCcw,
  Square,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { formatDate, formatTime } from '../lib/format';
import { Button, IconButton, Link } from './button';
import { AiBadge, Avatar, Badge, PersonLabel, type BadgeTone } from './display';
import { EmptyState, Skeleton } from './feedback';
import { FormField } from './field';
import { Icon, Spinner, VisuallyHidden } from './foundations';
import { NumberField, TextArea } from './inputs';
import { Checkbox } from './choice';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { useControllable } from './overlay';

/* ======================= Toasts (§25) ======================= */

export type ToastTone = 'default' | 'success' | 'error';

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** Shows "Undo" wherever the action can be reversed (§25). */
  onUndo?: () => void;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastApi {
  /** Returns the toast id. Errors stay until closed; others close after 5 s. */
  toast: (t: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export const TOAST_DURATION = 5000;
export const TOAST_MAX = 3;

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>.');
  return api;
}

/** Bottom-left stack, at most 3 on screen; extra toasts wait in a queue until a slot frees (§25). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const [announce, setAnnounce] = useState({ polite: '', assertive: '' });
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setQueue((q) => q.filter((t) => t.id !== id)), []);
  const toast = useCallback((t: ToastOptions) => {
    const id = nextId.current++;
    setQueue((q) => [...q, { ...t, id }]);
    return id;
  }, []);

  const visible = queue.slice(0, TOAST_MAX);
  const shownKey = visible.map((t) => t.id).join(',');
  const announced = useRef(new Set<number>());
  // Announce each toast once, when it becomes visible, through live regions that always exist.
  useEffect(() => {
    for (const t of visible) {
      if (announced.current.has(t.id)) continue;
      announced.current.add(t.id);
      const text = [t.title, t.description].filter((x) => typeof x === 'string').join('. ');
      setAnnounce((a) => (t.tone === 'error' ? { ...a, assertive: text } : { ...a, polite: text }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);

  const [paused, setPaused] = useState(false);
  const hover = useRef(false);
  const focus = useRef(false);
  const sync = () => setPaused(hover.current || focus.current);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="yx-visually-hidden" aria-live="polite" role="status">
        {announce.polite}
      </div>
      <div className="yx-visually-hidden" aria-live="assertive" role="alert">
        {announce.assertive}
      </div>
      <section
        className="yx-toasts"
        aria-label="Notifications"
        onMouseEnter={() => {
          hover.current = true;
          sync();
        }}
        onMouseLeave={() => {
          hover.current = false;
          sync();
        }}
        onFocus={() => {
          focus.current = true;
          sync();
        }}
        onBlur={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          focus.current = false;
          sync();
        }}
      >
        {visible.length > 0 && (
          <ol className="yx-toasts__list">
            {visible.map((t) => (
              <Toast key={t.id} item={t} paused={paused} onDismiss={() => dismiss(t.id)} />
            ))}
          </ol>
        )}
      </section>
    </ToastContext.Provider>
  );
}

const TOAST_ICON = { default: Info, success: CheckCircle2, error: AlertCircle } as const;

function Toast({ item, paused, onDismiss }: { item: ToastItem; paused: boolean; onDismiss: () => void }) {
  const tone = item.tone ?? 'default';
  const remaining = useRef(TOAST_DURATION);
  useEffect(() => {
    if (paused || tone === 'error') return;
    const started = Date.now();
    const timer = setTimeout(onDismiss, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused, tone, onDismiss]);

  return (
    <li className="yx-toast" data-tone={tone}>
      <Icon icon={TOAST_ICON[tone]} />
      <div className="yx-toast__body">
        <p className="yx-toast__title">
          {tone === 'error' && <VisuallyHidden>Error: </VisuallyHidden>}
          {item.title}
        </p>
        {item.description && <p className="yx-toast__desc">{item.description}</p>}
      </div>
      {item.onUndo && (
        <Button
          size="sm"
          onClick={() => {
            item.onUndo?.();
            onDismiss();
          }}
        >
          Undo
        </Button>
      )}
      <IconButton icon={X} label="Close" size="sm" noTooltip onClick={onDismiss} />
    </li>
  );
}

/* ======================= Page banner (§25) ======================= */

export type BannerTone = 'info' | 'warning' | 'danger';
const BANNER_ICON = { info: Info, warning: AlertTriangle, danger: AlertCircle } as const;

export interface PageBannerProps {
  tone?: BannerTone;
  /** One sentence: "Your trial ends in 5 days." */
  children: ReactNode;
  /** A bordered button or link, e.g. <Button size="sm">Exit</Button>. */
  action?: ReactNode;
  /** Shows a close button. Leave unset when the state must stay visible (read-only, impersonation). */
  onDismiss?: () => void;
}

/** System-wide states only: trial, maintenance, read-only, impersonation (§25). Sits above the page header. */
export function PageBanner({ tone = 'info', children, action, onDismiss }: PageBannerProps) {
  return (
    <div className="yx-banner" data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon icon={BANNER_ICON[tone]} />
      <div className="yx-banner__text">{children}</div>
      {action && <div className="yx-banner__action">{action}</div>}
      {onDismiss && <IconButton icon={X} label="Dismiss" size="sm" onClick={onDismiss} />}
    </div>
  );
}

/* ======================= Reason popover (shared) ======================= */

interface ReasonPopoverProps {
  trigger: ReactElement;
  /** Field label: "Reason for rejecting". */
  label: string;
  /** Verb-first: "Reject", "Send back". */
  submitLabel: string;
  onSubmit: (reason: string) => void;
  /** Extra fields shown above the reason (e.g. reduced hours). */
  children?: ReactNode;
  /** Extra validation; return an error to block submit. */
  validate?: () => string | null;
  defaultOpen?: boolean;
  helper?: string;
}

function ReasonPopover({ trigger, label, submitLabel, onSubmit, children, validate, defaultOpen = false, helper = 'The employee sees this.' }: ReasonPopoverProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [extraError, setExtraError] = useState<string | null>(null);
  const change = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setReason('');
      setError(null);
      setExtraError(null);
    }
  };
  const submit = () => {
    const extra = validate?.() ?? null;
    const missing = reason.trim() ? null : 'Enter a reason. The employee sees it.';
    setExtraError(extra);
    setError(missing);
    if (extra || missing) return;
    onSubmit(reason.trim());
    change(false);
  };
  return (
    <Popover open={open} onOpenChange={change}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="yx-reason" align="end" aria-label={label}>
        <form
          className="yx-reason__form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {children}
          {extraError && (
            <p className="yx-reason__error" role="alert">
              {extraError}
            </p>
          )}
          <FormField label={label} required error={error} helper={helper}>
            <TextArea rows={3} value={reason} onChange={setReason} />
          </FormField>
          <div className="yx-reason__actions">
            <Button size="sm" onClick={() => change(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit">
              {submitLabel}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/* ======================= Notification centre (§32, APX-A) ======================= */

export interface NotificationItem {
  id: string;
  actor: { name: string; src?: string | null };
  /** "Divya Raghunathan applied for 3 days of casual leave" */
  text: ReactNode;
  at: Date;
  read: boolean;
  href?: string;
  /** Low-risk approvals can be approved right here (§14, P03). */
  approval?: { onApprove: () => void | Promise<void>; approved?: boolean };
}

export interface NotificationCentreProps {
  items: NotificationItem[];
  onMarkAllRead: () => void;
  /** Called when an item is opened. */
  onOpenItem?: (item: NotificationItem) => void;
  settingsHref: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Reference time for Today / Yesterday grouping. Defaults to now. */
  now?: Date;
  loading?: boolean;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY = 86_400_000;
export function dayLabel(d: Date, now: Date): string {
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : formatDate(d);
}
const timeOf = (d: Date) => formatTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);

function groupByDay<T extends { at: Date }>(items: T[], now: Date) {
  const groups: { label: string; items: T[] }[] = [];
  for (const it of [...items].sort((a, b) => b.at.getTime() - a.at.getTime())) {
    const label = dayLabel(it.at, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(it);
    else groups.push({ label, items: [it] });
  }
  return groups;
}

export function NotificationCentre({ items, onMarkAllRead, onOpenItem, settingsHref, open, defaultOpen = false, onOpenChange, now, loading }: NotificationCentreProps) {
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange);
  const unread = items.filter((i) => !i.read).length;
  const ref = now ?? new Date();
  const label = unread ? `Notifications, ${unread} unread` : 'Notifications';

  const list = (shown: NotificationItem[], empty: string) =>
    loading ? (
      <div className="yx-notif__loading" role="status" aria-busy="true" aria-label="Loading notifications">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={40} />
        ))}
      </div>
    ) : shown.length === 0 ? (
      <EmptyState compact title={empty} />
    ) : (
      groupByDay(shown, ref).map((g) => (
        <section key={g.label} className="yx-notif__group" aria-label={g.label}>
          <h3 className="yx-notif__day">{g.label}</h3>
          <ul className="yx-notif__list">
            {g.items.map((it) => (
              <NotificationRow key={it.id} item={it} onOpen={onOpenItem} />
            ))}
          </ul>
        </section>
      ))
    );

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <span className="yx-notif__bell">
        <PopoverTrigger asChild>
          <IconButton icon={Bell} label={label} />
        </PopoverTrigger>
        {unread > 0 && (
          <span className="yx-notif__count" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </span>
      <PopoverContent
        className="yx-notif"
        align="end"
        aria-label="Notifications"
        // Focus the selected tab, never "Mark all read": Enter on open must not clear everything (founder review 30 Sep 2026).
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
        }}
      >
        <header className="yx-notif__head">
          <h2 className="yx-notif__title">Notifications</h2>
          <Button size="sm" onClick={onMarkAllRead} disabled={unread === 0}>
            Mark all read
          </Button>
        </header>
        <RT.Root defaultValue="all" className="yx-notif__tabs">
          <RT.List className="yx-ntabs" aria-label="Show">
            <RT.Trigger value="all" className="yx-ntabs__tab">
              All
            </RT.Trigger>
            <RT.Trigger value="unread" className="yx-ntabs__tab">
              Unread <span className="yx-ntabs__count">{unread}</span>
            </RT.Trigger>
          </RT.List>
          <RT.Content value="all" className="yx-notif__panel">
            {list(items, 'No notifications yet. Approvals, payslips and reminders will show up here.')}
          </RT.Content>
          <RT.Content value="unread" className="yx-notif__panel">
            {list(
              items.filter((i) => !i.read),
              "You're all caught up. No unread notifications.",
            )}
          </RT.Content>
        </RT.Root>
        <footer className="yx-notif__foot">
          <Link href={settingsHref}>Notification settings</Link>
        </footer>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({ item, onOpen }: { item: NotificationItem; onOpen?: (i: NotificationItem) => void }) {
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    setBusy(true);
    try {
      await item.approval?.onApprove();
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="yx-notif__item" data-unread={!item.read || undefined}>
      <Avatar name={item.actor.name} src={item.actor.src} size={32} />
      <div className="yx-notif__main">
        {item.href ? (
          <a className="yx-notif__text" href={item.href} onClick={() => onOpen?.(item)}>
            {item.text}
          </a>
        ) : (
          <p className="yx-notif__text">{item.text}</p>
        )}
        <span className="yx-notif__time">{timeOf(item.at)}</span>
        {item.approval &&
          (item.approval.approved ? (
            <Badge tone="success">Approved</Badge>
          ) : (
            <div className="yx-notif__actions">
              <Button variant="approve" size="sm" loading={busy} onClick={approve}>
                Approve
              </Button>
              {item.href && (
                <Button variant="review" size="sm" asChild>
                  <a href={item.href} onClick={() => onOpen?.(item)}>
                    View
                  </a>
                </Button>
              )}
            </div>
          ))}
      </div>
      {!item.read && (
        <span className="yx-notif__dot">
          <VisuallyHidden>Unread</VisuallyHidden>
        </span>
      )}
    </li>
  );
}

/* ======================= Approvals inbox (§32) ======================= */

export type ApprovalType = 'leave' | 'expense' | 'timesheet' | 'offer' | 'regularisation';
export const APPROVAL_TYPE_LABEL: Record<ApprovalType, string> = {
  leave: 'Leave',
  expense: 'Expense',
  timesheet: 'Timesheet',
  offer: 'Offer',
  regularisation: 'Attendance regularisation',
};

export interface ApprovalItem {
  id: string;
  requester: { name: string; src?: string | null; secondary?: ReactNode };
  type: ApprovalType;
  /** "Casual leave · 3 days" */
  summary: ReactNode;
  /** Formatted amount or dates: "₹12,450" or "06 Oct – 08 Oct 2026". */
  detail?: ReactNode;
  /** Policy-check result; a flag always says why. */
  policy: { ok: true } | { ok: false; reason: string };
  /** Only low-risk items can be bulk approved (§32). */
  lowRisk?: boolean;
}

export interface ApprovalInboxProps {
  items: ApprovalItem[];
  onApprove: (ids: string[]) => void;
  onReject: (id: string, reason: string) => void;
  loading?: boolean;
  /** Stories: open the reject popover for this row. */
  defaultRejectId?: string;
  defaultType?: ApprovalType | 'all';
}

export function ApprovalInbox({ items, onApprove, onReject, loading, defaultRejectId, defaultType = 'all' }: ApprovalInboxProps) {
  const [tab, setTab] = useState<ApprovalType | 'all'>(defaultType);
  const [selected, setSelected] = useState<string[]>([]);
  const shown = tab === 'all' ? items : items.filter((i) => i.type === tab);
  const selectable = shown.filter((i) => i.lowRisk);
  const picked = selected.filter((id) => selectable.some((i) => i.id === id));
  const count = (t: ApprovalType) => items.filter((i) => i.type === t).length;

  const approve = (ids: string[]) => {
    onApprove(ids);
    setSelected((s) => s.filter((x) => !ids.includes(x)));
  };

  return (
    <section className="yx-inbox" aria-label="Approvals waiting for you">
      <RT.Root value={tab} onValueChange={(v) => setTab(v as ApprovalType | 'all')}>
        <RT.List className="yx-ntabs" aria-label="Filter by type">
          <RT.Trigger value="all" className="yx-ntabs__tab">
            All <span className="yx-ntabs__count">{items.length}</span>
          </RT.Trigger>
          {(Object.keys(APPROVAL_TYPE_LABEL) as ApprovalType[]).map((t) => (
            <RT.Trigger key={t} value={t} className="yx-ntabs__tab">
              {APPROVAL_TYPE_LABEL[t]} <span className="yx-ntabs__count">{count(t)}</span>
            </RT.Trigger>
          ))}
        </RT.List>
        <RT.Content value={tab} className="yx-inbox__panel">
      {selectable.length > 0 && (
        <div className="yx-inbox__bulk">
          <Checkbox
            label={picked.length ? `${picked.length} selected` : 'Select all low-risk'}
            checked={picked.length === 0 ? false : picked.length === selectable.length ? true : 'indeterminate'}
            onChange={(c) => setSelected(c ? selectable.map((i) => i.id) : [])}
          />
          <Button size="sm" disabled={picked.length === 0} onClick={() => approve(picked)}>
            Approve selected
          </Button>
          <span className="yx-inbox__hint">Only low-risk requests can be approved together.</span>
        </div>
      )}

      {loading ? (
        <div className="yx-inbox__list" role="status" aria-busy="true" aria-label="Loading approvals">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="yx-inbox__row">
              <Skeleton width="60%" height={32} />
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          title={tab === 'all' ? 'Nothing waiting for you' : `No ${APPROVAL_TYPE_LABEL[tab].toLowerCase()} requests waiting for you`}
          description={tab === 'all' ? 'New requests from your team will appear here.' : undefined}
        />
      ) : (
        <ul className="yx-inbox__list">
          {shown.map((it) => (
            <li key={it.id} className="yx-inbox__row">
              <span className="yx-inbox__select">
                {it.lowRisk && (
                  <Checkbox
                    aria-label={`Select ${it.requester.name}'s ${APPROVAL_TYPE_LABEL[it.type].toLowerCase()} request`}
                    checked={selected.includes(it.id)}
                    onChange={(c) => setSelected((s) => (c ? [...s, it.id] : s.filter((x) => x !== it.id)))}
                  />
                )}
              </span>
              <span className="yx-inbox__who">
                <PersonLabel name={it.requester.name} src={it.requester.src} secondary={it.requester.secondary} size={32} />
              </span>
              <span className="yx-inbox__what">
                <Badge>{APPROVAL_TYPE_LABEL[it.type]}</Badge>
                <span className="yx-inbox__summary">{it.summary}</span>
                {it.detail && <span className="yx-inbox__detail">{it.detail}</span>}
              </span>
              <span className="yx-inbox__policy">
                {it.policy.ok ? (
                  <Badge tone="success">Within policy</Badge>
                ) : (
                  <>
                    <Badge tone="warning">Flagged</Badge>
                    <span className="yx-inbox__reason">{it.policy.reason}</span>
                  </>
                )}
              </span>
              <span className="yx-inbox__actions">
                <Button variant="approve" size="sm" onClick={() => approve([it.id])} aria-label={`Approve ${it.requester.name}'s request`}>
                  Approve
                </Button>
                <ReasonPopover
                  trigger={
                    <Button size="sm" aria-label={`Reject ${it.requester.name}'s request`}>
                      Reject
                    </Button>
                  }
                  label="Reason for rejecting"
                  submitLabel="Reject"
                  defaultOpen={defaultRejectId === it.id}
                  onSubmit={(r) => onReject(it.id, r)}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
        </RT.Content>
      </RT.Root>
    </section>
  );
}

/* ======================= Timesheet approval (M12 YX-PRJ-04) ======================= */

export interface TimesheetApprovalLine {
  id: string;
  project: string;
  task?: string;
  hours: number;
  billable?: boolean;
}

export type LineDecision =
  | { status: 'approved' }
  | { status: 'rejected'; reason: string }
  | { status: 'reduced'; hours: number; reason: string };

export interface TimesheetApprovalCardProps {
  employee: { name: string; src?: string | null; secondary?: ReactNode };
  /** "Week of 21 Sep 2026" */
  weekLabel: ReactNode;
  lines: TimesheetApprovalLine[];
  /** Every line decided; lines left undecided are approved as submitted. */
  onApprove: (decisions: Record<string, LineDecision>) => void;
  onSendBack: (reason: string) => void;
  defaultDecisions?: Record<string, LineDecision>;
}

const hrs = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} h`;

/** Approved hours count after reductions; rejected lines count zero. */
export function approvedHours(lines: TimesheetApprovalLine[], decisions: Record<string, LineDecision>) {
  return lines.reduce((sum, l) => {
    const d = decisions[l.id];
    return sum + (d?.status === 'rejected' ? 0 : d?.status === 'reduced' ? d.hours : l.hours);
  }, 0);
}

const DECISION_BADGE: Record<LineDecision['status'], [BadgeTone, string]> = {
  approved: ['success', 'Approved'],
  rejected: ['danger', 'Rejected'],
  reduced: ['warning', 'Reduced'],
};

export function TimesheetApprovalCard({ employee, weekLabel, lines, onApprove, onSendBack, defaultDecisions = {} }: TimesheetApprovalCardProps) {
  const [decisions, setDecisions] = useState<Record<string, LineDecision>>(defaultDecisions);
  const decide = (id: string, d: LineDecision | null) =>
    setDecisions((all) => {
      const next = { ...all };
      if (d) next[id] = d;
      else delete next[id];
      return next;
    });
  const submitted = lines.reduce((s, l) => s + l.hours, 0);
  const approving = approvedHours(lines, decisions);

  return (
    <article className="yx-tsa" aria-label={`Timesheet for ${employee.name}`}>
      <header className="yx-tsa__head">
        <PersonLabel name={employee.name} src={employee.src} secondary={employee.secondary} size={40} />
        <span className="yx-tsa__week">{weekLabel}</span>
      </header>
      <ul className="yx-tsa__lines">
        {lines.map((l) => (
          <TimesheetLineRow key={l.id} line={l} decision={decisions[l.id]} onDecide={(d) => decide(l.id, d)} />
        ))}
      </ul>
      <dl className="yx-tsa__totals" aria-live="polite">
        <div>
          <dt>Submitted</dt>
          <dd>{hrs(submitted)}</dd>
        </div>
        <div>
          <dt>To approve</dt>
          <dd data-testid="tsa-approving">{hrs(approving)}</dd>
        </div>
      </dl>
      <footer className="yx-tsa__foot">
        <ReasonPopover
          trigger={<Button>Send back</Button>}
          label="What should they fix?"
          submitLabel="Send back"
          onSubmit={onSendBack}
        />
        <Button
          variant="primary"
          onClick={() =>
            onApprove(Object.fromEntries(lines.map((l) => [l.id, decisions[l.id] ?? ({ status: 'approved' } as LineDecision)])))
          }
        >
          Approve all
        </Button>
      </footer>
    </article>
  );
}

function TimesheetLineRow({ line, decision, onDecide }: { line: TimesheetApprovalLine; decision?: LineDecision; onDecide: (d: LineDecision | null) => void }) {
  const [newHours, setNewHours] = useState<number | null>(null);
  const name = line.task ? `${line.project} · ${line.task}` : line.project;
  const badge = decision && DECISION_BADGE[decision.status];
  return (
    <li className="yx-tsa__line" data-status={decision?.status}>
      <div className="yx-tsa__what">
        <span className="yx-tsa__project">{line.project}</span>
        {line.task && <span className="yx-tsa__task">{line.task}</span>}
        {line.billable && <span className="yx-tsa__task">Billable</span>}
      </div>
      <div className="yx-tsa__hours">
        {decision?.status === 'reduced' ? (
          <>
            <s aria-label={`Submitted ${hrs(line.hours)}`}>{hrs(line.hours)}</s> <strong>{hrs(decision.hours)}</strong>
          </>
        ) : (
          hrs(line.hours)
        )}
      </div>
      <div className="yx-tsa__decision">
        {badge ? (
          <>
            <Badge tone={badge[0]}>{badge[1]}</Badge>
            <IconButton icon={RotateCcw} label={`Undo decision for ${name}`} size="sm" onClick={() => onDecide(null)} />
          </>
        ) : (
          <>
            <Button variant="approve" size="sm" aria-label={`Approve ${name}`} onClick={() => onDecide({ status: 'approved' })}>
              Approve
            </Button>
            <ReasonPopover
              trigger={
                <Button size="sm" aria-label={`Reduce hours for ${name}`}>
                  Reduce
                </Button>
              }
              label="Reason for reducing"
              submitLabel="Reduce hours"
              validate={() =>
                newHours == null || newHours < 0 || newHours >= line.hours ? `Enter fewer hours than the ${hrs(line.hours)} submitted.` : null
              }
              onSubmit={(reason) => onDecide({ status: 'reduced', hours: newHours as number, reason })}
            >
              <FormField label="Approved hours" required helper={`Submitted ${hrs(line.hours)}`}>
                <NumberField value={newHours} onChange={setNewHours} decimals min={0} max={line.hours} />
              </FormField>
            </ReasonPopover>
            <ReasonPopover
              trigger={
                <Button size="sm" aria-label={`Reject ${name}`}>
                  Reject
                </Button>
              }
              label="Reason for rejecting"
              submitLabel="Reject"
              onSubmit={(reason) => onDecide({ status: 'rejected', reason })}
            />
          </>
        )}
      </div>
      {decision && decision.status !== 'approved' && <p className="yx-tsa__reason">Reason: {decision.reason}</p>}
    </li>
  );
}

/* ======================= Milestone moment (§7 delight) ======================= */

export interface MilestoneMomentProps {
  /** "Payroll for September 2026 is locked" */
  title: ReactNode;
  /** One line: "248 payslips are ready to publish." */
  description?: ReactNode;
  /** One action, e.g. <Button variant="primary">Publish payslips</Button>. */
  action?: ReactNode;
}

/** Rare milestone confirmation: a check mark that draws once (≤ 600 ms). No confetti, no bounce; static under reduced motion. */
export function MilestoneMoment({ title, description, action }: MilestoneMomentProps) {
  return (
    <div className="yx-milestone" role="status">
      <svg className="yx-milestone__mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle className="yx-milestone__ring" cx="24" cy="24" r="22" pathLength={1} />
        <path className="yx-milestone__check" d="M15 24.5l6 6 12-13" pathLength={1} />
      </svg>
      <p className="yx-milestone__title">{title}</p>
      {description && <p className="yx-milestone__desc">{description}</p>}
      {action && <div className="yx-milestone__action">{action}</div>}
    </div>
  );
}

/* ======================= AI assistant panel (§45) ======================= */

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: ReactNode;
  /** Policies, records or reports the answer is based on. */
  sources?: { label: string; href: string }[];
  /** Shown when the answer is uncertain: what is unclear and how to check. */
  uncertain?: ReactNode;
  feedback?: 'up' | 'down';
}

export interface AssistantActionPreview {
  /** "Update Divya Raghunathan's leave balance" */
  title: ReactNode;
  changes: { field: string; from: ReactNode; to: ReactNode }[];
  onConfirm: () => void;
  onCancel: () => void;
  confirming?: boolean;
}

export interface AssistantPanelProps {
  messages: AssistantMessage[];
  onSend: (text: string) => void;
  generating?: boolean;
  onStop?: () => void;
  onFeedback?: (id: string, value: 'up' | 'down') => void;
  /** Any data change waits here for Confirm (§45). */
  preview?: AssistantActionPreview;
  onClose?: () => void;
  defaultDraft?: string;
}

export function AssistantPanel({ messages, onSend, generating, onStop, onFeedback, preview, onClose, defaultDraft = '' }: AssistantPanelProps) {
  const [draft, setDraft] = useState(defaultDraft);
  const send = () => {
    const text = draft.trim();
    if (!text || generating) return;
    onSend(text);
    setDraft('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <aside className="yx-assistant" aria-label="Ask YukthiX">
      <header className="yx-assistant__head">
        <h2 className="yx-assistant__title">Ask YukthiX</h2>
        <AiBadge />
        {onClose && <IconButton icon={X} label="Close assistant" onClick={onClose} />}
      </header>

      <div className="yx-assistant__log" role="log" aria-live="polite">
        <ol className="yx-assistant__list">
        {messages.map((m) => (
          <li key={m.id} className="yx-assistant__msg" data-role={m.role}>
            <VisuallyHidden>{m.role === 'user' ? 'You said' : 'YukthiX said'}</VisuallyHidden>
            <div className="yx-assistant__bubble">{m.text}</div>
            {m.uncertain && (
              <p className="yx-assistant__uncertain">
                <Icon icon={AlertTriangle} />
                <span>
                  <strong>Not certain.</strong> {m.uncertain}
                </span>
              </p>
            )}
            {m.sources && m.sources.length > 0 && (
              <div className="yx-assistant__sources">
                <span>Sources</span>
                <ul>
                  {m.sources.map((s) => (
                    <li key={s.href}>
                      <Link href={s.href}>{s.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {m.role === 'assistant' && onFeedback && (
              <div className="yx-assistant__feedback">
                <IconButton icon={ThumbsUp} label="Helpful" size="sm" aria-pressed={m.feedback === 'up'} onClick={() => onFeedback(m.id, 'up')} />
                <IconButton icon={ThumbsDown} label="Not helpful" size="sm" aria-pressed={m.feedback === 'down'} onClick={() => onFeedback(m.id, 'down')} />
              </div>
            )}
          </li>
        ))}
        {generating && (
          <li className="yx-assistant__generating">
            <Spinner />
            <span>Writing an answer</span>
            {onStop && (
              <Button size="sm" icon={Square} onClick={onStop}>
                Stop
              </Button>
            )}
          </li>
        )}
      </ol>
      </div>

      {preview && (
        <section className="yx-assistant__preview" aria-label="Review this change">
          <div className="yx-assistant__preview-head">
            <AiBadge />
            <span className="yx-assistant__preview-title">{preview.title}</span>
          </div>
          <p className="yx-assistant__preview-lead">This will change:</p>
          <ul className="yx-assistant__changes">
            {preview.changes.map((c) => (
              <li key={c.field}>
                <span className="yx-assistant__field">{c.field}</span>
                <span className="yx-assistant__diff">
                  <VisuallyHidden>from </VisuallyHidden>
                  <s>{c.from}</s>
                  <span aria-hidden="true"> → </span>
                  <VisuallyHidden> to </VisuallyHidden>
                  <strong>{c.to}</strong>
                </span>
              </li>
            ))}
          </ul>
          <p className="yx-assistant__preview-note">Nothing changes until you confirm.</p>
          <div className="yx-assistant__preview-actions">
            <Button onClick={preview.onCancel} disabled={preview.confirming}>
              Cancel
            </Button>
            <Button variant="primary" loading={preview.confirming} onClick={preview.onConfirm}>
              Confirm
            </Button>
          </div>
        </section>
      )}

      <form
        className="yx-assistant__composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <FormField label="Ask a question" hideLabel helper="Enter to send, Shift+Enter for a new line">
          <TextArea rows={2} value={draft} onChange={setDraft} onKeyDown={onKeyDown} placeholder="Ask about leave, pay or policies" />
        </FormField>
        <Button type="submit" variant={preview ? 'secondary' : 'primary'} disabled={generating}>
          Send
        </Button>
      </form>
    </aside>
  );
}
