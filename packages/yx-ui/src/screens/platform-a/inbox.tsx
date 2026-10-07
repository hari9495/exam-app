// Notifications, approvals, request sheet, my requests, delegation (PLT-03…07; APX-D §1.1 Approvals).
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowLeftRight, BellOff, Briefcase, CalendarDays, CalendarPlus, Check, CheckCheck, ChevronLeft, ChevronRight, Clock, FileText, Laptop, Mail, MailOpen, MoreHorizontal, Plus, Receipt, Settings as SettingsIcon, Wallet } from 'lucide-react';
import { PageHeader, Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Button, IconButton, Link } from '../../components/button';
import { Badge, PersonLabel, Avatar } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { BottomSheet, ConfirmDialog } from '../../components/overlay';
import { ApprovalTimeline, type ApprovalStep } from '../../components/timeline';
import { FormField, FieldRow } from '../../components/field';
import { CurrencyField, TextArea, TextField } from '../../components/inputs';
import { FileUpload } from '../../components/upload';
import { Select, PersonPicker } from '../../components/select';
import { DatePicker } from '../../components/date';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../components/menu';
import { Icon } from '../../components/foundations';
import type { TableColumn } from '../../components/table';
import { formatDate, formatINR } from '../../lib/format';
import { dayLabel } from '../../components/notify';
import { timeOf } from '../../lib/dates';
import { DesktopFrame, PhoneFrame } from '../_kit/frames';
import { HOLIDAYS_2026, ME, TODAY } from '../_kit/data';
import { ListPage, bulkApprovable, homePanel, leaveEffect, toneFor, validateDelegation } from './platform-kit';
import { PEOPLE, type ApprovalRow, type MyRequest, type NotifCategory, type PlatformNotification } from './platform-data';

/* ================================================================ PLT-03 Notifications inbox */

const CATEGORIES: (NotifCategory | 'All')[] = ['All', 'Approvals', 'Leave & time', 'Pay', 'Tasks', 'Hiring', 'From YukthiX'];

function groupNotifs(items: PlatformNotification[]) {
  const out: { label: string; items: PlatformNotification[] }[] = [];
  for (const n of [...items].sort((a, b) => b.at.getTime() - a.at.getTime())) {
    const label = dayLabel(n.at, TODAY);
    const last = out[out.length - 1];
    if (last?.label === label) last.items.push(n);
    else out.push({ label, items: [n] });
  }
  return out;
}

export interface NotificationsInboxProps {
  items: PlatformNotification[];
  defaultCategory?: NotifCategory | 'All';
  defaultUnreadOnly?: boolean;
  state?: 'ready' | 'loading' | 'error';
}

function NotificationList({ items: initial, defaultCategory = 'All', defaultUnreadOnly = false, state = 'ready', compact }: NotificationsInboxProps & { compact?: boolean }) {
  const [items, setItems] = useState(initial);
  const [cat, setCat] = useState<string>(defaultCategory);
  const [unreadOnly, setUnreadOnly] = useState(defaultUnreadOnly);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [live, setLive] = useState('');
  const shown = items.filter((n) => (cat === 'All' || n.category === cat) && (!unreadOnly || !n.read));
  const unread = items.filter((n) => !n.read).length;
  // Grouped notifications ("Show 2 more") live inside their parent; every change applies at both levels.
  const mapAll = (fn: (x: PlatformNotification) => PlatformNotification) =>
    setItems((xs) => xs.map((x) => fn({ ...x, moreItems: x.moreItems?.map(fn) })));
  const update = (ids: string[], patch: Partial<PlatformNotification>) => mapAll((x) => (ids.includes(x.id) ? { ...x, ...patch } : x));
  const approve = (ns: PlatformNotification[]) => {
    mapAll((x) => (ns.some((n) => n.id === x.id) ? { ...x, read: true, approvable: false, text: `${x.text} · approved by you` } : x));
    setLive(ns.length === 1 ? `Approved. ${ns[0].actor} will be notified.` : `${ns.length} requests approved. Each person will be notified.`);
  };
  const actions: RowActions = {
    open: (n) => update([n.id], { read: true }),
    approve: (n) => approve([n]),
    toggleRead: (n) => {
      update([n.id], { read: !n.read });
      setLive(n.read ? 'Marked as unread.' : 'Marked as read.');
    },
    snooze: (n) => {
      setItems((xs) => xs.filter((x) => x.id !== n.id).map((x) => ({ ...x, moreItems: x.moreItems?.filter((m) => m.id !== n.id) })));
      setLive('Moved. It comes back tomorrow at 9:00 am.');
    },
    mute: (n) => {
      setItems((xs) => xs.filter((x) => x.category !== n.category || x.approvable));
      setLive(`You won't be notified about ${n.category.toLowerCase()} any more. Turn it back on in Notification preferences.`);
    },
    select: (n, on) =>
      setSelected((s) => {
        const next = new Set(s);
        if (on) next.add(n.id);
        else next.delete(n.id);
        return next;
      }),
    selected,
  };
  const picked = items.flatMap((n) => [n, ...(n.moreItems ?? [])]).filter((n) => selected.has(n.id));
  const pickedApprovable = picked.filter((n) => n.approvable);
  const cats = compact ? CATEGORIES.slice(0, 4) : CATEGORIES;
  return (
    <Tabs value={cat} onValueChange={setCat} className="yx-plt-stack">
      <div className="yx-plt-row" data-justify="between">
        <TabsList aria-label="Category">
          {cats.map((c) => (
            <TabsTrigger key={c} value={c} count={c === 'All' ? undefined : items.filter((n) => n.category === c && !n.read).length || undefined}>
              {c}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="yx-plt-row">
          <Switch label="Unread only" checked={unreadOnly} onChange={setUnreadOnly} />
          <Button size="sm" icon={CheckCheck} disabled={unread === 0} onClick={() => mapAll((x) => ({ ...x, read: true }))}>
            Mark all read
          </Button>
        </div>
      </div>
      {selected.size > 0 && (
        <div className="yx-plt-bulk" role="group" aria-label="Selected notifications">
          <strong>{selected.size} selected</strong>
          <Button
            size="sm"
            icon={CheckCheck}
            onClick={() => {
              update([...selected], { read: true });
              setLive(`${selected.size} marked as read.`);
              setSelected(new Set());
            }}
          >
            Mark as read
          </Button>
          {pickedApprovable.length > 0 && (
            <Button variant="approve"
              size="sm"
              icon={Check}
              onClick={() => {
                approve(pickedApprovable);
                setSelected(new Set());
              }}
            >
              Approve {pickedApprovable.length}
            </Button>
          )}
          <Button size="sm" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}
      <span className="yx-visually-hidden" aria-live="polite">
        {live}
      </span>
      {cats.map((c) => (
        <TabsContent key={c} value={c} forceMount hidden={c !== cat} className="yx-plt-stack">
          {c === cat && (
            <NotificationBody
              state={state}
              shown={shown}
              unreadOnly={unreadOnly}
              cat={cat}
              onShowAll={() => {
                setCat('All');
                setUnreadOnly(false);
              }}
              actions={actions}
            />
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}

interface RowActions {
  open: (n: PlatformNotification) => void;
  approve: (n: PlatformNotification) => void;
  toggleRead: (n: PlatformNotification) => void;
  snooze: (n: PlatformNotification) => void;
  mute: (n: PlatformNotification) => void;
  select: (n: PlatformNotification, on: boolean) => void;
  selected: Set<string>;
}

/** One notification row (founder review 30 Sep 2026): whole row opens it, plain text (bold when unread), tint + dot for
 * unread like the bell, View + Approve, ⋯ for read / later / stop, a checkbox for bulk actions. */
function NotificationRow({ n, actions, nested }: { n: PlatformNotification; actions: RowActions; nested?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const more = n.moreItems?.length ?? 0;
  return (
    <li className="yx-plt-notif" data-unread={!n.read || undefined}>
      <span className="yx-plt-notif__check">
        <Checkbox aria-label={`Select: ${n.text}`} checked={actions.selected.has(n.id)} onChange={(on) => actions.select(n, on)} />
      </span>
      <Avatar name={n.actor} size={32} />
      <div className="yx-plt-notif__main">
        <a
          href="#"
          className="yx-plt-notif__text"
          onClick={(e) => {
            e.preventDefault();
            actions.open(n);
          }}
        >
          {!n.read && <span className="yx-visually-hidden">Unread: </span>}
          {n.text}
        </a>
        <span className="yx-plt-muted">
          {n.category} · {timeOf(n.at)}
        </span>
        {!nested && more > 0 && (
          <span className="yx-plt-notif__more">
            <Button size="sm" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Hide' : `Show ${more} more like this`}
            </Button>
          </span>
        )}
        {expanded && n.moreItems && (
          <ul className="yx-plt-notifs yx-plt-notifs--nested">
            {n.moreItems.map((m) => (
              <NotificationRow key={m.id} n={m} actions={actions} nested />
            ))}
          </ul>
        )}
      </div>
      <div className="yx-plt-notif__actions">
        {n.approvable && (
          <>
            <Button variant="review" size="sm" onClick={() => actions.open(n)}>
              View
            </Button>
            <Button variant="approve" size="sm" icon={Check} onClick={() => actions.approve(n)}>
              Approve
            </Button>
          </>
        )}
        <Menu>
          <MenuTrigger asChild>
            <IconButton icon={MoreHorizontal} label={`More for: ${n.text}`} size="sm" />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem icon={n.read ? MailOpen : Mail} onSelect={() => actions.toggleRead(n)}>
              {n.read ? 'Mark as unread' : 'Mark as read'}
            </MenuItem>
            <MenuItem icon={Clock} onSelect={() => actions.snooze(n)}>
              Remind me tomorrow, 9:00 am
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={BellOff} onSelect={() => actions.mute(n)}>
              Stop notifying me about {n.category.toLowerCase()}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </li>
  );
}

function NotificationBody({ state, shown, unreadOnly, cat, onShowAll, actions }: {
  state: NotificationsInboxProps['state'];
  shown: PlatformNotification[];
  unreadOnly: boolean;
  cat: string;
  onShowAll: () => void;
  actions: RowActions;
}) {
  return (
    <>
      {state === 'loading' ? (
        <div className="yx-plt-stack" role="status" aria-label="Loading notifications">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={48} />
          ))}
        </div>
      ) : state === 'error' ? (
        <ErrorState title="Notifications didn't load" description="Check your connection and try again. Your approvals are safe." onRetry={() => {}} reference="NTF-2291" />
      ) : shown.length === 0 ? (
        <EmptyState
          title={unreadOnly || cat !== 'All' ? 'Nothing here for this filter.' : 'No notifications yet.'}
          description={unreadOnly || cat !== 'All' ? "You're all caught up." : 'Approvals, payslips and reminders will show up here.'}
          action={unreadOnly || cat !== 'All' ? <Button onClick={onShowAll}>Show all</Button> : undefined}
        />
      ) : (
        groupNotifs(shown).map((g) => (
          <section key={g.label} aria-label={g.label} className="yx-plt-stack" data-gap="sm">
            <h2 className="yx-plt-h">{g.label}</h2>
            <ul className="yx-plt-notifs">
              {g.items.map((n) => (
                <NotificationRow key={n.id} n={n} actions={actions} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

// PLT-03 · Notifications inbox (desktop). Personal page: no company / period button.
export function NotificationsInboxScreen(props: NotificationsInboxProps) {
  const unread = props.items.filter((n) => !n.read).length;
  return (
    <DesktopFrame area="home" panelTitle="Home" panel={homePanel('Notifications')} scope="none">
      <PageHeader
        title="Notifications"
        facts={`${unread} unread`}
        description="Updates about your requests, approvals, pay and tasks."
        actions={<Button icon={SettingsIcon}>Notification preferences</Button>}
      />
      <NotificationList {...props} />
    </DesktopFrame>
  );
}

// PLT-03 · Notifications inbox (phone, Home to-dos).
export function NotificationsInboxPhone(props: NotificationsInboxProps) {
  return (
    <PhoneFrame tab="home" title="Notifications" back={<IconButton icon={ArrowLeft} label="Back" />} actions={<IconButton icon={SettingsIcon} label="Notification preferences" />}>
      <NotificationList {...props} compact />
    </PhoneFrame>
  );
}

/* ================================================================ PLT-04 Approvals inbox */

export type ApprovalTab = 'waiting' | 'delegated' | 'sent' | 'history';

const APPROVAL_TYPES = ['Leave', 'Expense', 'Timesheet', 'Regularisation', 'Bank change', 'Access request', 'Offer'];

/** Days a request is past its due date (0 = due today or later). */
const daysOverdue = (due: Date) => Math.max(0, Math.round((new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()).getTime() - due.getTime()) / 86_400_000));
const isDueToday = (due: Date) => due.toDateString() === TODAY.toDateString();
export const overdueCount = (rows: ApprovalRow[]) => rows.filter((r) => daysOverdue(r.due) > 0).length;
/** Overdue first, then due today, then by date (founder review 30 Sep 2026). */
const byUrgency = (rows: ApprovalRow[]) => [...rows].sort((a, b) => a.due.getTime() - b.due.getTime());

function DueCell({ due }: { due: Date }) {
  const late = daysOverdue(due);
  if (late > 0) return <Badge tone="warning">Overdue {late} day{late === 1 ? '' : 's'}</Badge>;
  if (isDueToday(due)) return <Badge tone="info">Due today</Badge>;
  return <span>{formatDate(due).replace(/ \d{4}$/, '')}</span>;
}

const approvalColumnsBase: TableColumn<ApprovalRow>[] = [
  { key: 'requester', header: 'Requester', type: 'person', value: (r) => r.requester, person: (r) => ({ name: r.requester, secondary: r.requesterRole }), width: 200 },
  { key: 'type', header: 'Type', type: 'status', value: (r) => r.type, statusTone: () => 'neutral', width: 124 },
  {
    key: 'summary',
    header: 'Request',
    value: (r) => r.summary,
    render: (r) => (
      <span className="yx-plt-list__main">
        <span>{r.summary}</span>
        <span className="yx-plt-muted">
          {r.detail}
          {r.onBehalfOf ? ` · for ${r.onBehalfOf}` : ''}
          {r.raisedBy ? ` · raised by ${r.raisedBy}` : ''}
        </span>
      </span>
    ),
    width: 240,
  },
  {
    key: 'policy',
    header: 'Policy',
    value: (r) => (r.policy.ok ? 'OK' : 'Flag'),
    render: (r) => (r.policy.ok ? <Badge tone="success">Within policy</Badge> : <Badge tone="warning">Above limit</Badge>),
    width: 130,
  },
  { key: 'due', header: 'Due', value: (r) => r.due.getTime(), render: (r) => <DueCell due={r.due} />, width: 146 },
];
/** Waiting tabs don't repeat "Waiting" on every row; sent and history keep Status. */
const approvalColumns = (withStatus: boolean): TableColumn<ApprovalRow>[] =>
  withStatus ? [...approvalColumnsBase, { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => toneFor(v) }] : approvalColumnsBase;

function approvalSteps(r: ApprovalRow): ApprovalStep[] {
  return [
    { id: 's', label: r.raisedBy ? `Submitted by ${r.raisedBy} on behalf of ${r.requester}` : 'Submitted', status: 'done', approver: r.raisedBy ?? r.requester, at: r.submitted },
    { id: 'm', label: r.step, status: r.status === 'Approved' ? 'done' : r.status === 'Rejected' ? 'rejected' : 'current', approver: r.onBehalfOf ? `Divya Raghunathan (for ${r.onBehalfOf})` : 'Divya Raghunathan' },
    { id: 'h', label: r.type === 'Expense' ? 'Finance review' : 'HR review', status: r.type === 'Leave' ? 'skipped' : 'pending', comment: r.type === 'Leave' ? 'Skipped: leave up to 3 days needs manager approval only' : undefined },
  ];
}

type Decision = 'reject' | 'sendback' | 'ask' | 'reassign' | 'exception' | null;
const DECISION_TEXT: Record<Exclude<Decision, null>, { title: string; field: string; confirm: string; done: string }> = {
  reject: { title: 'Reject request', field: 'Reason', confirm: 'Reject', done: 'Rejected' },
  sendback: { title: 'Send back for changes', field: 'What needs to change', confirm: 'Send back', done: 'Sent back' },
  ask: { title: 'Ask a question', field: 'Question', confirm: 'Send question', done: 'Question sent' },
  reassign: { title: 'Reassign', field: 'Reassign to', confirm: 'Reassign', done: 'Reassigned' },
  exception: { title: 'Approve outside policy', field: 'Why this exception is fine', confirm: 'Approve with exception', done: 'Approved with exception' },
};

/**
 * Approval decision (founder review 30 Sep 2026): the body shows the request; every decision sits in the footer
 * (Approve, Send back, Reject; Ask and Reassign under ⋯). Approving outside policy asks for a reason for the audit trail.
 */
function useApprovalDecision(row: ApprovalRow, defaultDecision: Decision, onDone: (text: string) => void, actionable: boolean) {
  const [decision, setDecision] = useState<Decision>(defaultDecision);
  const [reason, setReason] = useState('');
  const [to, setTo] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const pick = (d: Decision) => {
    setDecision(d);
    setReason('');
    setTried(false);
  };
  const confirm = () => {
    setTried(true);
    if (decision === 'reassign' ? !to : reason.trim().length < 5) return;
    onDone(decision ? DECISION_TEXT[decision].done : 'Approved');
  };
  const text = decision ? DECISION_TEXT[decision] : null;
  const body = (
    <div className="yx-plt-stack">
      {!row.policy.ok && (
        <InlineAlert tone="warning" title="Policy flag">
          {row.policy.reason}
        </InlineAlert>
      )}
      {row.receipt && (
        <Card title="Receipt">
          <div className="yx-plt-receipt">
            <div className="yx-plt-receipt__thumb" aria-hidden="true">
              <Icon icon={Receipt} size="md" />
              <span>{row.receipt.file}</span>
            </div>
            <div className="yx-plt-stack" data-gap="sm">
              {row.receipt.lines.map((l) => (
                <span key={l}>{l}</span>
              ))}
              <span>
                <Button size="sm" icon={FileText}>View receipt</Button>
              </span>
            </div>
          </div>
        </Card>
      )}
      {row.teamOff && (
        <Card title="Team on these days" actions={<Link href="#leave-calendar">Team calendar</Link>}>
          {row.teamOff.length === 0 ? (
            <p className="yx-plt-muted">Nobody else in the team is off.</p>
          ) : (
            <ul className="yx-plt-list">
              {row.teamOff.map((t) => (
                <li key={t.name}>
                  <PersonLabel name={t.name} secondary={t.when} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <Card title="Context">
        <ul className="yx-plt-list">
          {row.context.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Card>
      <ApprovalTimeline steps={approvalSteps(row)} now={TODAY} />
      {decision && text && (
        <Card title={text.title}>
          {decision === 'reassign' ? (
            <FormField label={text.field} required error={tried && !to ? 'Choose an eligible approver.' : null} helper="Only people who can approve this request type are listed.">
              <PersonPicker people={PEOPLE.filter((p) => p.id !== 'e1')} value={to} onChange={setTo} />
            </FormField>
          ) : (
            <FormField
              label={text.field}
              required
              error={tried && reason.trim().length < 5 ? (decision === 'exception' ? 'Say why this is fine; it is kept in the audit trail.' : 'Write a reason the requester can act on.') : null}
              helper={decision === 'sendback' ? 'The requester edits and resubmits. Unchanged requests resume at your step.' : decision === 'exception' ? 'Kept with the request for finance and audit.' : undefined}
            >
              <TextArea value={reason} onChange={setReason} rows={3} />
            </FormField>
          )}
        </Card>
      )}
    </div>
  );
  const footer = !actionable || row.status !== 'Waiting' ? undefined : decision && text ? (
    <div className="yx-plt-decide">
      <Button onClick={() => pick(null)}>Cancel</Button>
      <Button variant={decision === 'reject' ? 'danger' : 'primary'} onClick={confirm}>
        {text.confirm}
      </Button>
    </div>
  ) : (
    <div className="yx-plt-decide">
      <Menu>
        <MenuTrigger asChild>
          <IconButton icon={MoreHorizontal} label="More actions" />
        </MenuTrigger>
        <MenuContent align="start">
          <MenuItem onSelect={() => pick('ask')}>Ask a question</MenuItem>
          <MenuItem onSelect={() => pick('reassign')}>Reassign</MenuItem>
        </MenuContent>
      </Menu>
      <span className="yx-plt-decide__gap" />
      <Button onClick={() => pick('sendback')}>Send back</Button>
      <Button onClick={() => pick('reject')}>Reject</Button>
      <Button variant="approve" icon={Check} onClick={() => (row.policy.ok ? onDone('Approved') : pick('exception'))}>
        Approve
      </Button>
    </div>
  );
  return { body, footer };
}

/** Kept for other screens that show one request inline. */
export function ApprovalDetail({ row, defaultDecision = null, onDone }: { row: ApprovalRow; defaultDecision?: Decision; onDone: (text: string) => void }) {
  const { body, footer } = useApprovalDecision(row, defaultDecision, onDone, true);
  return (
    <div className="yx-plt-stack">
      {body}
      {footer}
    </div>
  );
}

function ApprovalDrawer({ row, list, onMove, onClose, defaultDecision, onDone, actionable }: {
  row: ApprovalRow;
  list: ApprovalRow[];
  onMove: (id: string) => void;
  onClose: () => void;
  defaultDecision: Decision;
  onDone: (text: string) => void;
  actionable: boolean;
}) {
  const { body, footer } = useApprovalDecision(row, defaultDecision, onDone, actionable);
  const i = list.findIndex((r) => r.id === row.id);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${row.summary} · ${row.requester}`}
      subtitle={`${row.ref} · ${row.detail}`}
      meta={
        <div className="yx-plt-row" data-justify="between">
          <PersonLabel name={row.requester} secondary={row.requesterRole} />
          {i >= 0 && list.length > 1 && (
            <nav className="yx-plt-row" aria-label="Move between requests">
              <span className="yx-plt-muted">
                {i + 1} of {list.length}
              </span>
              <Button size="sm" icon={ChevronLeft} disabled={i === 0} onClick={() => onMove(list[i - 1].id)}>
                Previous
              </Button>
              <Button size="sm" disabled={i === list.length - 1} onClick={() => onMove(list[i + 1].id)}>
                Next <Icon icon={ChevronRight} />
              </Button>
            </nav>
          )}
        </div>
      }
      size="lg"
      footer={footer}
    >
      {body}
    </Drawer>
  );
}

export interface ApprovalsInboxScreenProps {
  waiting: ApprovalRow[];
  sent: ApprovalRow[];
  history: ApprovalRow[];
  defaultTab?: ApprovalTab;
  openId?: string;
  defaultDecision?: Decision;
  defaultSelected?: string[];
  bulkConfirmOpen?: boolean;
  state?: 'ready' | 'loading' | 'error';
}

// PLT-04 · Approvals inbox (tabs, filters, bulk, side panel). APX-D §1.1 Approvals. Manager page: no company button.
export function ApprovalsInboxScreen({ waiting, sent, history, defaultTab = 'waiting', openId, defaultDecision, defaultSelected, bulkConfirmOpen, state = 'ready' }: ApprovalsInboxScreenProps) {
  const [tab, setTab] = useState<string>(defaultTab);
  const [items, setItems] = useState(() => byUrgency(waiting));
  const [open, setOpen] = useState<string | null>(openId ?? null);
  const [confirmIds, setConfirmIds] = useState<string[] | null>(bulkConfirmOpen ? defaultSelected ?? [] : null);
  const [live, setLive] = useState('');
  const mine = items.filter((r) => !r.onBehalfOf);
  const delegated = items.filter((r) => r.onBehalfOf);
  const rows = tab === 'waiting' ? mine : tab === 'delegated' ? delegated : tab === 'sent' ? sent : history;
  const current = [...items, ...sent, ...history].find((r) => r.id === open) ?? null;
  const decide = (ids: string[], text: string) => {
    const next = rows.filter((r) => !ids.includes(r.id));
    setItems((xs) => xs.filter((x) => !ids.includes(x.id)));
    setLive(`${text}: ${ids.length} request${ids.length === 1 ? '' : 's'}.`);
    // Stay in the panel and move to the next request, if there is one.
    const at = rows.findIndex((r) => r.id === ids[0]);
    setOpen(ids.length === 1 && next.length > 0 ? next[Math.min(at, next.length - 1)].id : null);
  };
  const actionable = tab === 'waiting' || tab === 'delegated';
  const overdue = overdueCount(items);
  return (
    <DesktopFrame area="home" panelTitle="Home" panel={homePanel('Approvals', items.length)} scope="none">
      <ListPage
        title="Approvals"
        description="Everything waiting for your decision, including requests delegated to you."
        facts={`${items.length} waiting${overdue ? ` · ${overdue} overdue` : ''}`}
        actions={<Button>Set up delegation</Button>}
        above={<span className="yx-visually-hidden" aria-live="polite">{live}</span>}
        tabs={[
          { id: 'waiting', label: 'Waiting for me', count: mine.length },
          { id: 'delegated', label: 'Delegated to me', count: delegated.length },
          { id: 'sent', label: 'Sent by me', count: sent.length },
          { id: 'history', label: 'Team history' },
        ]}
        tab={tab}
        onTabChange={setTab}
        label="Approval requests"
        columns={approvalColumns(!actionable)}
        rows={rows}
        getRowId={(r) => r.id}
        filters={[
          { key: 'type', label: 'Type', type: 'multi', options: APPROVAL_TYPES.map((t) => ({ value: t, label: t })) },
          { key: 'due', label: 'Due', type: 'date' },
        ]}
        searchPlaceholder="Search name or reference"
        state={state}
        empty={
          <EmptyState
            title={tab === 'waiting' ? 'Nothing is waiting for you.' : tab === 'delegated' ? 'Nobody has delegated approvals to you.' : 'No requests here yet.'}
            description={tab === 'waiting' ? 'New requests from your team will appear here and on your home.' : undefined}
          />
        }
        selectable={actionable}
        defaultSelected={defaultSelected}
        bulkActions={(ids) => {
          const check = bulkApprovable(items, ids);
          return check.ok ? (
            <Button variant="approve" size="sm" onClick={() => setConfirmIds(ids)}>
              Approve {ids.length}
            </Button>
          ) : (
            <span className="yx-plt-muted">{check.reason}</span>
          );
        }}
        rowButtons={actionable ? (r) => (r.lowRisk ? <Button variant="approve" size="sm" icon={Check} onClick={() => decide([r.id], 'Approved')}>Approve</Button> : <Button variant="review" size="sm" onClick={() => setOpen(r.id)}>Review</Button>) : undefined}
        rowActions={actionable ? (r) => (
          <>
            <MenuItem onSelect={() => setOpen(r.id)}>Open request</MenuItem>
            <MenuItem onSelect={() => setOpen(r.id)}>Send back</MenuItem>
            <MenuItem destructive onSelect={() => setOpen(r.id)}>Reject</MenuItem>
          </>
        ) : undefined}
        onRowClick={(r) => setOpen(r.id)}
        activeRowId={open}
      >
        {current && (
          <ApprovalDrawer
            key={current.id}
            row={current}
            list={rows}
            onMove={setOpen}
            onClose={() => setOpen(null)}
            defaultDecision={current.id === openId ? defaultDecision ?? null : null}
            onDone={(t) => decide([current.id], t)}
            actionable={actionable}
          />
        )}
        {confirmIds && (
          <ConfirmDialog
            open
            onOpenChange={(o) => !o && setConfirmIds(null)}
            title={`Approve ${confirmIds.length} ${items.find((i) => i.id === confirmIds[0])?.type.toLowerCase() ?? ''} requests?`}
            consequence="Each request is checked again before approval. Requesters are notified."
            confirmLabel={`Approve ${confirmIds.length}`}
            onConfirm={() => decide(confirmIds, 'Approved')}
          />
        )}
      </ListPage>
    </DesktopFrame>
  );
}

/** Mobile approval card (UI brief §5). */
function ApprovalCardMobile({ r, onApprove, onOpen }: { r: ApprovalRow; onApprove: () => void; onOpen: () => void }) {
  return (
    <Card>
      <div className="yx-plt-stack" data-gap="sm">
        <div className="yx-plt-row" data-justify="between">
          <PersonLabel name={r.requester} secondary={r.requesterRole} />
          <Badge>{r.type}</Badge>
        </div>
        <strong>{r.summary}</strong>
        <span className="yx-plt-muted">
          {r.detail}
          {r.onBehalfOf ? ` · for ${r.onBehalfOf}` : ''}
        </span>
        <span>
          <DueCell due={r.due} />
        </span>
        {r.context[0] && <span className="yx-plt-muted">{r.context[0]}</span>}
        {!r.policy.ok && <Badge tone="warning">{r.policy.reason}</Badge>}
        <div className="yx-plt-card-actions">
          <Button variant="review" onClick={onOpen}>{r.lowRisk ? 'Details' : 'Review'}</Button>
          {r.lowRisk && (
            <Button variant="approve" onClick={onApprove}>
              Approve
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function ApprovalSheet({ row, defaultDecision, onDone, onClose }: { row: ApprovalRow; defaultDecision: Decision; onDone: (t: string) => void; onClose: () => void }) {
  const { body, footer } = useApprovalDecision(row, defaultDecision, onDone, true);
  return (
    <BottomSheet open onOpenChange={(o) => !o && onClose()} title={`${row.summary} · ${row.requester}`} description={row.ref} footer={footer}>
      {body}
    </BottomSheet>
  );
}

// PLT-04 · Approvals inbox (phone: Requests › Approvals cards).
export function ApprovalsInboxPhone({ waiting, openId, defaultDecision }: { waiting: ApprovalRow[]; openId?: string; defaultDecision?: Decision }) {
  const [items, setItems] = useState(() => byUrgency(waiting));
  const [open, setOpen] = useState<string | null>(openId ?? null);
  const [live, setLive] = useState('');
  const current = items.find((r) => r.id === open);
  const approve = (id: string, text = 'Approved') => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    setOpen(null);
    setLive(text);
  };
  const lowRiskLeave = items.filter((i) => i.lowRisk && i.type === 'Leave');
  return (
    <PhoneFrame tab="requests" title="Approvals">
      <span className="yx-visually-hidden" aria-live="polite">
        {live}
      </span>
      {lowRiskLeave.length > 1 && (
        <Button variant="approve" fullWidth onClick={() => lowRiskLeave.forEach((i) => approve(i.id))}>
          Approve {lowRiskLeave.length} leave requests
        </Button>
      )}
      {items.length === 0 ? (
        <EmptyState compact title="Nothing is waiting for you." />
      ) : (
        items.map((r) => <ApprovalCardMobile key={r.id} r={r} onApprove={() => approve(r.id)} onOpen={() => setOpen(r.id)} />)
      )}
      {current && <ApprovalSheet key={current.id} row={current} defaultDecision={current.id === openId ? defaultDecision ?? null : null} onDone={(t) => approve(current.id, t)} onClose={() => setOpen(null)} />}
    </PhoneFrame>
  );
}

/* ================================================================ PLT-05 Request sheet */

export type RequestTypeId = 'leave' | 'wfh' | 'onduty' | 'compoff' | 'regularise' | 'shiftswap' | 'expense' | 'advance' | 'letter';
interface RequestType {
  id: RequestTypeId;
  label: string;
  /** Sheet title once chosen: "Apply for leave". */
  title: string;
  desc: string;
  icon: typeof CalendarDays;
  group: 'Time off' | 'Attendance' | 'Money' | 'Documents';
}
/** Every request an employee can raise, grouped (founder review 30 Sep 2026). */
const REQUEST_TYPES: RequestType[] = [
  { id: 'leave', label: 'Leave', title: 'Apply for leave', desc: 'Casual, sick, earned or unpaid', icon: CalendarDays, group: 'Time off' },
  { id: 'wfh', label: 'Work from home', title: 'Work from home', desc: 'One or more days away from office', icon: Laptop, group: 'Time off' },
  { id: 'onduty', label: 'On duty', title: 'Mark on duty', desc: 'Client visit, training or travel for work', icon: Briefcase, group: 'Time off' },
  { id: 'compoff', label: 'Comp-off', title: 'Claim a comp-off', desc: 'A day off for working on a holiday', icon: CalendarPlus, group: 'Time off' },
  { id: 'regularise', label: 'Regularise attendance', title: 'Regularise attendance', desc: 'Missed or wrong check-in or check-out', icon: Clock, group: 'Attendance' },
  { id: 'shiftswap', label: 'Shift swap', title: 'Swap a shift', desc: 'Exchange a shift with a colleague', icon: ArrowLeftRight, group: 'Attendance' },
  { id: 'expense', label: 'Expense claim', title: 'Claim an expense', desc: 'Travel, meals, internet, client visits', icon: Receipt, group: 'Money' },
  { id: 'advance', label: 'Salary advance', title: 'Ask for a salary advance', desc: 'Recovered from the next salaries', icon: Wallet, group: 'Money' },
  { id: 'letter', label: 'Letter request', title: 'Request a letter', desc: 'Employment, address proof or salary letter', icon: FileText, group: 'Documents' },
];
const TYPE_GROUPS = ['Time off', 'Attendance', 'Money', 'Documents'] as const;

const LEAVE_BALANCES: Record<string, number> = { casual: 4, sick: 5, earned: 9 };
const LEAVE_OPTIONS = [
  { value: 'casual', label: 'Casual leave', description: '4 days left' },
  { value: 'sick', label: 'Sick leave', description: '5 days left' },
  { value: 'earned', label: 'Earned leave', description: '9 days left' },
  { value: 'unpaid', label: 'Unpaid leave (LWP)', description: 'Deducted from pay' },
];
const SESSIONS = [
  { value: 'am', label: 'Morning off' },
  { value: 'pm', label: 'Afternoon off' },
];
/** Team leave already booked, for "Team" in the summary (same people as the manager home). */
const TEAM_OFF: { name: string; date: Date }[] = [
  { name: 'Kavya Reddy', date: new Date(2026, 9, 1) },
  { name: 'Vikram Rao', date: new Date(2026, 9, 1) },
  { name: 'Rahul Nair', date: new Date(2026, 8, 30) },
  { name: 'Meera Krishnan', date: new Date(2026, 9, 12) },
];
/** Sick leave longer than this needs a medical certificate (starter policy). */
const SICK_CERT_AFTER_DAYS = 2;

function teamOffText(from: Date | null, to: Date | null) {
  if (!from || !to) return 'Choose dates to see who else is off';
  const hits = TEAM_OFF.filter((t) => t.date >= from && t.date <= to);
  if (hits.length === 0) return 'Nobody else in your team is off';
  const byDay = new Map<string, string[]>();
  for (const h of hits) byDay.set(formatDate(h.date).replace(/ \d{4}$/, ''), [...(byDay.get(formatDate(h.date).replace(/ \d{4}$/, '')) ?? []), h.name]);
  return [...byDay].map(([day, names]) => `${names.join(', ')} off on ${day}`).join(' · ');
}

export interface RequestSheetProps {
  defaultType?: RequestTypeId | null;
  defaultLeaveType?: string;
  defaultFrom?: Date | null;
  defaultTo?: Date | null;
  /** Proxy raiser (YX-WF-18): shows "On behalf of". */
  proxy?: boolean;
  defaultSubject?: string | null;
  submitted?: boolean;
  /** Attendance locked before this date (P08). */
  lockedBefore?: Date;
}

function EffectSummary({ rows, tone }: { rows: [string, ReactNode][]; tone?: 'warning' }) {
  return (
    <section className="yx-plt-effect" aria-live="polite" aria-label="What this request does" data-tone={tone}>
      <h3 className="yx-plt-h">What this request does</h3>
      <dl>
        {rows.map(([k, v]) => (
          <Fragment key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

/**
 * Type picker → type form with live summary (founder review 30 Sep 2026). Returns the sheet's title, body and a
 * footer with Cancel / Send, so the desk drawer and the phone bottom sheet keep Send always visible.
 */
function useRequestSheet({ defaultType = null, defaultLeaveType = 'casual', defaultFrom = null, defaultTo = null, proxy, defaultSubject = null, submitted: submittedProp, lockedBefore }: RequestSheetProps) {
  const [type, setType] = useState<RequestTypeId | null>(defaultType);
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState<string | null>(defaultSubject);
  const [leaveType, setLeaveType] = useState<string | null>(defaultLeaveType);
  const [from, setFrom] = useState<Date | null>(defaultFrom);
  const [to, setTo] = useState<Date | null>(defaultTo);
  const [halfFirst, setHalfFirst] = useState(false);
  const [halfFirstSession, setHalfFirstSession] = useState<string | null>('pm');
  const [halfLast, setHalfLast] = useState(false);
  const [halfLastSession, setHalfLastSession] = useState<string | null>('am');
  const [split, setSplit] = useState(false);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>('travel');
  const [spentOn, setSpentOn] = useState<Date | null>(null);
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState(0);
  const [submitted, setSubmitted] = useState(Boolean(submittedProp));
  const [tried, setTried] = useState(false);
  const subjectName = PEOPLE.find((p) => p.id === subject)?.name;
  const chosen = REQUEST_TYPES.find((t) => t.id === type);

  // Leave maths: working days minus half days, against the balance of the chosen type.
  const balance = LEAVE_BALANCES[leaveType ?? ''] ?? Infinity;
  const base = leaveEffect({ balance: Number.isFinite(balance) ? balance : 999, from, to, holidays: HOLIDAYS_2026, lockedBefore });
  const sameDay = from && to && from.getTime() === to.getTime();
  const days = Math.max(0, base.days - (halfFirst ? 0.5 : 0) - (halfLast && !sameDay ? 0.5 : 0));
  const unpaidDays = leaveType === 'unpaid' ? days : split ? Math.max(0, days - balance) : 0;
  const paidDays = days - unpaidDays;
  const overBalance = leaveType !== 'unpaid' && !split && days > balance;
  const needsCert = leaveType === 'sick' && days > SICK_CERT_AFTER_DAYS;
  const limit = category === 'meals' ? 1500 : 5000;

  const pickType = (t: RequestTypeId, leave?: string) => {
    setType(t);
    if (leave) setLeaveType(leave);
    setTried(false);
  };
  const submit = () => {
    setTried(true);
    if (type === 'leave' && (!from || !to || overBalance || (needsCert && files === 0))) return;
    if (type === 'expense' && (!amount || !spentOn || files === 0)) return;
    if ((type === 'wfh' || type === 'onduty' || type === 'compoff' || type === 'regularise' || type === 'shiftswap') && !from) return;
    if (type === 'advance' && !amount) return;
    setSubmitted(true);
  };

  const title = submitted ? 'Request sent' : chosen ? chosen.title : 'What do you want to request?';
  const changeType = !submitted && chosen ? (
    <Link
      href="#"
      onClick={(e) => {
        e.preventDefault();
        setType(null);
      }}
    >
      Change type
    </Link>
  ) : null;

  let body: ReactNode;
  if (submitted)
    body = (
      <InlineAlert tone="success" title="Request sent">
        {subjectName ? `Raised on behalf of ${subjectName}. They are told by SMS and on the kiosk. ` : ''}LV-26-01851 is waiting for Karthik Subramanian. You can follow it in My requests.
      </InlineAlert>
    );
  else if (!type) {
    const q = query.trim().toLowerCase();
    const matches = REQUEST_TYPES.filter((t) => !q || `${t.label} ${t.desc}`.toLowerCase().includes(q));
    body = (
      <div className="yx-plt-stack">
        {proxy && (
          <FormField label="On behalf of" helper="HR and managers can raise requests for people in their scope. The approval chain follows that person.">
            <PersonPicker people={PEOPLE.filter((p) => p.id !== 'e1')} value={subject} onChange={setSubject} placeholder="Myself" clearable />
          </FormField>
        )}
        <TextField value={query} onChange={setQuery} aria-label="Search request types" placeholder="Search: leave, advance, letter…" />
        {!q && (
          <div className="yx-plt-row">
            <span className="yx-plt-muted">You used recently:</span>
            <Button size="sm" icon={CalendarDays} onClick={() => pickType('leave', 'casual')}>
              Casual leave
            </Button>
            <Button size="sm" icon={Receipt} onClick={() => pickType('expense')}>
              Expense claim
            </Button>
          </div>
        )}
        {matches.length === 0 && <EmptyState compact title="No request type matches." description="Try another word, or ask HR from Help." />}
        {TYPE_GROUPS.map((g) => {
          const list = matches.filter((t) => t.group === g);
          return list.length === 0 ? null : (
            <section key={g} className="yx-plt-stack" data-gap="sm" aria-label={g}>
              <h3 className="yx-plt-h">{g}</h3>
              <div className="yx-plt-types" role="group" aria-label={g}>
                {list.map((t) => (
                  <button key={t.id} type="button" className="yx-plt-type" onClick={() => pickType(t.id)}>
                    <Icon icon={t.icon} size="md" />
                    <span className="yx-plt-type__text">
                      <span>{t.label}</span>
                      <span className="yx-plt-type__desc">{t.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  } else
    body = (
      <div className="yx-plt-stack">
        {proxy && (
          <FormField label="On behalf of">
            <PersonPicker people={PEOPLE.filter((p) => p.id !== 'e1')} value={subject} onChange={setSubject} placeholder="Myself" clearable />
          </FormField>
        )}
        {type === 'leave' && (
          <>
            <FormField label="Leave type" required>
              <Select
                options={LEAVE_OPTIONS}
                value={leaveType}
                onChange={(v) => {
                  setLeaveType(v);
                  setSplit(false);
                }}
              />
            </FormField>
            <FieldRow>
              <FormField label="From" required error={tried && !from ? 'Choose the first day of leave.' : null}>
                <DatePicker value={from} onChange={setFrom} />
              </FormField>
              <FormField label="To" required error={tried && !to ? 'Choose the last day of leave.' : null}>
                <DatePicker value={to} onChange={setTo} min={from ?? undefined} />
              </FormField>
            </FieldRow>
            <div className="yx-plt-half">
              <Checkbox label="Half day on the first day" checked={halfFirst} onChange={setHalfFirst} />
              {halfFirst && <Select size="sm" aria-label="First day: which half" options={SESSIONS} value={halfFirstSession} onChange={setHalfFirstSession} />}
            </div>
            {!sameDay && (
              <div className="yx-plt-half">
                <Checkbox label="Half day on the last day" checked={halfLast} onChange={setHalfLast} />
                {halfLast && <Select size="sm" aria-label="Last day: which half" options={SESSIONS} value={halfLastSession} onChange={setHalfLastSession} />}
              </div>
            )}
            {base.lateForPeriod && (
              <InlineAlert tone="warning" title="Attendance for this date is closed">
                {base.message} HR approves this request as an extra step.
              </InlineAlert>
            )}
            {overBalance && (
              <InlineAlert
                tone="danger"
                title="Not enough balance"
                actions={
                  <Button size="sm" onClick={() => setSplit(true)}>
                    Split into {balance} days {LEAVE_OPTIONS.find((o) => o.value === leaveType)?.label.toLowerCase()} + {days - balance} days unpaid
                  </Button>
                }
              >
                You have {balance} days left and asked for {days}. Shorten the dates, or split the rest into unpaid leave.
              </InlineAlert>
            )}
            {split && (
              <InlineAlert
                tone="info"
                title="Split into two requests"
                actions={
                  <Button size="sm" onClick={() => setSplit(false)}>
                    Undo split
                  </Button>
                }
              >
                {paidDays} days {LEAVE_OPTIONS.find((o) => o.value === leaveType)?.label.toLowerCase()} and {unpaidDays} days unpaid leave. Your manager approves both together.
              </InlineAlert>
            )}
            {needsCert && (
              <FormField label="Medical certificate" required error={tried && files === 0 ? 'Sick leave over 2 days needs a certificate. Add a photo or PDF.' : null} helper="Needed for sick leave over 2 days. Only HR and your manager can see it.">
                <FileUpload upload={async () => {}} accept={['.pdf', '.jpg', '.png']} multiple={false} onItemsChange={(it) => setFiles(it.length)} />
              </FormField>
            )}
            <FormField label="Reason" optional>
              <TextArea value={reason} onChange={setReason} rows={2} />
            </FormField>
            <EffectSummary
              rows={[
                ['Days', `${days} working day${days === 1 ? '' : 's'} (weekends and holidays skipped)${split ? `: ${paidDays} paid + ${unpaidDays} unpaid` : ''}`],
                ['Balance after', leaveType === 'unpaid' ? 'No balance used; pay is reduced' : `${Math.max(balance - paidDays, 0)} of ${balance} days`],
                ['Team', teamOffText(from, to)],
                ['Approver', subjectName ? `Manager of ${subjectName}` : 'Karthik Subramanian'],
              ]}
            />
          </>
        )}
        {type === 'expense' && (
          <>
            <FieldRow>
              <FormField label="Category" required>
                <Select
                  options={[
                    { value: 'travel', label: 'Local travel' },
                    { value: 'meals', label: 'Meals' },
                    { value: 'internet', label: 'Internet' },
                  ]}
                  value={category}
                  onChange={setCategory}
                />
              </FormField>
              <FormField label="Date of expense" required error={tried && !spentOn ? 'Choose the date on the receipt.' : null}>
                <DatePicker value={spentOn} onChange={setSpentOn} max={TODAY} />
              </FormField>
            </FieldRow>
            <FormField label="Amount" required error={tried && !amount ? 'Enter the amount on the receipt.' : null}>
              <CurrencyField value={amount} onChange={setAmount} />
            </FormField>
            <FormField label="What was it for?" optional helper="For example: cab to the Hosur plant for the quality audit.">
              <TextField value={description} onChange={setDescription} />
            </FormField>
            <FormField label="Receipt" required error={tried && files === 0 ? 'Add a photo or PDF of the receipt. Your manager checks it before approving.' : null}>
              <FileUpload upload={async () => {}} accept={['.pdf', '.jpg', '.png']} onItemsChange={(it) => setFiles(it.length)} />
            </FormField>
            <EffectSummary
              rows={[
                ['Limit for grade G5', `${formatINR(limit)} per claim`],
                ['Status', amount && amount > limit ? `Above limit by ${formatINR(amount - limit)}: needs Finance approval` : 'Within limit'],
                ['Paid with', 'October salary'],
              ]}
            />
          </>
        )}
        {(type === 'wfh' || type === 'onduty' || type === 'compoff' || type === 'regularise' || type === 'shiftswap') && (
          <>
            <FieldRow>
              <FormField label={type === 'regularise' ? 'Date' : type === 'compoff' ? 'Holiday you worked on' : 'From'} required error={tried && !from ? 'Choose a date.' : null}>
                <DatePicker value={from} onChange={setFrom} />
              </FormField>
              {(type === 'wfh' || type === 'onduty') && (
                <FormField label="To" required>
                  <DatePicker value={to} onChange={setTo} min={from ?? undefined} />
                </FormField>
              )}
            </FieldRow>
            {type === 'shiftswap' && (
              <FormField label="Swap with" required>
                <PersonPicker people={PEOPLE.filter((p) => p.id !== 'e1')} value={subject} onChange={setSubject} />
              </FormField>
            )}
            <FormField label="Reason" required={type !== 'wfh'} optional={type === 'wfh'}>
              <TextArea value={reason} onChange={setReason} rows={2} />
            </FormField>
            <EffectSummary
              rows={[
                ...(type === 'wfh' || type === 'onduty' ? ([['Days', `${base.days}`]] as [string, ReactNode][]) : []),
                ['Check-in', type === 'regularise' ? 'Your record for that day is corrected once approved' : type === 'compoff' ? 'Adds 1 comp-off day, to use within 60 days' : 'Remote check-in allowed on these days'],
                ['Approver', 'Karthik Subramanian'],
              ]}
            />
          </>
        )}
        {type === 'advance' && (
          <>
            <FormField label="Amount" required error={tried && !amount ? 'Enter how much you need.' : null} helper="Up to one month's net pay.">
              <CurrencyField value={amount} onChange={setAmount} />
            </FormField>
            <FormField label="Reason" required>
              <TextArea value={reason} onChange={setReason} rows={2} />
            </FormField>
            <EffectSummary rows={[['Recovery', amount ? `${formatINR(Math.ceil(amount / 3))} a month for 3 months` : 'Split over 3 salaries'], ['Approver', 'Karthik Subramanian, then Payroll']]} />
          </>
        )}
        {type === 'letter' && (
          <>
            <FormField label="Letter" required>
              <Select
                options={[
                  { value: 'employment', label: 'Employment letter' },
                  { value: 'address', label: 'Address proof' },
                  { value: 'salary', label: 'Salary certificate' },
                ]}
                value={category === 'travel' ? 'employment' : category}
                onChange={setCategory}
              />
            </FormField>
            <FormField label="Purpose" optional helper="For example: bank loan, visa, rental agreement.">
              <TextField value={description} onChange={setDescription} />
            </FormField>
            <EffectSummary rows={[['Ready in', 'About 1 working day, as a signed PDF in Documents & letters'], ['Approver', 'HR team']]} />
          </>
        )}
      </div>
    );

  const footer = submitted || !type ? undefined : (
    <>
      <Button onClick={() => setType(null)}>Cancel</Button>
      <Button variant="primary" onClick={submit} disabled={overBalance}>
        Send request
      </Button>
    </>
  );
  return { title, changeType, body, footer };
}

/** Kept for other screens that embed the form inline. */
export function RequestSheetBody(props: RequestSheetProps) {
  const { body, footer } = useRequestSheet(props);
  return (
    <div className="yx-plt-stack">
      {body}
      {footer && <div className="yx-plt-card-actions">{footer}</div>}
    </div>
  );
}

// PLT-05 · Request sheet (desk: drawer over Home). Send lives in the drawer footer, always visible.
export function RequestSheetScreen(props: RequestSheetProps) {
  const [open, setOpen] = useState(true);
  const { title, changeType, body, footer } = useRequestSheet(props);
  return (
    <DesktopFrame area="home" panelTitle="Home" panel={homePanel('Home')} scope="none">
      <PageHeader title="Home" actions={<Button variant="primary" onClick={() => setOpen(true)}>New request</Button>} />
      <Drawer open={open} onOpenChange={setOpen} title={title} meta={changeType} size="lg" description="Pick a type, fill the form and check the summary before sending." footer={footer}>
        {body}
      </Drawer>
    </DesktopFrame>
  );
}

// PLT-05 · Request sheet (phone: bottom sheet from Requests).
export function RequestSheetPhone(props: RequestSheetProps) {
  const { title, changeType, body, footer } = useRequestSheet(props);
  return (
    <PhoneFrame tab="requests" title="Requests">
      <BottomSheet defaultOpen title={title} description={changeType ?? undefined} footer={footer}>
        {body}
      </BottomSheet>
    </PhoneFrame>
  );
}

/* ================================================================ PLT-06 My requests */

const shortDate = (d: Date) => formatDate(d).replace(/ \d{4}$/, '');
/** Approved leave that hasn't started can still be cancelled (founder review 30 Sep 2026). */
const canCancel = (r: MyRequest) => r.status === 'Approved' && !!r.startsOn && r.startsOn > TODAY;
const inProgress = (r: MyRequest) => r.status === 'Pending' || r.status === 'Sent back' || r.status === 'Draft' || canCancel(r);
/** Sent back to you first, then pending, then the rest, newest first. */
const RANK: Record<MyRequest['status'], number> = { 'Sent back': 0, Draft: 1, Pending: 2, Approved: 3, Rejected: 4, Withdrawn: 5 };
const byNeed = (rows: MyRequest[]) => [...rows].sort((a, b) => RANK[a.status] - RANK[b.status] || b.submitted.getTime() - a.submitted.getTime());

function WhereItIs({ r }: { r: MyRequest }) {
  return (
    <span className="yx-plt-list__main">
      <span className={r.status === 'Sent back' ? 'yx-plt-warn' : undefined}>{r.latestStep}</span>
      {r.waitingOn && r.status === 'Pending' && <span className="yx-plt-muted">With {r.waitingOn}</span>}
    </span>
  );
}

const myColumns: TableColumn<MyRequest>[] = [
  {
    key: 'summary',
    header: 'Request',
    value: (r) => r.summary,
    render: (r) => (
      <span className="yx-plt-list__main">
        <span>{r.summary}</span>
        <span className="yx-plt-muted">
          {r.ref} · {r.type}
          {r.raisedBy ? ` · raised by ${r.raisedBy} on your behalf` : ''}
        </span>
      </span>
    ),
    width: 320,
  },
  { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => toneFor(v), width: 130 },
  { key: 'latestStep', header: 'Where it is', value: (r) => r.latestStep, render: (r) => <WhereItIs r={r} /> },
  { key: 'submitted', header: 'Submitted', value: (r) => r.submitted.getTime(), render: (r) => shortDate(r.submitted), width: 120 },
];

type MyAction = { kind: 'withdraw' | 'cancel'; id: string } | null;

function MyRequestConfirm({ action, items, onClose, onDone }: { action: MyAction; items: MyRequest[]; onClose: () => void; onDone: (id: string, patch: Partial<MyRequest>) => void }) {
  const r = items.find((i) => i.id === action?.id);
  if (!action || !r) return null;
  return action.kind === 'withdraw' ? (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Withdraw ${r.ref}?`}
      consequence="Approvers stop seeing it. You can raise a new request later."
      confirmLabel="Withdraw request"
      onConfirm={() => onDone(r.id, { status: 'Withdrawn', latestStep: 'Withdrawn by you' })}
    />
  ) : (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Cancel ${r.summary.split(' · ')[0].toLowerCase()} on ${r.summary.split(' · ')[1]?.replace(/ \(.*\)$/, '')}?`}
      consequence="Karthik Subramanian approves the cancellation. The days go back to your balance once it's approved."
      confirmLabel="Ask to cancel"
      onConfirm={() => onDone(r.id, { status: 'Pending', latestStep: 'Cancellation waiting for Karthik Subramanian', waitingOn: 'Karthik Subramanian', startsOn: undefined })}
    />
  );
}

const myButton = (r: MyRequest, act: (a: MyAction) => void) =>
  r.status === 'Sent back' ? (
    <Button size="sm" variant="review">Edit and resend</Button>
  ) : r.status === 'Pending' ? (
    <Button size="sm" onClick={() => act({ kind: 'withdraw', id: r.id })}>Withdraw</Button>
  ) : canCancel(r) ? (
    <Button size="sm" onClick={() => act({ kind: 'cancel', id: r.id })}>Cancel leave</Button>
  ) : null;

// PLT-06 · My requests: In progress / Completed, what needs you first, where each request is. Personal page: no company button.
export function MyRequestsScreen({ rows, state = 'ready', withdrawId }: { rows: MyRequest[]; state?: 'ready' | 'loading' | 'error'; withdrawId?: string }) {
  const [items, setItems] = useState(() => byNeed(rows));
  const [tab, setTab] = useState('open');
  const [action, setAction] = useState<MyAction>(withdrawId ? { kind: 'withdraw', id: withdrawId } : null);
  const open = items.filter(inProgress);
  const done = items.filter((r) => !inProgress(r));
  const sentBack = items.filter((r) => r.status === 'Sent back').length;
  const pending = items.filter((r) => r.status === 'Pending').length;
  return (
    <DesktopFrame area="home" panelTitle="Home" panel={homePanel('My requests')} scope="none">
      <ListPage
        title="My requests"
        description="Everything you asked for, and requests HR or your manager raised on your behalf."
        facts={`${sentBack ? `${sentBack} sent back to you · ` : ''}${pending} pending`}
        actions={<Button variant="primary">New request</Button>}
        tabs={[
          { id: 'open', label: 'In progress', count: open.length },
          { id: 'done', label: 'Completed', count: done.length },
        ]}
        tab={tab}
        onTabChange={setTab}
        label="My requests"
        columns={myColumns}
        rows={tab === 'open' ? open : done}
        getRowId={(r) => r.id}
        filters={[
          { key: 'type', label: 'Type', type: 'multi', options: ['Leave', 'Expense', 'Regularisation', 'Work from home', 'Profile change'].map((v) => ({ value: v, label: v })) },
          { key: 'status', label: 'Status', type: 'multi', options: ['Pending', 'Approved', 'Rejected', 'Sent back', 'Withdrawn'].map((v) => ({ value: v, label: v })) },
        ]}
        searchPlaceholder="Search reference or type"
        state={state}
        empty={
          tab === 'open' ? (
            <EmptyState title="Nothing in progress." description="Requests waiting for approval, or sent back to you, show here." action={<Button variant="primary">New request</Button>} />
          ) : (
            <EmptyState title="No completed requests yet." description="Approved, rejected and withdrawn requests move here." />
          )
        }
        rowButtons={(r) => myButton(r, setAction)}
      >
        <MyRequestConfirm
          action={action}
          items={items}
          onClose={() => setAction(null)}
          onDone={(id, patch) => {
            setItems((xs) => byNeed(xs.map((x) => (x.id === id ? { ...x, ...patch } : x))));
            setAction(null);
          }}
        />
      </ListPage>
    </DesktopFrame>
  );
}

// PLT-06 · My requests (phone): tap a row to see where it is and act on it.
export function MyRequestsPhone({ rows }: { rows: MyRequest[] }) {
  const [items, setItems] = useState(() => byNeed(rows));
  const [openId, setOpenId] = useState<string | null>(null);
  const [action, setAction] = useState<MyAction>(null);
  const current = items.find((r) => r.id === openId);
  return (
    <PhoneFrame tab="requests" title="My requests" actions={<IconButton icon={Plus} label="New request" />}>
      {items.length === 0 ? (
        <EmptyState compact title="You haven't raised any requests yet." action={<Button variant="primary">New request</Button>} />
      ) : (
        <ul className="yx-plt-myreq">
          {items.map((r) => (
            <li key={r.id}>
              <button type="button" className="yx-plt-myreq__row" onClick={() => setOpenId(r.id)}>
                <span className="yx-plt-list__main">
                  <strong>{r.summary}</strong>
                  <WhereItIs r={r} />
                </span>
                <Badge tone={toneFor(r.status)}>{r.status}</Badge>
                <Icon icon={ChevronRight} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {current && (
        <BottomSheet
          open
          onOpenChange={(o) => !o && setOpenId(null)}
          title={current.summary}
          description={`${current.ref} · ${current.type} · submitted ${shortDate(current.submitted)}`}
          footer={myButton(current, setAction) ?? undefined}
        >
          <div className="yx-plt-stack" data-gap="sm">
            <span>
              <Badge tone={toneFor(current.status)}>{current.status}</Badge>
            </span>
            <WhereItIs r={current} />
            {current.raisedBy && <span className="yx-plt-muted">Raised by {current.raisedBy} on your behalf</span>}
          </div>
        </BottomSheet>
      )}
      <MyRequestConfirm
        action={action}
        items={items}
        onClose={() => setAction(null)}
        onDone={(id, patch) => {
          setItems((xs) => byNeed(xs.map((x) => (x.id === id ? { ...x, ...patch } : x))));
          setAction(null);
          setOpenId(null);
        }}
      />
    </PhoneFrame>
  );
}

/* ================================================================ PLT-07 Delegation */

export interface DelegationProps {
  defaultFrom?: Date | null;
  defaultTo?: Date | null;
  defaultDelegate?: string | null;
  active?: boolean;
  showErrors?: boolean;
}

/** Your approved leave, offered as one-click dates (same leave as My requests). */
const MY_LEAVE = { from: new Date(2026, 9, 6), to: new Date(2026, 9, 8), label: 'Earned leave' };
/** Requests waiting for you right now (same number as Approvals). */
const WAITING_FOR_ME = 7;

/** Only people who can approve your request types; anyone away is flagged before they're picked (founder review 30 Sep 2026). */
const DELEGATE_OPTIONS = PEOPLE.filter((p) => p.id !== 'e1' && p.id !== 'p5').map((p) =>
  p.id === 'p6'
    ? { ...p, role: 'QA Lead', note: 'Away 1–10 Oct and has delegated', disabled: true }
    : p.id === 'p1'
      ? { ...p, note: 'Away 29 Sep – 3 Oct' }
      : p,
);

const dayMonth = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export function DelegationForm({ defaultFrom = null, defaultTo = null, defaultDelegate = null, active, showErrors }: DelegationProps) {
  const [from, setFrom] = useState<Date | null>(defaultFrom);
  const [to, setTo] = useState<Date | null>(defaultTo);
  const [delegate, setDelegate] = useState<string | null>(defaultDelegate);
  const [scope, setScope] = useState('all');
  const [types, setTypes] = useState<string[]>(['Leave', 'Timesheet']);
  const [handOver, setHandOver] = useState(true);
  const [tellTeam, setTellTeam] = useState(true);
  const [tried, setTried] = useState(Boolean(showErrors));
  const [saved, setSaved] = useState(Boolean(active));
  const [ending, setEnding] = useState(false);
  const [ended, setEnded] = useState(false);
  const errors = useMemo(
    () => validateDelegation({ from, to, delegateId: delegate, meId: 'e1', delegateDelegatesTo: delegate === 'p6' ? 'p1' : null, today: TODAY }),
    [from, to, delegate],
  );
  const person = PEOPLE.find((p) => p.id === delegate);
  const name = person?.name;
  const first = name?.split(' ')[0];
  const sameAsLeave = from?.getTime() === MY_LEAVE.from.getTime() && to?.getTime() === MY_LEAVE.to.getTime();

  if (ended)
    return (
      <InlineAlert tone="info" title="Delegation ended">
        You approve your own requests again. {first} has been told.
      </InlineAlert>
    );

  if (saved && from && to && name) {
    const started = from <= TODAY;
    return (
      <div className="yx-plt-stack">
        <div className="yx-plt-row">
          <Badge tone={started ? 'success' : 'info'}>{started ? 'Active' : `Scheduled · starts ${dayMonth(from)}`}</Badge>
        </div>
        <InlineAlert tone="success" title={`${name} approves for you from ${formatDate(from)} to ${formatDate(to)}`}>
          {scope === 'all' ? 'All request types.' : `Only: ${types.join(', ')}.`} {first} sees the requests, not your private data: salary details stay hidden unless {first}'s own role allows them. Requests show “{name} (for {ME.name})”.
          {handOver ? ` The ${WAITING_FOR_ME} requests already waiting move to ${first} on ${dayMonth(from)}.` : ''}
        </InlineAlert>
        <div className="yx-plt-row">
          <Button onClick={() => setSaved(false)}>Change</Button>
          <Button onClick={() => setEnding(true)}>{started ? 'End now' : 'Cancel delegation'}</Button>
        </div>
        {ending && (
          <ConfirmDialog
            open
            onOpenChange={(o) => !o && setEnding(false)}
            title={started ? 'End the delegation now?' : 'Cancel this delegation?'}
            consequence={`${first} stops approving for you. Requests come back to you.`}
            confirmLabel={started ? 'End now' : 'Cancel delegation'}
            onConfirm={() => {
              setEnding(false);
              setEnded(true);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="yx-plt-stack">
      <p className="yx-plt-muted">When you are on approved leave, your approvals go to your manager automatically. Set a delegate here to choose someone else or cover other absences.</p>
      {!sameAsLeave && (
        <div className="yx-plt-suggest">
          <span>
            You're on {MY_LEAVE.label.toLowerCase()} {dayMonth(MY_LEAVE.from)} – {dayMonth(MY_LEAVE.to)}.
          </span>
          <Button
            size="sm"
            icon={CalendarDays}
            onClick={() => {
              setFrom(MY_LEAVE.from);
              setTo(MY_LEAVE.to);
            }}
          >
            Use these dates
          </Button>
        </div>
      )}
      <FieldRow>
        <FormField label="I'm away from" required error={tried ? errors.from : null}>
          <DatePicker value={from} onChange={setFrom} min={TODAY} />
        </FormField>
        <FormField label="To" required error={tried ? errors.to : null}>
          <DatePicker value={to} onChange={setTo} min={from ?? TODAY} />
        </FormField>
      </FieldRow>
      <FormField label="Delegate to" required error={tried ? errors.delegate : null} helper="Only people who can approve your request types are listed. Delegation never passes on to a third person.">
        <PersonPicker people={DELEGATE_OPTIONS} value={delegate} onChange={setDelegate} />
      </FormField>
      <FormField label="Which requests">
        <RadioGroup
          aria-label="Which requests"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'All request types' },
            { value: 'some', label: 'Only some types' },
          ]}
        />
      </FormField>
      {scope === 'some' && (
        <div className="yx-plt-chips" role="group" aria-label="Request types">
          {['Leave', 'Expense', 'Timesheet', 'Regularisation'].map((t) => (
            <Checkbox key={t} label={t} checked={types.includes(t)} onChange={(c) => setTypes((xs) => (c ? [...xs, t] : xs.filter((x) => x !== t)))} />
          ))}
        </div>
      )}
      <Switch label={`Also hand over the ${WAITING_FOR_ME} requests already waiting for you`} checked={handOver} onChange={setHandOver} />
      <Switch label={`Let my team know ${first ?? 'who'} approves while I'm away`} checked={tellTeam} onChange={setTellTeam} />
      <div className="yx-plt-card-actions">
        <Button>Cancel</Button>
        <Button
          variant="primary"
          onClick={() => {
            setTried(true);
            if (Object.keys(errors).length === 0) setSaved(true);
          }}
        >
          Save delegation
        </Button>
      </div>
    </div>
  );
}

function DelegatedToYou() {
  return (
    <Card title="Delegated to you">
      <ul className="yx-plt-list">
        <li>
          <span className="yx-plt-list__main">
            <PersonLabel name="Karthik Subramanian" secondary="Head of Quality · away 29 Sep – 3 Oct · all request types" />
          </span>
          <Badge tone="success">Active</Badge>
          <span className="yx-plt-muted">1 request waiting</span>
          <Button size="sm" variant="review">
            Open
          </Button>
        </li>
      </ul>
    </Card>
  );
}

// PLT-07 · Delegation ("I'm away from… to…, delegate to…"). Personal page: no company button.
export function DelegationScreen(props: DelegationProps) {
  return (
    <DesktopFrame area="home" panelTitle="Home" panel={homePanel('Delegation')} scope="none">
      <PageHeader title="Delegation" description="Choose who approves requests for you while you are away." />
      <div className="yx-plt-narrow">
        <Card>
          <DelegationForm {...props} />
        </Card>
      </div>
      <DelegatedToYou />
    </DesktopFrame>
  );
}

export function DelegationPhone(props: DelegationProps) {
  return (
    <PhoneFrame tab="me" title="Delegation" back={<IconButton icon={ArrowLeft} label="Back to Me" />}>
      <DelegationForm {...props} />
      <DelegatedToYou />
    </PhoneFrame>
  );
}
