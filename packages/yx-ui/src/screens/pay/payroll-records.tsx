// Payroll records (founder decision 3, 29 Oct 2026: designs for live pages that had none):
// PAY-46 audit log, PAY-48 pay documents (with the pay-portal nominee drawer), PAY-49 pay periods and reopen requests.
// Each screen takes `live` (the page passes the API's data and actions); stories show the same screen with sample data.
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Download, ShieldCheck, UserPlus } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { ErrorSummary, FormField, useTooEarly } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { useToast } from '../../components/notify';
import { Select } from '../../components/select';
import { Card, DescriptionList, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { formatDate } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { IrreversibleSheet, PayFrame, SectionTitle, type PayPage, type PayPersona } from './pay-kit';
import { PersonPicker, type PersonHit } from './live/inputs';
import type { AuditEntry, AuditFilters, AuditPage, ChainStatus, Confirmation, LoadState, PayDocument, PayDocuments, PayPeriods, PeriodHistory, ReopenRequest, Stage } from './live/types';

/* ------------------------------------------------------------------ shared */

/** "2026-09" → "September 2026" */
const monthName = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** "2026-10-02T05:00:00Z" or "2026-10-02" → "2 Oct 2026" (the India day). */
const day = (iso: string) => formatDate(new Date(iso.length === 10 ? `${iso}T00:00:00` : iso));
/** "2 Oct 2026 · 10:30 am" */
const moment = (iso: string) => `${day(iso)} · ${new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()}`;
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;

const STAGE: Record<Stage, { label: string; tone: BadgeTone }> = {
  open: { label: 'Open', tone: 'success' },
  frozen: { label: 'Frozen', tone: 'warning' },
  locked: { label: 'Locked', tone: 'neutral' },
  filed: { label: 'Filed', tone: 'info' },
};
const StageBadge = ({ stage }: { stage: Stage }) => <Badge tone={STAGE[stage].tone}>{STAGE[stage].label}</Badge>;
const REQUEST_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Waiting for approval', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Not approved', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};
const SOURCE: Record<string, string> = { late_request: 'Late request', hr: 'HR correction', device_backfill: 'Device backfill' };

/** "Done" is a toast (5 s); `default` says why a press had nothing to do. */
function useSay() {
  const { toast } = useToast();
  return (title: string, tone: 'success' | 'default' = 'success') => toast({ tone, title });
}

/** Page header and the load states. In the app (`live`) the shell gives the menu; stories show the Pay frame. */
function RecordsPage(p: { framed: boolean; page: PayPage; persona?: PayPersona; title: string; description: string; facts?: ReactNode; actions?: ReactNode; state: LoadState; onRetry?: () => void; what: string; grantedBy: string; children: ReactNode }) {
  const body = (
    <>
      <PageHeader title={p.title} description={p.description} facts={p.state === 'ready' ? p.facts : undefined} actions={p.state === 'ready' ? p.actions : undefined} />
      {p.state === 'loading' && (
        <div className="yx-pay-skeleton" role="status" aria-busy="true" aria-label={`Loading ${p.what}`}>
          <Skeleton height={96} />
          <Skeleton height={240} />
        </div>
      )}
      {p.state === 'error' && <ErrorState title={`We couldn't load ${p.what}.`} description="Nothing has changed. Try again in a moment." onRetry={p.onRetry} />}
      {p.state === 'no-access' && <NoAccessState grantedBy={p.grantedBy} what={p.what} />}
      {p.state === 'ready' && <div className="yx-pay-stack">{p.children}</div>}
    </>
  );
  return p.framed ? (
    <PayFrame page={p.page} persona={p.persona}>
      {body}
    </PayFrame>
  ) : (
    <div className="yx-pay-stack">{body}</div>
  );
}

/* ================================================================== PAY-49 Pay periods */

export interface LivePayPeriods {
  state: LoadState;
  onRetry?: () => void;
  data: PayPeriods | null;
  year: string;
  onYear: (year: string) => void;
  onHistory: (periodId: string) => Promise<PeriodHistory>;
  onAskReopen: (legalEntityId: string, month: string, reason: string) => Promise<unknown>;
  onOpenRequests: () => void;
}
type PeriodRow = PayPeriods['entities'][number]['months'][number];

/** PAY-49 · Pay periods: the stage of every month per legal entity, its history and corrections, and asking to reopen. */
export function PayPeriodsScreen(p: Partial<LivePayPeriods> & { live?: LivePayPeriods; open?: 'ask' | 'history' }) {
  const l: LivePayPeriods = p.live ?? { state: 'ready', data: SAMPLE_PERIODS, year: '2026', onYear: () => undefined, onHistory: async () => SAMPLE_HISTORY, onAskReopen: async () => ({}), onOpenRequests: () => undefined, ...p };
  const d = l.data;
  const say = useSay();
  // Stories open a dialog on the first month it applies to.
  const first = d?.entities.flatMap((e) => e.months.map((m) => ({ e, m }))) ?? [];
  const firstAsk = first.find((x) => x.m.stage === 'locked' && x.e.canRequestReopen && !x.m.reopenRequestId);
  const [asking, setAsking] = useState<{ entity: { id: string; name: string }; month: string } | null>(p.open === 'ask' && firstAsk ? { entity: firstAsk.e, month: firstAsk.m.month } : null);
  const [history, setHistory] = useState<string | null>(p.open === 'history' ? ([...first].reverse().find((x) => x.m.periodId)?.m.periodId ?? null) : null);
  const thisYear = d?.today.slice(0, 4) ?? l.year;
  const nextYear = () => (l.year >= thisYear ? say(`${Number(l.year) + 1} has not started yet.`, 'default') : l.onYear(String(Number(l.year) + 1)));
  const cols = (e: PayPeriods['entities'][number]): TableColumn<PeriodRow>[] => [
    { key: 'month', header: 'Month', value: (m) => m.month, render: (m) => <strong>{monthName(m.month)}</strong>, width: 160, hideable: false },
    { key: 'stage', header: 'Stage', value: (m) => STAGE[m.stage].label, render: (m) => <StageBadge stage={m.stage} />, width: 110 },
    { key: 'change', header: 'Last change', value: (m) => m.changedAt ?? '', render: (m) => <span className="yx-pay-note">{m.changedAt && (m.stage !== 'open' || m.reason) ? `${day(m.changedAt)}${m.changedBy ? ` by ${m.changedBy}` : ''}${m.reason ? `: ${m.reason}` : ''}` : ''}</span>, width: 260 },
    { key: 'corr', header: 'Corrections for the next payroll', value: (m) => m.corrections.pending + m.corrections.approved, render: (m) => <span className="yx-pay-note">{m.corrections.pending || m.corrections.approved ? `${m.corrections.approved} approved, ${m.corrections.pending} waiting` : 'None'}</span>, width: 220 },
    {
      key: 'act',
      header: 'Actions',
      value: () => '',
      render: (m) => (
        <span className="yx-pay-row">
          {m.periodId && (
            <Button size="sm" onClick={() => setHistory(m.periodId)}>
              History
            </Button>
          )}
          {m.reopenRequestId ? (
            <Button size="sm" onClick={l.onOpenRequests}>
              Reopen asked
            </Button>
          ) : m.stage === 'locked' && e.canRequestReopen ? (
            <Button size="sm" onClick={() => setAsking({ entity: e, month: m.month })}>
              Ask to reopen
            </Button>
          ) : null}
        </span>
      ),
      width: 240,
      sortable: false,
    },
  ];
  return (
    <RecordsPage
      framed={!p.live}
      page="runs"
      title="Pay periods"
      description="Each month's stage per legal entity. A locked month never changes: corrections are paid in the next payroll. Reopening needs two other people to approve."
      state={l.state}
      onRetry={l.onRetry}
      what="pay periods"
      grantedBy="your payroll admin"
      actions={
        <span className="yx-pay-row">
          <IconButton icon={ChevronLeft} label="Previous year" variant="secondary" onClick={() => l.onYear(String(Number(l.year) - 1))} />
          <strong aria-live="polite">{l.year}</strong>
          <IconButton icon={ChevronRight} label="Next year" variant="secondary" onClick={nextYear} />
          <Button onClick={l.onOpenRequests}>Reopen requests</Button>
        </span>
      }
    >
      {d && !d.entities.length && <EmptyState title="No legal entity in your scope" description="Pay periods show the legal entities you look after in payroll. Ask your payroll admin to add yours." />}
      {d?.entities.map((e) => (
        <Card key={e.id} title={`${e.name} · ${d.year}`}>
          <DataTable label={`${e.name} pay periods`} columns={cols(e)} rows={[...e.months].reverse()} getRowId={(m) => m.month} empty={<EmptyState compact title={`No months in ${d.year} yet`} />} />
        </Card>
      ))}
      {asking && <AskReopenDrawer target={asking} onClose={() => setAsking(null)} onAsk={l.onAskReopen} />}
      {history && <HistoryDrawer periodId={history} onClose={() => setHistory(null)} onHistory={l.onHistory} />}
    </RecordsPage>
  );
}

function AskReopenDrawer({ target, onClose, onAsk }: { target: { entity: { id: string; name: string }; month: string }; onClose: () => void; onAsk: LivePayPeriods['onAskReopen'] }) {
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const say = useSay();
  const early = useTooEarly(reason.trim().length < 10 ? [{ fieldId: 'ro-why', message: 'Say why in a sentence (at least 10 letters).' }] : []);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Ask to reopen ${monthName(target.month)}?`}
      subtitle={target.entity.name}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'ask'}
            onClick={() => {
              if (early.stop()) return;
              void run('ask', async () => {
                await onAsk(target.entity.id, target.month, reason.trim());
                say(`Sent for approval: reopen ${monthName(target.month)}`);
                onClose();
              });
            }}
          >
            Send for approval
          </Button>
        </>
      }
    >
      <div className="yx-pay-stack">
        {error && (
          <InlineAlert tone="danger" title="Not sent">
            {error}
          </InlineAlert>
        )}
        <InlineAlert tone="info" title="Two approvals, then the month opens">
          Someone else in payroll checks it first, then Finance or a System Admin gives the final approval. You can't approve your own request. A month whose bank file is released, whose payslips are issued or whose return is filed can't be reopened.
        </InlineAlert>
        <FormField id="ro-why" label="Why" required error={early.errorOf('ro-why')}>
          <TextArea id="ro-why" value={reason} onChange={setReason} rows={3} maxLength={500} />
        </FormField>
      </div>
    </Drawer>
  );
}

function HistoryDrawer({ periodId, onClose, onHistory }: { periodId: string; onClose: () => void; onHistory: LivePayPeriods['onHistory'] }) {
  const [h, setH] = useState<PeriodHistory | null>(null);
  const { busy, error, run } = useRun();
  const load = () => void run('load', async () => setH(await onHistory(periodId)));
  useEffect(load, [periodId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={h ? `${monthName(h.month)}: history` : 'History'} meta={h ? <StageBadge stage={h.stage} /> : undefined} size="lg" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="yx-pay-stack">
        {busy && <Skeleton height={120} />}
        {error && <ErrorState title="We couldn't load the history." description={error} onRetry={load} />}
        {h && (
          <>
            <section aria-label="Stage changes" className="yx-pay-stack">
              <SectionTitle>Stage changes</SectionTitle>
              {h.events.length ? (
                <ol className="yx-pay-stack">
                  {h.events.map((e, i) => (
                    <li key={i} className="yx-pay-row">
                      <StageBadge stage={e.to} />
                      <span className="yx-pay-note">
                        {moment(e.at)}
                        {e.by ? ` by ${e.by}` : ' after two approvals'}
                        {e.reason ? `: ${e.reason}` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="yx-pay-note">Open since the month began.</p>
              )}
            </section>
            <section aria-label="Corrections" className="yx-pay-stack">
              <SectionTitle>Corrections</SectionTitle>
              <DataTable
                label="Corrections"
                getRowId={(c) => c.id}
                rows={h.corrections}
                columns={[
                  { key: 'person', header: 'Person', value: (c) => c.person, width: 170, hideable: false },
                  { key: 'on', header: 'Day', value: (c) => c.on, render: (c) => day(c.on), width: 120 },
                  { key: 'source', header: 'From', value: (c) => SOURCE[c.source] ?? c.source, width: 150 },
                  { key: 'status', header: 'Status', value: (c) => REQUEST_STATUS[c.status]?.label ?? c.status, render: (c) => <Badge tone={REQUEST_STATUS[c.status]?.tone ?? 'neutral'}>{REQUEST_STATUS[c.status]?.label ?? c.status}</Badge>, width: 170 },
                  { key: 'paid', header: 'Paid in', value: (c) => c.paidIn ?? '', render: (c) => (c.paidIn ? monthName(c.paidIn) : ''), width: 140 },
                ]}
                empty={<EmptyState compact title="No corrections for this month." />}
              />
            </section>
          </>
        )}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ PAY-49 Reopen requests */

export interface LiveReopenRequests {
  state: LoadState;
  onRetry?: () => void;
  data: ReopenRequest[] | null;
  /** The signed-in person: the sheet refuses when they asked for the reopen themselves (maker is not checker). */
  me: string;
  onDecide: (id: string, decision: 'approve' | 'reject', reason: string | null, confirmation?: Confirmation) => Promise<unknown>;
}

const stepText = (s: string) => (s === 'approved' ? 'Approved' : s === 'rejected' ? 'Not approved' : s === 'open' ? 'Waiting' : 'Not yet');
const stepTone = (s: string): BadgeTone => (s === 'approved' ? 'success' : s === 'rejected' ? 'danger' : s === 'open' ? 'info' : 'neutral');

/** PAY-49 · Reopen requests: two people other than the one who asked approve, each with a fresh second step and the typed phrase. */
export function ReopenRequestsScreen(p: Partial<LiveReopenRequests> & { live?: LiveReopenRequests; open?: 'approve' | 'decline' }) {
  const l: LiveReopenRequests = p.live ?? { state: 'ready', data: SAMPLE_REQUESTS, me: 'Neha Joshi', onDecide: async () => ({}), ...p };
  const firstOpen = l.data?.find((r) => r.canDecide) ?? null;
  const [approving, setApproving] = useState<ReopenRequest | null>(p.open === 'approve' ? firstOpen : null);
  const [declining, setDeclining] = useState<ReopenRequest | null>(p.open === 'decline' ? firstOpen : null);
  const { error, run, clearError } = useRun();
  const say = useSay();
  const waiting = (l.data ?? []).filter((r) => r.canDecide).length;
  return (
    <RecordsPage
      framed={!p.live}
      page="runs"
      persona="fin"
      title="Reopen requests"
      description="Requests to reopen a locked pay month. Two people other than the one who asked must approve, each with a fresh second sign-in step."
      facts={waiting ? (waiting === 1 ? '1 request is waiting for you.' : `${waiting} requests are waiting for you.`) : undefined}
      state={l.state}
      onRetry={l.onRetry}
      what="reopen requests"
      grantedBy="your payroll admin"
    >
      {l.data && !l.data.length && <EmptyState title="No reopen requests" description="A locked month is reopened only through a request here. Ask from Pay periods." />}
      {(l.data ?? []).map((r) => (
        <Card key={r.id} title={`${monthName(r.month)} · ${r.entity}`} actions={<Badge tone={REQUEST_STATUS[r.status]?.tone ?? 'neutral'}>{REQUEST_STATUS[r.status]?.label ?? r.status}</Badge>}>
          <div className="yx-pay-stack">
            <p>
              <span className="yx-pay-note">
                Asked by {r.requestedByMe ? 'you' : r.requestedBy} on {day(r.at)}:
              </span>{' '}
              {r.reason}
            </p>
            <ol className="yx-pay-stack" aria-label="Approvals">
              {r.steps.map((s, i) => (
                <li key={i} className="yx-pay-row">
                  <strong>
                    {i + 1}. {s.name}
                  </strong>
                  <Badge tone={stepTone(s.state)}>{stepText(s.state)}</Badge>
                  <span className="yx-pay-note">{s.decidedBy.length ? s.decidedBy.map((x) => `${x.who}${x.reason ? `: ${x.reason}` : ''}`).join(', ') : s.approvers.join(', ')}</span>
                </li>
              ))}
            </ol>
            {r.requestedByMe && r.status === 'pending' && <p className="yx-pay-note">You asked for this, so two other people approve it.</p>}
            {r.canDecide && (
              <span className="yx-pay-row">
                <Button variant="approve" onClick={() => setApproving(r)}>
                  Approve
                </Button>
                <Button onClick={() => setDeclining(r)}>Turn down</Button>
              </span>
            )}
          </div>
        </Card>
      ))}
      {approving && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => {
            if (!o) {
              setApproving(null);
              clearError();
            }
          }}
          title={`Approve reopening ${monthName(approving.month)}`}
          subtitle={approving.entity}
          impact={[
            { label: 'Legal entity', value: approving.entity },
            { label: 'Month', value: monthName(approving.month) },
            { label: 'Your step', value: approving.steps.find((s) => s.state === 'open')?.name ?? '' },
            { label: 'Asked by', value: approving.requestedBy },
          ]}
          cannotUndo={
            approving.steps.filter((s) => s.state !== 'approved').length === 1
              ? 'The month opens as soon as you approve: attendance, leave and payroll inputs can change again, and its frozen payroll figures are set aside.'
              : 'Your approval is recorded with what you see here; the month opens after the last approval.'
          }
          correction="If the month should stay closed, turn the request down instead: corrections are paid in the next payroll. You confirm it is you with your second sign-in step."
          phrase={approving.phrase ?? ''}
          maker={approving.requestedBy}
          checker={approving.requestedByMe ? approving.requestedBy : l.me}
          confirmLabel="Approve"
          error={error}
          onConfirm={() =>
            void run('approve', async () => {
              const r = approving;
              await l.onDecide(r.id, 'approve', null, { phrase: r.phrase ?? '', impact: [{ label: 'Legal entity', value: r.entity }, { label: 'Month', value: monthName(r.month) }] });
              setApproving(null);
              say(`You approved reopening ${monthName(r.month)} for ${r.entity}`);
            })
          }
        />
      )}
      {declining && (
        <DeclineDrawer
          request={declining}
          onClose={() => setDeclining(null)}
          onDecline={async (reason) => {
            await l.onDecide(declining.id, 'reject', reason);
            say(`Reopening ${monthName(declining.month)} turned down`);
          }}
        />
      )}
    </RecordsPage>
  );
}

function DeclineDrawer({ request, onClose, onDecline }: { request: ReopenRequest; onClose: () => void; onDecline: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const early = useTooEarly(reason.trim().length < 5 ? [{ fieldId: 'rd-why', message: 'Say why, so the person who asked knows what to do.' }] : []);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Turn down reopening ${monthName(request.month)}?`}
      subtitle={request.entity}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={busy === 'no'}
            onClick={() => {
              if (early.stop()) return;
              void run('no', async () => {
                await onDecline(reason.trim());
                onClose();
              });
            }}
          >
            Turn down
          </Button>
        </>
      }
    >
      <div className="yx-pay-stack">
        {error && (
          <InlineAlert tone="danger" title="Not saved">
            {error}
          </InlineAlert>
        )}
        <FormField id="rd-why" label="Why" required error={early.errorOf('rd-why')}>
          <TextArea id="rd-why" value={reason} onChange={setReason} rows={3} maxLength={500} />
        </FormField>
      </div>
    </Drawer>
  );
}

/* ================================================================== PAY-46 Audit log */

export interface LivePayAudit {
  state: LoadState;
  onRetry?: () => void;
  data: AuditPage | null;
  chain: ChainStatus | null;
  filters: AuditFilters;
  onFilters: (f: AuditFilters) => void;
  /** Older events; absent when there are none. */
  onMore?: () => void;
  canExport: boolean;
  onExport: () => Promise<unknown>;
  onVerify: () => Promise<unknown>;
  onTimeline: (entityType: string, entityId: string) => Promise<AuditEntry[]>;
}

/** "payroll.period.reopened" → "Payroll period reopened" */
export const actionText = (a: string) => {
  const s = a.replace(/[._]/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** PAY-46 · Audit log: business events in scope (Confidential values masked by the server), a record's timeline, the daily chain check and the recorded export. */
export function PayAuditScreen(p: Partial<LivePayAudit> & { live?: LivePayAudit; open?: 'details' | 'timeline' }) {
  const l: LivePayAudit = p.live ?? { state: 'ready', data: SAMPLE_AUDIT, chain: SAMPLE_CHAIN_OK, filters: {}, onFilters: () => undefined, onMore: () => undefined, canExport: true, onExport: async () => ({}), onVerify: async () => ({}), onTimeline: async () => SAMPLE_AUDIT.entries, ...p };
  const firstEntry = l.data?.entries[0] ?? null;
  const [draft, setDraft] = useState<AuditFilters>(l.filters);
  const [open, setOpen] = useState<AuditEntry | null>(p.open === 'details' ? firstEntry : null);
  const [record, setRecord] = useState<{ type: string; id: string } | null>(p.open === 'timeline' && firstEntry?.entityId ? { type: firstEntry.entityType, id: firstEntry.entityId } : null);
  const { busy, error, run } = useRun();
  const say = useSay();
  const last = l.chain?.checks[0];
  const filtered = Object.values(l.filters).some(Boolean);
  const cols: TableColumn<AuditEntry>[] = [
    { key: 'at', header: 'When', value: (e) => e.at, render: (e) => <span className="yx-pay-note">{moment(e.at)}</span>, width: 190 },
    { key: 'actor', header: 'Who', value: (e) => e.actor, render: (e) => <span>{e.actor}{e.actorRole ? <span className="yx-pay-note"> · {e.actorRole}</span> : null}</span>, width: 220 },
    { key: 'action', header: 'What happened', value: (e) => actionText(e.action), render: (e) => <strong>{actionText(e.action)}</strong>, width: 240, hideable: false },
    { key: 'type', header: 'Record', value: (e) => e.entityType, render: (e) => <span className="yx-pay-mono">{e.entityType}</span>, width: 150 },
  ];
  return (
    <RecordsPage
      framed={!p.live}
      page="reports"
      title="Audit log"
      description="Who did what, and when. Rows can't be changed or removed; a daily check proves it. Pay and identity values are hidden unless you may see them."
      state={l.state}
      onRetry={l.onRetry}
      what="the audit log"
      grantedBy="your System Admin"
      actions={
        l.canExport ? (
          <Button
            icon={Download}
            loading={busy === 'export'}
            onClick={() =>
              void run('export', async () => {
                await l.onExport();
                say('Export downloaded. The export itself is recorded in this log.');
              })
            }
          >
            Export (recorded)
          </Button>
        ) : undefined
      }
    >
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <Card
        title="Chain check"
        actions={
          l.chain?.canVerify ? (
            <Button
              size="sm"
              icon={ShieldCheck}
              loading={busy === 'verify'}
              onClick={() =>
                void run('verify', async () => {
                  await l.onVerify();
                  say('Chain checked');
                })
              }
            >
              Check now
            </Button>
          ) : undefined
        }
      >
        {last ? (
          <div className="yx-pay-row">
            {last.result === 'ok' ? <Badge tone="success">Chain OK</Badge> : <Badge tone="danger">Chain broken</Badge>}
            <span className="yx-pay-note">
              Last checked {moment(last.at)} · {last.rows} rows up to row {last.lastSeq}
              {last.problem ? ` · ${last.problem}` : ''}
            </span>
          </div>
        ) : (
          <p className="yx-pay-note">Not checked yet. The check runs every day.</p>
        )}
      </Card>
      <form
        className="yx-pay-row"
        aria-label="Find events"
        onSubmit={(e) => {
          e.preventDefault();
          l.onFilters(draft);
        }}
      >
        <FormField id="au-action" label="What happened (starts with)">
          <TextField id="au-action" value={draft.action ?? ''} onChange={(v) => setDraft({ ...draft, action: v || undefined })} placeholder="payroll.period" />
        </FormField>
        <FormField id="au-type" label="Record type">
          <TextField id="au-type" value={draft.entityType ?? ''} onChange={(v) => setDraft({ ...draft, entityType: v || undefined })} placeholder="pay_period" />
        </FormField>
        <FormField id="au-from" label="From">
          <TextField id="au-from" type="date" value={draft.from ?? ''} onChange={(v) => setDraft({ ...draft, from: v || undefined })} />
        </FormField>
        <FormField id="au-to" label="To">
          <TextField id="au-to" type="date" value={draft.to ?? ''} onChange={(v) => setDraft({ ...draft, to: v || undefined })} />
        </FormField>
        <Button type="submit" variant="primary">
          Search
        </Button>
      </form>
      {l.data && (
        <DataTable
          label="Audit events"
          columns={cols}
          rows={l.data.entries}
          getRowId={(e) => e.id}
          onRowClick={setOpen}
          activeRowId={open?.id}
          filtered={filtered}
          onClearFilters={() => {
            setDraft({});
            l.onFilters({});
          }}
          rowButtons={(e) =>
            e.entityId ? (
              <Button size="sm" onClick={() => setRecord({ type: e.entityType, id: e.entityId! })}>
                Record timeline
              </Button>
            ) : null
          }
          empty={<EmptyState title="No events yet" description="Payroll actions are recorded here as people take them." />}
        />
      )}
      {l.data?.next && l.onMore && (
        <span className="yx-pay-row">
          <Button onClick={l.onMore}>Show older</Button>
        </span>
      )}
      {open && (
        <Drawer open onOpenChange={(o) => !o && setOpen(null)} title={actionText(open.action)} subtitle={`${moment(open.at)} · ${open.actor}${open.seq ? ` · row ${open.seq}` : ''}`} footer={<Button onClick={() => setOpen(null)}>Close</Button>}>
          <AuditDetails value={open.details} />
        </Drawer>
      )}
      {record && <TimelineDrawer record={record} onClose={() => setRecord(null)} onTimeline={l.onTimeline} />}
    </RecordsPage>
  );
}

/** What the server sent for an event; masked values arrive already masked. */
function AuditDetails({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <p className="yx-pay-note">No details recorded.</p>;
  if (typeof value !== 'object') return <p>{String(value)}</p>;
  return <DescriptionList items={Object.entries(value as Record<string, unknown>).map(([k, v]) => ({ label: k, value: typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v) }))} />;
}

function TimelineDrawer({ record, onClose, onTimeline }: { record: { type: string; id: string }; onClose: () => void; onTimeline: LivePayAudit['onTimeline'] }) {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const { busy, error, run } = useRun();
  const load = () => void run('load', async () => setRows(await onTimeline(record.type, record.id)));
  useEffect(load, [record.type, record.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title="Record timeline" subtitle={`${record.type} · business events only`} size="lg" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="yx-pay-stack">
        {busy && <Skeleton height={120} />}
        {error && <ErrorState title="We couldn't load the timeline." description={error} onRetry={load} />}
        {rows &&
          (rows.length ? (
            <ol className="yx-pay-stack" aria-label="Timeline">
              {rows.map((r) => (
                <li key={r.id} className="yx-pay-row">
                  <strong>{actionText(r.action)}</strong>
                  <span className="yx-pay-note">
                    {moment(r.at)} · {r.actor}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState compact title="No business events for this record." />
          ))}
      </div>
    </Drawer>
  );
}

/* ================================================================== PAY-48 Pay documents */

export interface NomineeInput {
  employeeId: string;
  name: string;
  email: string;
  validUntil: string;
}

export interface LivePayDocuments {
  state: LoadState;
  onRetry?: () => void;
  data: PayDocuments | null;
  entityId: string | null;
  onEntity: (id: string | null) => void;
  onDownload: (doc: PayDocument) => Promise<unknown>;
  verifyUrl: (code: string) => string;
  /** payroll.document.issue: may add a nominee for the pay portal (the server checks it again). */
  canAddNominee: boolean;
  onSearch: (q: string) => Promise<PersonHit[]>;
  onAddNominee: (x: NomineeInput) => Promise<unknown>;
}

const DOC_STATUS: Record<PayDocument['status'], { label: string; tone: BadgeTone }> = {
  issued: { label: 'Issued', tone: 'success' },
  superseded: { label: 'Superseded', tone: 'neutral' },
  awaiting_signature: { label: 'Waiting for the company signature', tone: 'warning' },
};

/** PAY-48 · Pay documents: as issued (never changed; a correction supersedes), with reference, fingerprint and verify code; a nominee reads them in the pay portal. */
export function PayDocumentsScreen(p: Partial<LivePayDocuments> & { live?: LivePayDocuments; open?: 'nominee' }) {
  const l: LivePayDocuments = p.live ?? {
    state: 'ready',
    data: SAMPLE_DOCUMENTS,
    entityId: null,
    onEntity: () => undefined,
    onDownload: async () => ({}),
    verifyUrl: (c) => `https://kaverifoods.yukthix.test/verify/${c}`,
    canAddNominee: true,
    onSearch: async () => SAMPLE_PEOPLE,
    onAddNominee: async () => ({}),
    ...p,
  };
  const d = l.data;
  const [nominee, setNominee] = useState(p.open === 'nominee');
  const { busy, error, run } = useRun();
  const cols: TableColumn<PayDocument>[] = [
    { key: 'person', header: 'Person', type: 'person', value: (x) => x.person ?? '', person: (x) => ({ name: x.person ?? '' }), width: 190 },
    { key: 'title', header: 'Document', value: (x) => x.title, render: (x) => <strong>{x.title}</strong>, width: 200, hideable: false },
    { key: 'ref', header: 'Reference', value: (x) => x.referenceNo, render: (x) => <span className="yx-pay-mono" title={`SHA-256 ${x.sha256}`}>{x.referenceNo}<br /><span className="yx-pay-note">SHA-256 {short(x.sha256)}</span></span>, width: 200 },
    { key: 'issued', header: 'Issued', value: (x) => x.issuedAt, render: (x) => day(x.issuedAt), width: 110 },
    { key: 'status', header: 'Status', value: (x) => DOC_STATUS[x.status].label, render: (x) => <Badge tone={DOC_STATUS[x.status].tone}>{DOC_STATUS[x.status].label}</Badge>, width: 170 },
    {
      key: 'code',
      header: 'Check it',
      value: (x) => x.verifyCode ?? '',
      render: (x) =>
        x.verifyCode ? (
          <a href={l.verifyUrl(x.verifyCode)} target="_blank" rel="noreferrer">
            {x.verifyCode}
          </a>
        ) : (
          ''
        ),
      width: 130,
    },
  ];
  return (
    <RecordsPage
      framed={!p.live}
      page="payments"
      title="Pay documents"
      description="Payslips, letters and advices as issued. An issued document never changes; a correction issues a new one that supersedes it. Every view of someone else's document is recorded."
      state={l.state}
      onRetry={l.onRetry}
      what="pay documents"
      grantedBy="your payroll admin"
      actions={
        l.canAddNominee ? (
          <Button icon={UserPlus} onClick={() => setNominee(true)}>
            Add a nominee
          </Button>
        ) : undefined
      }
    >
      {d && (
        <>
          <span className="yx-pay-row">
            <FormField id="pd-entity" label="Legal entity">
              <Select value={l.entityId} onChange={l.onEntity} clearable placeholder="All in your scope" options={d.entities.map((e) => ({ value: e.id, label: e.name }))} />
            </FormField>
          </span>
          {error && (
            <InlineAlert tone="danger" title="Not downloaded">
              {error}
            </InlineAlert>
          )}
          <DataTable
            label="Pay documents"
            columns={cols}
            rows={d.documents}
            getRowId={(x) => x.id}
            filtered={Boolean(l.entityId)}
            onClearFilters={() => l.onEntity(null)}
            rowButtons={(x) =>
              x.purged ? (
                <span className="yx-pay-note">Deleted after its retention period</span>
              ) : (
                <Button size="sm" loading={busy === x.id} onClick={() => void run(x.id, () => l.onDownload(x))}>
                  Download PDF
                </Button>
              )
            }
            empty={<EmptyState title="No documents yet" description="Payslips appear here when payroll issues them." />}
          />
        </>
      )}
      {nominee && <NomineeDrawer onSearch={l.onSearch} onClose={() => setNominee(false)} onSave={l.onAddNominee} />}
    </RecordsPage>
  );
}

/** A nominee signs in to the pay portal with a code sent to their email and can only read the person's pay documents. */
function NomineeDrawer({ onSearch, onClose, onSave }: { onSearch: (q: string) => Promise<PersonHit[]>; onClose: () => void; onSave: (x: NomineeInput) => Promise<unknown> }) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [until, setUntil] = useState('');
  const { busy, error, run } = useRun();
  const say = useSay();
  const today = new Date().toISOString().slice(0, 10);
  const early = useTooEarly([
    ...(!who ? [{ fieldId: 'nm-who', message: 'Choose whose documents.' }] : []),
    ...(name.trim().length < 2 ? [{ fieldId: 'nm-name', message: "Give the nominee's name." }] : []),
    ...(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? [{ fieldId: 'nm-email', message: 'Give an email address like name@example.com.' }] : []),
    ...(!/^\d{4}-\d{2}-\d{2}$/.test(until) || until <= today ? [{ fieldId: 'nm-until', message: 'A day after today.' }] : []),
  ]);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a nominee"
      subtitle="They sign in to the pay portal with a code sent to this email, and can only read."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => {
              if (early.stop()) return;
              void run('save', async () => {
                await onSave({ employeeId: who!.id, name: name.trim(), email: email.trim(), validUntil: until });
                say(`${name.trim()} can now read ${who!.name}'s pay documents`);
                onClose();
              });
            }}
          >
            Add nominee
          </Button>
        </>
      }
    >
      <div className="yx-pay-stack">
        {error && (
          <InlineAlert tone="danger" title="Not added">
            {error}
          </InlineAlert>
        )}
        <PersonPicker id="nm-who" label="Whose documents" value={who} onChange={setWho} onSearch={onSearch} error={early.errorOf('nm-who')} />
        <FormField id="nm-name" label="Nominee's name" required error={early.errorOf('nm-name')}>
          <TextField id="nm-name" value={name} onChange={setName} maxLength={200} />
        </FormField>
        <FormField id="nm-email" label="Nominee's email" required error={early.errorOf('nm-email')}>
          <TextField id="nm-email" type="email" value={email} onChange={setEmail} maxLength={200} />
        </FormField>
        <FormField id="nm-until" label="Access until" required error={early.errorOf('nm-until')}>
          <TextField id="nm-until" type="date" value={until} onChange={setUntil} />
        </FormField>
      </div>
    </Drawer>
  );
}

/* ================================================================== Sample data (stories): Kaveri Foods, 28 Oct 2026 */

const KF = 'Kaveri Foods Pvt Ltd';
const KF_TN = 'Kaveri Foods Pvt Ltd (Tamil Nadu)';
const month = (m: string, stage: Stage, over: Partial<PeriodRow> = {}): PeriodRow => ({
  month: m,
  periodId: stage === 'open' ? null : `p-${m}`,
  stage,
  lockedAt: stage === 'open' ? null : `${m}-28T05:00:00Z`,
  lockedBy: stage === 'open' ? null : 'Lakshmi Venkatesan',
  changedAt: stage === 'open' ? null : `${m}-28T05:00:00Z`,
  changedBy: stage === 'open' ? null : 'Lakshmi Venkatesan',
  reason: null,
  reopenRequestId: null,
  corrections: { pending: 0, approved: 0 },
  ...over,
});
export const SAMPLE_PERIODS: PayPeriods = {
  year: '2026',
  today: '2026-10-28',
  entities: [
    {
      id: 'le-kfpl',
      name: KF,
      shortName: 'KFPL',
      canRequestReopen: true,
      months: [month('2026-07', 'filed'), month('2026-08', 'locked', { corrections: { pending: 0, approved: 1 } }), month('2026-09', 'locked', { corrections: { pending: 1, approved: 2 } }), month('2026-10', 'open')],
    },
    {
      id: 'le-tn',
      name: KF_TN,
      shortName: 'KFPL-TN',
      canRequestReopen: false,
      months: [month('2026-09', 'locked', { changedAt: '2026-10-09T05:00:00Z', changedBy: 'Suresh Pillai', reopenRequestId: 'r1' }), month('2026-10', 'open')],
    },
  ],
};
export const SAMPLE_HISTORY: PeriodHistory = {
  id: 'p-2026-09',
  month: '2026-09',
  stage: 'locked',
  events: [
    { at: '2026-10-02T05:00:00Z', from: 'open', to: 'frozen', by: 'Lakshmi Venkatesan', reason: null },
    { at: '2026-10-02T05:10:00Z', from: 'frozen', to: 'locked', by: 'Lakshmi Venkatesan', reason: null },
  ],
  reopenRequests: [],
  corrections: [
    { id: 'c1', person: 'Rekha Balan', on: '2026-09-18', kind: 'attendance', source: 'hr', change: { shouldBe: 'present' }, reason: 'Biometric reader was down at the Hosur gate', status: 'approved', paidIn: '2026-10' },
    { id: 'c2', person: 'Anil Kumar', on: '2026-09-27', kind: 'overtime', source: 'late_request', change: {}, reason: 'Boiler breakdown call-out approved late', status: 'pending', paidIn: null },
  ],
};
export const SAMPLE_REQUESTS: ReopenRequest[] = [
  {
    id: 'r1',
    entity: KF_TN,
    legalEntityId: 'le-tn',
    month: '2026-09',
    stage: 'locked',
    reason: 'A late overtime claim of Anil Kumar was approved after the lock',
    status: 'pending',
    requestedBy: 'Suresh Pillai',
    requestedByMe: false,
    at: '2026-10-09T05:00:00Z',
    decidedAt: null,
    steps: [
      { name: 'Payroll check', state: 'approved', approvers: ['Meena Raghavan'], decidedBy: [{ who: 'Meena Raghavan', action: 'approved', reason: null, at: '2026-10-09T06:00:00Z' }] },
      { name: 'Finance or System Admin', state: 'open', approvers: ['Neha Joshi'], decidedBy: [] },
    ],
    canDecide: true,
    phrase: 'REOPEN KFPL-TN 2026-09',
  },
  {
    id: 'r0',
    entity: KF,
    legalEntityId: 'le-kfpl',
    month: '2026-06',
    stage: 'locked',
    reason: 'Arrears for the June wage revision were missed',
    status: 'rejected',
    requestedBy: 'Neha Joshi',
    requestedByMe: true,
    at: '2026-07-10T05:00:00Z',
    decidedAt: '2026-07-10T09:00:00Z',
    steps: [{ name: 'Payroll check', state: 'rejected', approvers: ['Meena Raghavan'], decidedBy: [{ who: 'Meena Raghavan', action: 'rejected', reason: 'Pay the arrears as a correction in July', at: '2026-07-10T09:00:00Z' }] }],
    canDecide: false,
    phrase: null,
  },
];
/** Neha asked for this one, so she cannot decide it: two other people approve (maker is not checker). */
export const SAMPLE_REQUEST_MINE: ReopenRequest = { ...SAMPLE_REQUESTS[0]!, id: 'r2', requestedBy: 'Neha Joshi', requestedByMe: true, canDecide: false, steps: [{ name: 'Payroll check', state: 'open', approvers: ['Meena Raghavan'], decidedBy: [] }, { name: 'Finance or System Admin', state: 'waiting', approvers: ['Ramesh Krishnan'], decidedBy: [] }] };
export const SAMPLE_AUDIT: AuditPage = {
  entries: [
    { id: 'a4', seq: '1043', at: '2026-10-12T04:40:00Z', action: 'employee.salary.changed', entityType: 'compensation', entityId: 'cmp-0142', actor: 'Lakshmi Venkatesan', actorRole: 'Payroll admin', details: { employee: 'KF-0142', ctc: '••••••', reason: 'Annual revision' } },
    { id: 'a3', seq: '1042', at: '2026-10-09T06:00:00Z', action: 'payroll.reopen.approved', entityType: 'reopen_request', entityId: 'r1', actor: 'Meena Raghavan', actorRole: 'Payroll lead', details: { step: 'Payroll check' } },
    { id: 'a2', seq: '1041', at: '2026-10-09T05:00:00Z', action: 'payroll.reopen.requested', entityType: 'reopen_request', entityId: 'r1', actor: 'Suresh Pillai', actorRole: 'Payroll executive', details: { month: '2026-09' } },
    { id: 'a1', seq: '1040', at: '2026-10-02T05:10:00Z', action: 'payroll.period.locked', entityType: 'pay_period', entityId: 'p9', actor: 'Lakshmi Venkatesan', actorRole: 'Payroll admin', details: { month: '2026-09' } },
  ],
  next: 'cursor-1040',
};
export const SAMPLE_CHAIN_OK: ChainStatus = { canVerify: true, checks: [{ at: '2026-10-28T00:30:00Z', result: 'ok', lastSeq: '1043', rows: '1043', problem: null }] };
export const SAMPLE_CHAIN_BROKEN: ChainStatus = { canVerify: true, checks: [{ at: '2026-10-28T00:30:00Z', result: 'broken', lastSeq: '1043', rows: '1043', problem: 'Row 1017 does not match the hash of row 1016.' }] };
const SHA = 'f3a9c2e17b4d5a8e9f0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a';
export const SAMPLE_DOCUMENTS: PayDocuments = {
  entities: [
    { id: 'le-kfpl', name: KF, canIssue: true },
    { id: 'le-tn', name: KF_TN, canIssue: false },
  ],
  documents: [
    { id: 'd3', kind: 'payslip', kindLabel: 'Payslip', title: 'Payslip, September 2026', referenceNo: 'KF/PS/2026-09/0142', status: 'issued', signature: 'signed', issuedAt: '2026-10-01T10:00:00Z', verifyCode: 'KF7Q2M9XPA', sha256: SHA, month: '2026-09', supersedesId: 'd2', supersededById: null, purged: false, employeeId: 'e-arjun', person: 'Arjun Kulkarni', legalEntityId: 'le-kfpl' },
    { id: 'd2', kind: 'payslip', kindLabel: 'Payslip', title: 'Payslip, September 2026', referenceNo: 'KF/PS/2026-09/0142', status: 'superseded', signature: 'signed', issuedAt: '2026-09-30T10:00:00Z', verifyCode: 'KF3H8R2LWB', sha256: SHA, month: '2026-09', supersedesId: null, supersededById: 'd3', purged: false, employeeId: 'e-arjun', person: 'Arjun Kulkarni', legalEntityId: 'le-kfpl' },
    { id: 'd1', kind: 'form16', kindLabel: 'Form 16', title: 'Form 16, 2025-26', referenceNo: 'KF/F16/2025-26/0177', status: 'awaiting_signature', signature: 'awaiting', issuedAt: '2026-06-14T10:00:00Z', verifyCode: null, sha256: SHA, month: null, supersedesId: null, supersededById: null, purged: false, employeeId: 'e-kavitha', person: 'Kavitha Sundaram', legalEntityId: 'le-tn' },
    { id: 'd0', kind: 'payslip', kindLabel: 'Payslip', title: 'Payslip, March 2018', referenceNo: 'KF/PS/2018-03/0031', status: 'issued', signature: 'signed', issuedAt: '2018-04-01T10:00:00Z', verifyCode: null, sha256: SHA, month: '2018-03', supersedesId: null, supersededById: null, purged: true, employeeId: 'e-ravi', person: 'Ravi Shankar', legalEntityId: 'le-kfpl' },
  ],
};
export const SAMPLE_PEOPLE: PersonHit[] = [
  { id: 'e-arjun', name: 'Arjun Kulkarni', employeeCode: 'KF-0142' },
  { id: 'e-kavitha', name: 'Kavitha Sundaram', employeeCode: 'KF-0177' },
];
