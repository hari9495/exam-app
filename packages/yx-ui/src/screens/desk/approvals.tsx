import { useEffect, useState } from 'react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { DatePicker } from '../../components/date';
import { Dialog } from '../../components/overlay';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { formatDate } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { DeskPage, when } from './desk-kit';
import type { ApprovalHistory, ApprovalTask, Delegation, PickKind, PickOption } from './esm-types';

/** A request's plain dates (2026-11-22) read as everywhere else: 22 Nov 2026. */
const shown = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(new Date(`${v}T00:00:00`)) : v);
import { LivePicker } from './service-form';
import type { LoadState } from './types';

// Approvals inbox (P03 shared screen, SD-2.05): what waits for me, with only the summary the request type gives
// approvers; approve, or say why not; my history; and "I'm away, someone approves for me" (delegation).

export interface ApprovalsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  tasks: ApprovalTask[];
  history: ApprovalHistory | null;
  delegations: Delegation[];
  timeZone?: string;
  onDecide: (task: ApprovalTask, decision: 'approve' | 'reject', reason: string) => Promise<unknown>;
  onDelegate: (input: { delegateUserId: string; startsOn: string; endsOn: string }) => Promise<unknown>;
  onRevoke: (id: string) => Promise<unknown>;
  /** People search for the delegate (returns user ids). */
  onFindPeople: (q: string) => Promise<PickOption[]>;
  /** The request a notice or email pointed at: scrolled into view and marked. */
  focusRequestId?: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const day = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DECISION: Record<string, { label: string; tone: 'success' | 'danger' | 'neutral' | 'info' }> = {
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Not approved', tone: 'danger' },
  pending: { label: 'Waiting', tone: 'info' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export function ApprovalsScreen(props: ApprovalsScreenProps) {
  const [tab, setTab] = useState('waiting');
  const focus = props.focusRequestId ?? null;
  useEffect(() => {
    if (focus) document.getElementById(`approval-${focus}`)?.scrollIntoView({ block: 'center' });
  }, [focus, props.tasks.length]);
  const [rejecting, setRejecting] = useState<ApprovalTask | null>(null);
  const [reason, setReason] = useState('');
  // Closing the box drops what was typed: the next "Do not approve" starts empty (founder 26 Oct 2026).
  const closeReject = () => {
    setRejecting(null);
    setReason('');
  };
  const [delegate, setDelegate] = useState<string | null>(null);
  const [from, setFrom] = useState<Date | null>(new Date());
  const [to, setTo] = useState<Date | null>(null);
  const { busy, error, run } = useRun();
  const pick = (_kind: PickKind, q: string) => props.onFindPeople(q);
  return (
    <DeskPage title="Approvals" description="Requests that need your decision. You see what the request needs you to know; the rest stays with the team doing the work." state={props.state} onRetry={props.onRetry} what="your approvals">
      <div className="yx-ops-stack">
        {error && (
          <InlineAlert tone="danger" title="That did not work">
            {error}
          </InlineAlert>
        )}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="Approvals">
            <TabsTrigger value="waiting">Waiting for me ({props.tasks.length})</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="away">When I am away</TabsTrigger>
          </TabsList>
          <TabsContent value="waiting">
            {props.tasks.length === 0 ? (
              <EmptyState compact title="Nothing waits for you." description="New requests show here and in your notifications." />
            ) : (
              <ul className="yx-esm-approvals">
                {props.tasks.map((t) => (
                  <li key={t.taskId} id={`approval-${t.requestId}`} data-focused={t.requestId === focus || undefined}>
                    <Card
                      title={t.title}
                      actions={
                        <span className="yx-ops-row">
                          <Badge tone="info">{t.type}</Badge>
                          {t.dueAt && <Badge tone={new Date(t.dueAt) < new Date() ? 'danger' : 'neutral'}>Answer by {when(t.dueAt, props.timeZone)}</Badge>}
                        </span>
                      }
                    >
                      <p className="yx-ops-muted">
                        From {t.requester || t.person}
                        {t.raisedBy ? `, raised by ${t.raisedBy}` : ''} · step {t.step.index} of {t.step.of}: {t.step.name}
                        {t.step.approvers > 1 ? ` (${t.step.need === t.step.approvers ? 'all' : t.step.need} of ${t.step.approvers} approve)` : ''}
                        {t.onBehalfOf ? ` · you answer for ${t.onBehalfOf}` : ''}
                      </p>
                      <dl className="yx-esm-summary">
                        {t.summary.map((s) => (
                          <div key={s.label}>
                            <dt>{s.label}</dt>
                            <dd>{shown(s.value)}</dd>
                          </div>
                        ))}
                      </dl>
                      {t.decideAt ? (
                        <div className="yx-ops-row">
                          <Button asChild variant="primary">
                            <a href={t.decideAt}>Open to decide</a>
                          </Button>
                          <span className="yx-ops-muted">Decided on its own page, with a fresh sign-in check.</span>
                        </div>
                      ) : (
                      <div className="yx-ops-row">
                        <Button variant="approve" disabled={busy === t.taskId} onClick={() => void run(t.taskId, () => props.onDecide(t, 'approve', ''))}>
                          Approve
                        </Button>
                        <Button disabled={busy === t.taskId} onClick={() => setRejecting(t)}>
                          Do not approve
                        </Button>
                      </div>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="history">
            <div className="yx-ops-stack">
              <Card title="My decisions">
                {!props.history?.decided.length ? (
                  <EmptyState compact title="No decisions yet." />
                ) : (
                  <ul className="yx-esm-cart">
                    {props.history.decided.map((d) => (
                      <li key={`${d.requestId}-${d.at}`} className="yx-ops-row">
                        <span className="yx-esm-cart__name">{d.title}</span>
                        <Badge tone={DECISION[d.decision]?.tone ?? 'neutral'}>{DECISION[d.decision]?.label ?? d.decision}</Badge>
                        <span className="yx-ops-muted">{when(d.at, props.timeZone)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="Requests I sent">
                {!props.history?.sent.length ? (
                  <EmptyState compact title="You have not sent any." />
                ) : (
                  <ul className="yx-esm-cart">
                    {props.history.sent.map((r) => (
                      <li key={r.requestId} className="yx-ops-row">
                        <span className="yx-esm-cart__name">{r.title}</span>
                        <Badge tone={DECISION[r.status]?.tone ?? 'neutral'}>{DECISION[r.status]?.label ?? r.status}</Badge>
                        <span className="yx-ops-muted">{when(r.submittedAt, props.timeZone)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </TabsContent>
          <TabsContent value="away">
            <div className="yx-ops-stack">
              <Card title="Someone approves for me">
                <p className="yx-ops-muted">While you are away, the person you choose gets your approvals. They answer for you and the record says so. When your leave is approved in YukthiX HR, this is set for you.</p>
                <FormField label="Who approves for me" required>
                  <LivePicker kind="people" value={delegate} onChange={setDelegate} label="Colleague" onPick={pick} />
                </FormField>
                <div className="yx-ops-row">
                  <FormField label="From" required>
                    <DatePicker value={from} onChange={setFrom} />
                  </FormField>
                  <FormField label="To" required>
                    <DatePicker value={to} onChange={setTo} min={from ?? undefined} />
                  </FormField>
                </div>
                <Button
                  variant="primary"
                  disabled={!delegate || !from || !to || busy === 'delegate'}
                  onClick={() =>
                    void run('delegate', async () => {
                      await props.onDelegate({ delegateUserId: delegate!, startsOn: day(from!), endsOn: day(to!) });
                      setDelegate(null);
                      setTo(null);
                    })
                  }
                >
                  Save
                </Button>
              </Card>
              <Card title="Now and coming up">
                {props.delegations.length === 0 ? (
                  <EmptyState compact title="Nothing set." />
                ) : (
                  <ul className="yx-esm-cart">
                    {props.delegations.map((d) => (
                      <li key={d.id} className="yx-ops-row">
                        <span className="yx-esm-cart__name">{d.mine ? `${d.delegate} approves for you` : `You approve for ${d.person}`}</span>
                        <span className="yx-ops-muted">
                          {d.startsOn} to {d.endsOn}
                          {d.source === 'leave' ? ' · from leave' : ''}
                        </span>
                        {d.mine && (
                          <Button size="sm" onClick={() => void run(`revoke-${d.id}`, () => props.onRevoke(d.id))}>
                            Stop
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <Dialog
        open={Boolean(rejecting)}
        onOpenChange={(o) => !o && closeReject()}
        title="Do not approve this request?"
        description={`${rejecting?.title ?? ''}. Say why. The person who asked sees your reason.`}
        footer={
          <>
            <Button onClick={closeReject}>Cancel</Button>
            <Button
              variant="danger"
              disabled={!reason.trim() || busy === 'reject'}
              onClick={() =>
                void run('reject', async () => {
                  await props.onDecide(rejecting!, 'reject', reason.trim());
                  closeReject();
                })
              }
            >
              Do not approve
            </Button>
          </>
        }
      >
        <FormField label="Reason" required>
          <TextArea value={reason} onChange={setReason} rows={3} maxLength={1000} />
        </FormField>
      </Dialog>
    </DeskPage>
  );
}
