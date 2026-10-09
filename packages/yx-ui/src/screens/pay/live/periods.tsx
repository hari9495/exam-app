import { useEffect, useState } from 'react';
import { Button } from '../../../components/button';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert, Skeleton } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { TextArea } from '../../../components/inputs';
import { Card } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { IrreversibleSheet } from '../pay-kit';
import type { Confirmation, LoadState, PayPeriods, PeriodHistory, ReopenRequest, Stage } from './types';

// Payroll › Pay periods and Reopen requests (M03 §3.3, P08, PAY-1.02): the stage of every month per legal entity, its
// history and corrections, and the two-approval reopen (maker ≠ checker, a fresh second step, the typed phrase).

export const monthText = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
const STAGE: Record<Stage, { label: string; tone: BadgeTone }> = {
  open: { label: 'Open', tone: 'success' },
  frozen: { label: 'Frozen', tone: 'warning' },
  locked: { label: 'Locked', tone: 'neutral' },
  filed: { label: 'Filed', tone: 'info' },
};
export const StageBadge = ({ stage }: { stage: Stage }) => <Badge tone={STAGE[stage].tone}>{STAGE[stage].label}</Badge>;
const SOURCE: Record<string, string> = {
  late_request: 'Late request',
  hr: 'HR correction',
  device_backfill: 'Device backfill',
};
const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Waiting for approval', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Not approved', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};

// ------------------------------------------------------------------------------------------ pay periods

export interface PayPeriodsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: PayPeriods | null;
  year: string;
  onYear: (year: string) => void;
  onHistory: (periodId: string) => Promise<PeriodHistory>;
  onAskReopen: (legalEntityId: string, month: string, reason: string) => Promise<unknown>;
  onOpenRequests: () => void;
}

export function PayPeriodsScreen(p: PayPeriodsScreenProps) {
  const d = p.data;
  const [asking, setAsking] = useState<{
    entity: { id: string; name: string };
    month: string;
  } | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  return (
    <LivePage
      title="Pay periods"
      description="Each month's stage per legal entity. A locked month never changes: corrections are paid in the next payroll. Reopening needs two other people to approve."
      state={p.state}
      onRetry={p.onRetry}
      what="pay periods"
      grantedBy="your payroll admin"
      actions={
        <div className="yx-tim-row">
          <Button size="sm" onClick={() => p.onYear(String(Number(p.year) - 1))}>
            Previous year
          </Button>
          <Button size="sm" disabled={d ? p.year >= d.today.slice(0, 4) : true} onClick={() => p.onYear(String(Number(p.year) + 1))}>
            Next year
          </Button>
          <Button size="sm" onClick={p.onOpenRequests}>
            Reopen requests
          </Button>
        </div>
      }
    >
      {d && (
        <>
          {d.entities.map((e) => (
            <Card key={e.id} title={`${e.name} · ${d.year}`}>
              <table className="yx-tim-table" aria-label={`${e.name} pay periods`}>
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Stage</th>
                    <th scope="col">Last change</th>
                    <th scope="col">Corrections for the next payroll</th>
                    <th scope="col">
                      <span className="yx-visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...e.months].reverse().map((m) => (
                    <tr key={m.month}>
                      <th scope="row">{monthText(m.month)}</th>
                      <td>
                        <StageBadge stage={m.stage} />
                      </td>
                      <td className="yx-tim-note">{m.changedAt && (m.stage !== 'open' || m.reason) ? `${dateText(m.changedAt.slice(0, 10))}${m.changedBy ? ` by ${m.changedBy}` : ''}${m.reason ? `: ${m.reason}` : ''}` : ''}</td>
                      <td className="yx-tim-note">{m.corrections.pending || m.corrections.approved ? `${m.corrections.approved} approved, ${m.corrections.pending} waiting` : 'None'}</td>
                      <td>
                        <div className="yx-tim-row">
                          {m.periodId && (
                            <Button size="sm" onClick={() => setHistory(m.periodId)}>
                              History
                            </Button>
                          )}
                          {m.reopenRequestId ? (
                            <Button size="sm" onClick={p.onOpenRequests}>
                              Reopen asked
                            </Button>
                          ) : m.stage === 'locked' && e.canRequestReopen ? (
                            <Button size="sm" onClick={() => setAsking({ entity: e, month: m.month })}>
                              Ask to reopen
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
          {!d.entities.length && <EmptyState title="No legal entity in your scope" description="Pay periods need payroll.period.view for a legal entity." />}
          {asking && <AskDrawer target={asking} onClose={() => setAsking(null)} onAsk={p.onAskReopen} />}
          {history && <HistoryDrawer periodId={history} onClose={() => setHistory(null)} onHistory={p.onHistory} />}
        </>
      )}
    </LivePage>
  );
}

function AskDrawer({ target, onClose, onAsk }: { target: { entity: { id: string; name: string }; month: string }; onClose: () => void; onAsk: PayPeriodsScreenProps['onAskReopen'] }) {
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const errors =
    reason.trim().length < 10
      ? [
          {
            fieldId: 'ro-why',
            message: 'Say why in a sentence (at least 10 letters).',
          },
        ]
      : [];
  const save = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Ask to reopen ${monthText(target.month)}?`}
      subtitle={target.entity.name}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'ask'}
            onClick={() => {
              if (errors.length) return save.reveal();
              void run('ask', async () => {
                await onAsk(target.entity.id, target.month, reason.trim());
                onClose();
              });
            }}
          >
            Send for approval
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={save.shownErrors} />
        {error && (
          <InlineAlert tone="danger" title="Not sent">
            {error}
          </InlineAlert>
        )}
        <InlineAlert tone="info" title="Two approvals, then the month opens">
          Someone else in payroll checks it first, then Finance or a System Admin gives the final approval. You can't approve your own request. A month whose bank file is released, whose payslips are issued or whose return is filed can't be
          reopened.
        </InlineAlert>
        <FormField id="ro-why" label="Why" required error={save.errorOf('ro-why')}>
          <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
        </FormField>
      </div>
    </Drawer>
  );
}

function HistoryDrawer({ periodId, onClose, onHistory }: { periodId: string; onClose: () => void; onHistory: PayPeriodsScreenProps['onHistory'] }) {
  const [h, setH] = useState<PeriodHistory | null>(null);
  const { busy, error, run } = useRun();
  useEffect(() => {
    void run('load', async () => setH(await onHistory(periodId)));
  }, [periodId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={h ? `${monthText(h.month)}: history` : 'History'} size="lg" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="yx-tim-stack">
        {busy && <Skeleton height={120} />}
        {error && (
          <InlineAlert tone="danger" title="Not loaded">
            {error}
          </InlineAlert>
        )}
        {h && (
          <>
            <section aria-label="Stage changes">
              <h3 className="yx-pay-section-title">Stage changes</h3>
              <ul className="yx-tim-list">
                {h.events.map((e, i) => (
                  <li key={i}>
                    <StageBadge stage={e.to} /> {dateText(e.at.slice(0, 10))}
                    {e.by ? ` by ${e.by}` : ' after two approvals'}
                    {e.reason ? `: ${e.reason}` : ''}
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="Corrections">
              <h3 className="yx-pay-section-title">Corrections</h3>
              {h.corrections.length ? (
                <table className="yx-tim-table" aria-label="Corrections">
                  <thead>
                    <tr>
                      <th scope="col">Person</th>
                      <th scope="col">Day</th>
                      <th scope="col">From</th>
                      <th scope="col">Status</th>
                      <th scope="col">Paid in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.corrections.map((c) => (
                      <tr key={c.id}>
                        <th scope="row">{c.person}</th>
                        <td>{dateText(c.on)}</td>
                        <td>{SOURCE[c.source] ?? c.source}</td>
                        <td>
                          <Badge tone={STATUS[c.status]?.tone ?? 'neutral'}>{STATUS[c.status]?.label ?? c.status}</Badge>
                        </td>
                        <td>{c.paidIn ? monthText(c.paidIn) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="yx-tim-muted">No corrections for this month.</p>
              )}
            </section>
          </>
        )}
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ reopen requests

export interface ReopenRequestsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: ReopenRequest[] | null;
  me: string;
  onDecide: (id: string, decision: 'approve' | 'reject', reason: string | null, confirmation?: Confirmation) => Promise<unknown>;
}

export function ReopenRequestsScreen(p: ReopenRequestsScreenProps) {
  const [approving, setApproving] = useState<ReopenRequest | null>(null);
  const [declining, setDeclining] = useState<ReopenRequest | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { error, run, clearError } = useRun();
  const waiting = (p.data ?? []).filter((r) => r.canDecide);
  return (
    <LivePage
      title="Reopen requests"
      description="Requests to reopen a locked pay month. Two people other than the one who asked must approve, each with a fresh second sign-in step."
      state={p.state}
      onRetry={p.onRetry}
      what="reopen requests"
      grantedBy="your payroll admin"
    >
      {done && (
        <InlineAlert tone="success" title="Done">
          {done}
        </InlineAlert>
      )}
      {p.data && !p.data.length && <EmptyState title="No reopen requests" description="A locked month is reopened only through a request here." />}
      {waiting.length > 0 && <p className="yx-tim-note">{waiting.length === 1 ? '1 request is waiting for you.' : `${waiting.length} requests are waiting for you.`}</p>}
      {(p.data ?? []).map((r) => (
        <Card key={r.id} title={`${monthText(r.month)} · ${r.entity}`} actions={<Badge tone={STATUS[r.status]?.tone ?? 'neutral'}>{STATUS[r.status]?.label ?? r.status}</Badge>}>
          <div className="yx-tim-stack">
            <p>
              <span className="yx-tim-note">
                Asked by {r.requestedBy} on {dateText(r.at.slice(0, 10))}:
              </span>{' '}
              {r.reason}
            </p>
            <ol className="yx-tim-list" aria-label="Approvals">
              {r.steps.map((s, i) => (
                <li key={i}>
                  <strong>
                    {i + 1}. {s.name}
                  </strong>{' '}
                  <Badge tone={s.state === 'approved' ? 'success' : s.state === 'rejected' ? 'danger' : s.state === 'open' ? 'info' : 'neutral'}>
                    {s.state === 'approved' ? 'Approved' : s.state === 'rejected' ? 'Not approved' : s.state === 'open' ? 'Waiting' : 'Not yet'}
                  </Badge>
                  <span className="yx-tim-note"> {s.decidedBy.length ? s.decidedBy.map((x) => `${x.who}${x.reason ? `: ${x.reason}` : ''}`).join(', ') : s.approvers.join(', ')}</span>
                </li>
              ))}
            </ol>
            {r.canDecide && (
              <div className="yx-tim-row">
                <Button variant="approve" onClick={() => setApproving(r)}>
                  Approve
                </Button>
                <Button onClick={() => setDeclining(r)}>Turn down</Button>
              </div>
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
          title={`Approve reopening ${monthText(approving.month)}`}
          subtitle={approving.entity}
          impact={[
            { label: 'Legal entity', value: approving.entity },
            { label: 'Month', value: monthText(approving.month) },
            {
              label: 'Your step',
              value: approving.steps.find((s) => s.state === 'open')?.name ?? '',
            },
            { label: 'Asked by', value: approving.requestedBy },
          ]}
          cannotUndo={
            approving.steps.filter((s) => s.state !== 'approved').length === 1
              ? 'The month opens as soon as you approve: attendance, leave and payroll inputs can change again, and its frozen payroll figures are set aside.'
              : 'Your approval is recorded with what you see here; the month opens after the last approval.'
          }
          correction="If the month should stay closed, turn the request down instead: corrections are paid in the next payroll."
          phrase={approving.phrase ?? ''}
          maker={approving.requestedBy}
          checker={p.me}
          confirmLabel="Approve"
          error={error}
          onConfirm={() =>
            void run('approve', async () => {
              const r = approving;
              await p.onDecide(r.id, 'approve', null, {
                phrase: r.phrase ?? '',
                impact: [
                  { label: 'Legal entity', value: r.entity },
                  { label: 'Month', value: monthText(r.month) },
                ],
              });
              setApproving(null);
              setDone(`You approved reopening ${monthText(r.month)} for ${r.entity}.`);
            })
          }
        />
      )}
      {declining && <DeclineDrawer request={declining} onClose={() => setDeclining(null)} onDecline={(reason) => p.onDecide(declining.id, 'reject', reason)} />}
    </LivePage>
  );
}

function DeclineDrawer({ request, onClose, onDecline }: { request: ReopenRequest; onClose: () => void; onDecline: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const errors =
    reason.trim().length < 5
      ? [
          {
            fieldId: 'rd-why',
            message: 'Say why, so the person who asked knows what to do.',
          },
        ]
      : [];
  const save = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Turn down reopening ${monthText(request.month)}?`}
      subtitle={request.entity}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={busy === 'no'}
            onClick={() => {
              if (errors.length) return save.reveal();
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
      <div className="yx-tim-form">
        <ErrorSummary errors={save.shownErrors} />
        {error && (
          <InlineAlert tone="danger" title="Not saved">
            {error}
          </InlineAlert>
        )}
        <FormField id="rd-why" label="Why" required error={save.errorOf('rd-why')}>
          <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
        </FormField>
      </div>
    </Drawer>
  );
}
