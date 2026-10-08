import { useState } from 'react';
import { Send, UserCheck } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { Card, DescriptionList } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Text } from '../../components/foundations';
import { useRun } from '../org/org-kit';
import { MessageBody } from '../desk/desk-kit';
import { ConsolePage, LIFECYCLE_LABEL, productNames, when } from './console-kit';
import type { Lifecycle, LoadState, SupportStatus } from './types';

// SD-1.31, YukthiX staff: the YukthiX Support desk in the console (US-B-116 … US-B-120, P14 YX-CONSOLE-01 … 05).
// The tenant panel shows account facts only, never HR data. Looking inside a company needs a support session the
// company's System Admin approves ("Request access").

export interface DeskQueueRow {
  id: string;
  number: string;
  subject: string;
  /** null = not linked to a company yet. */
  company: string | null;
  tier: string;
  severity: number;
  status: string;
  state: string;
  assignee: string | null;
  mine: boolean;
  senderVerified?: boolean;
  dueAt: string | null;
  breached: boolean;
  createdAt: string;
}

export interface DeskConsoleMessage {
  id: string;
  kind: string;
  side: string;
  author: string;
  mine?: boolean;
  bodyHtml: string;
  createdAt: string;
}

export interface DeskTenantPanel {
  name: string;
  tenantId: string | null;
  plan: { name: string; tier: string } | null;
  open: number;
  csat: number | null;
  nps: number | null;
  company: { name: string; slug: string; lifecycle: Lifecycle; billingStatus: string; trialEndsAt: string | null; createdAt: string; products: string[]; adminLastSignIn: string | null } | null;
  health: number;
  healthFactors: string[];
}

export interface DeskConsoleSession {
  id: string;
  status: SupportStatus;
  hours: number;
  startsAt: string | null;
  endsAt: string | null;
  mine: boolean;
  requestedBy: string;
  decidedBy: string | null;
  decisionNote: string | null;
}

export interface DeskConsoleTicket {
  ticket: {
    id: string;
    number: string;
    subject: string;
    systemState: string;
    version: number;
    status: { label: string } | null;
    assignee: { id: string; name: string } | null;
    requester: { name: string; email?: string | null } | null;
    screen?: string | null;
    messages: DeskConsoleMessage[];
    createdAt: string;
  };
  severityLabel: string;
  tier: string;
  tenant: DeskTenantPanel | null;
  session: DeskConsoleSession | null;
  linkable: { id: string; name: string }[];
}

const SEV_SHORT = ['', 'Sev 1 · Down', 'Sev 2 · Badly hurt', 'Sev 3 · Question', 'Sev 4 · Idea'];
const SEV_TONE = ['neutral', 'danger', 'warning', 'info', 'neutral'] as const;
const sevBadge = (n: number) => <Badge tone={SEV_TONE[n] ?? 'neutral'}>{SEV_SHORT[n] ?? `Sev ${n}`}</Badge>;
const tierBadge = (tier: string) => (tier === 'priority' ? <Badge tone="ai">Priority Support</Badge> : <Badge tone="neutral">Standard</Badge>);
const DONE = ['solved', 'closed'];

/** "Not linked" message for staff without a desk seat (403 from the API). */
function Blocked({ message }: { message: string }) {
  return <InlineAlert tone="warning" title={message} />;
}

export interface SupportDeskQueueScreenProps {
  state: LoadState;
  onRetry?: () => void;
  /** The API's own words when the staff member is not a YukthiX Support agent. */
  blocked?: string;
  /** In the order the API returns: severity, Priority Support first, then due time. */
  rows: DeskQueueRow[];
  show: 'open' | 'all';
  onShow: (v: 'open' | 'all') => void;
  onOpen: (id: string) => void;
  now?: Date;
}

/** Console › Support desk: YukthiX's own support queue. */
export function SupportDeskQueueScreen(props: SupportDeskQueueScreenProps) {
  const now = props.now ?? new Date();
  const late = (r: DeskQueueRow) => r.breached || (Boolean(r.dueAt) && new Date(r.dueAt!) < now);
  const columns: TableColumn<DeskQueueRow>[] = [
    { key: 'number', header: 'Ticket', value: (r) => r.number, render: (r) => <span className="yx-ops-mono">{r.number}</span>, width: 110, hideable: false },
    { key: 'severity', header: 'Severity', value: (r) => r.severity, render: (r) => sevBadge(r.severity), width: 160 },
    { key: 'tier', header: 'Support', value: (r) => r.tier, render: (r) => tierBadge(r.tier), width: 160 },
    { key: 'company', header: 'Company', value: (r) => r.company ?? '', render: (r) => (r.company === null ? <Badge tone="warning">Not linked</Badge> : r.company || '—'), width: 180 },
    { key: 'subject', header: 'Subject', value: (r) => r.subject, width: 280 },
    { key: 'status', header: 'Status', value: (r) => r.status, width: 130 },
    { key: 'assignee', header: 'Assignee', value: (r) => r.assignee ?? '', render: (r) => (r.mine ? 'You' : (r.assignee ?? 'Nobody yet')), width: 150, optional: true },
    { key: 'due', header: 'Reply due', value: (r) => r.dueAt ?? '', render: (r) => (r.dueAt ? late(r) ? <Badge tone="danger">Late · {when(r.dueAt)}</Badge> : when(r.dueAt) : '—'), width: 210 },
  ];
  return (
    <ConsolePage crumb="Support desk" title="Support desk" description="Companies' tickets with YukthiX. Most urgent first; Priority Support before Standard." state={props.blocked ? 'ready' : props.state} onRetry={props.onRetry} what="the support desk">
      {props.blocked ? (
        <Blocked message={props.blocked} />
      ) : (
        <DataTable
          label="Support tickets"
          columns={columns}
          rows={props.rows}
          getRowId={(r) => r.id}
          rowNoun={['ticket', 'tickets']}
          cardSummary
          toolbar={<Segment label="Which tickets" options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} value={props.show} onChange={props.onShow} />}
          onRowClick={(r) => props.onOpen(r.id)}
          empty={<EmptyState compact title={props.show === 'open' ? 'No open tickets.' : 'No tickets yet.'} description="Tickets companies send from Contact YukthiX appear here." />}
        />
      )}
    </ConsolePage>
  );
}

export interface SupportDeskTicketScreenProps {
  state: LoadState;
  onRetry?: () => void;
  blocked?: string;
  view: DeskConsoleTicket | null;
  /** Holds platform.support.request (Request access). */
  canRequestAccess: boolean;
  onBack: () => void;
  onPost: (kind: 'reply' | 'note', bodyHtml: string) => Promise<unknown>;
  onAssignMe: () => Promise<unknown>;
  onResolve: (version: number, note?: string) => Promise<unknown>;
  onLink: (accountId: string) => Promise<unknown>;
  onRequestAccess: (input: { reason: string; hours: number }) => Promise<unknown>;
  now?: Date;
}

/** Plain text as simple HTML paragraphs; < > & are escaped (the server cleans it again). */
export function textToParagraphs(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Console › Support desk › one ticket. */
export function SupportDeskTicketScreen(props: SupportDeskTicketScreenProps) {
  const v = props.view;
  const t = v?.ticket;
  const { busy, error, run } = useRun();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'reply' | 'note'>('reply');
  const [accountId, setAccountId] = useState<string | null>(null);
  const done = t ? DONE.includes(t.systemState) : true;
  return (
    <ConsolePage
      crumb="Support desk"
      title={t ? `${t.number} · ${t.subject}` : 'Support ticket'}
      description={v && t ? `${v.severityLabel} · ${t.status?.label ?? ''} · from ${t.requester?.name ?? 'someone'}${t.screen ? ` · on ${t.screen}` : ''}` : undefined}
      state={props.blocked ? 'ready' : props.state}
      onRetry={props.onRetry}
      what="this ticket"
      actions={
        <>
          <Button onClick={props.onBack}>Back to the queue</Button>
          {t && !done && !t.assignee && (
            <Button icon={UserCheck} loading={busy === 'assign'} onClick={() => void run('assign', props.onAssignMe)}>
              Assign to me
            </Button>
          )}
          {t && !done && (
            <Button variant="approve" loading={busy === 'resolve'} onClick={() => void run('resolve', () => props.onResolve(t.version))}>
              Resolve
            </Button>
          )}
        </>
      }
    >
      {props.blocked ? (
        <Blocked message={props.blocked} />
      ) : (
        v &&
        t && (
          <div className="yx-console__split">
            <div className="yx-auth__stack">
              {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
              <Card title="Conversation" actions={tierBadge(v.tier)}>
                <ol className="yx-ops-conv" aria-label="Conversation">
                  {t.messages.map((m) => (
                    <li key={m.id} className="yx-ops-msg" data-kind={m.kind === 'note' ? 'note' : m.mine ? 'mine' : undefined}>
                      <span className="yx-ops-msg__meta">
                        <span className="yx-ops-msg__who">{m.mine ? 'You' : m.author}</span>
                        {m.kind === 'note' && <Badge tone="warning">Internal note · only YukthiX sees it</Badge>}
                        <span>{when(m.createdAt)}</span>
                      </span>
                      <MessageBody html={m.bodyHtml} />
                    </li>
                  ))}
                </ol>
              </Card>
              <Card title="Write">
                <div className="yx-auth__stack">
                  <Segment label="Who sees it" options={[{ value: 'reply', label: 'Reply to the company' }, { value: 'note', label: 'Internal note' }]} value={kind} onChange={setKind} />
                  <FormField label={kind === 'reply' ? 'Reply' : 'Internal note'} helper={kind === 'reply' ? "The company's admin sees this." : 'Only YukthiX staff see this.'}>
                    <TextArea value={text} onChange={setText} rows={5} maxLength={20000} />
                  </FormField>
                  <div className="yx-ops-row">
                    <Button
                      variant="primary"
                      icon={Send}
                      disabled={!text.trim()}
                      loading={busy === 'post'}
                      onClick={() =>
                        void run('post', async () => {
                          await props.onPost(kind, textToParagraphs(text));
                          setText('');
                        })
                      }
                    >
                      {kind === 'reply' ? 'Send reply' : 'Add note'}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
            <div className="yx-auth__stack">
              {v.tenant ? (
                <TenantPanel tenant={v.tenant} tier={v.tier} />
              ) : (
                <Card title="Company">
                  <div className="yx-auth__stack">
                    <InlineAlert tone="warning" title="Not linked to a company">
                      This came from an address we do not know. Link it to the right company before you share anything about an account.
                    </InlineAlert>
                    <FormField label="Company">
                      <Select value={accountId} onChange={setAccountId} options={v.linkable.map((a) => ({ value: a.id, label: a.name }))} placeholder="Choose a company" />
                    </FormField>
                    <div className="yx-ops-row">
                      <Button disabled={!accountId} loading={busy === 'link'} onClick={() => void run('link', () => props.onLink(accountId!))}>
                        Link to a company
                      </Button>
                    </div>
                  </div>
                </Card>
              )}
              {v.tenant && <SessionCard view={v} canRequest={props.canRequestAccess} onRequest={props.onRequestAccess} now={props.now ?? new Date()} />}
            </div>
          </div>
        )
      )}
    </ConsolePage>
  );
}

const words = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

/** Account facts only (YX-CONSOLE-01): never employees, pay or any HR record. */
export function TenantPanel({ tenant, tier }: { tenant: DeskTenantPanel; tier: string }) {
  const c = tenant.company;
  return (
    <Card title={c?.name ?? tenant.name} actions={tierBadge(tier)}>
      <div className="yx-auth__stack">
        <DescriptionList
          items={[
            { label: 'Company code', value: c?.slug ?? '—', mono: true },
            { label: 'Account', value: c ? LIFECYCLE_LABEL[c.lifecycle] : 'No YukthiX account linked' },
            { label: 'Billing', value: c ? words(c.billingStatus) : '—' },
            { label: 'Products', value: c ? productNames(c.products) : '—' },
            { label: 'Plan', value: tenant.plan ? `${tenant.plan.name} · ${tenant.plan.tier === 'priority' ? 'Priority Support' : 'Standard support'}` : '—' },
            { label: 'Open tickets', value: String(tenant.open) },
            { label: 'Ticket rating (CSAT)', value: tenant.csat === null ? 'No ratings yet' : `${tenant.csat} of 5` },
            { label: 'NPS', value: tenant.nps === null ? 'No answers yet' : String(tenant.nps) },
            { label: 'Last admin sign-in', value: when(c?.adminLastSignIn) },
          ]}
        />
        <div>
          <Text weight="medium">Health {tenant.health} of 100</Text>
          <Text tone="secondary" size="sm" as="p">
            {tenant.healthFactors.length ? tenant.healthFactors.join('. ') + '.' : 'Nothing worrying.'}
          </Text>
        </div>
      </div>
    </Card>
  );
}

export function sessionWords(s: DeskConsoleSession, now: Date): string {
  if (s.status === 'approved') return s.endsAt && new Date(s.endsAt) > now ? `Approved until ${when(s.endsAt)}` : 'Expired';
  return { requested: 'Asked. Waiting for the company to approve.', declined: `Declined${s.decisionNote ? `: “${s.decisionNote}”` : ''}`, ended: 'Ended', expired: 'Expired', cancelled: 'Withdrawn' }[s.status];
}

const HOURS = [1, 4, 8, 24, 72] as const;

function SessionCard({ view, canRequest, onRequest, now }: { view: DeskConsoleTicket; canRequest: boolean; onRequest: SupportDeskTicketScreenProps['onRequestAccess']; now: Date }) {
  const s = view.session;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState<number>(4);
  const [tried, setTried] = useState(false);
  const short = reason.trim().length < 10;
  const live = s && (s.status === 'requested' || (s.status === 'approved' && s.endsAt && new Date(s.endsAt) > now));
  const linked = Boolean(view.tenant?.tenantId);
  return (
    <Card title="Look inside the company">
      <div className="yx-auth__stack">
        {s ? <Text weight="medium">{sessionWords(s, now)}</Text> : <Text tone="secondary">Not asked for this ticket.</Text>}
        <Text tone="secondary" size="sm" as="p">
          The company's System Admin approves each support session. It is read-only and ends on time.
        </Text>
        {!live && linked && canRequest && (
          <div className="yx-ops-row">
            <Button
              onClick={() => {
                setReason('');
                setTried(false);
                setOpen(true);
              }}
            >
              Request access
            </Button>
          </div>
        )}
        {!linked && <Text tone="secondary" size="sm">This customer has no YukthiX company account, so there is nothing to look inside.</Text>}
        {!canRequest && linked && !live && <Text tone="secondary" size="sm">You do not hold the key to ask for support sessions.</Text>}
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Ask the company for access?"
        consequence={`The company's System Admin sees your reason with ticket ${view.ticket.number} and decides.`}
        confirmLabel="Send request"
        size="md"
        onConfirm={async () => {
          setTried(true);
          if (short) throw new Error('Write a reason of at least 10 characters.');
          await onRequest({ reason: reason.trim(), hours });
        }}
      >
        <div className="yx-auth__stack">
          <FormField label="Reason" required helper="Kept in the audit log. The company's admins can see it." error={tried && short ? 'Write at least 10 characters' : undefined}>
            <TextArea value={reason} onChange={setReason} rows={3} maxLength={400} />
          </FormField>
          <FormField label="For how long?">
            <Segment label="For how long?" options={HOURS.map((h) => ({ value: h, label: `${h} h` }))} value={hours} onChange={setHours} />
          </FormField>
        </div>
      </ConfirmDialog>
    </Card>
  );
}
