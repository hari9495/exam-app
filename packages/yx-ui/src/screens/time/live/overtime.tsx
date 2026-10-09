import { useState } from 'react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { TextArea } from '../../../components/inputs';
import { Card } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, dayText, duration } from './kit';
import type { LoadState, MyOvertime, OtCategory, OtClaim, OtReview } from './types';

// Overtime (M02 Q7, YX-AT-04): an employee claims the overtime of a worked day (the minimum, the rounding and the
// limits are worked out by the server and shown before sending); the manager approves it in Approvals; comp-off is
// credited to the leave balance. HR sees the month's claims in scope and pays minutes over a limit only with a reason.

const CATEGORY: Record<OtCategory, string> = { normal: 'Working day', weekly_off: 'Weekly off', holiday: 'Holiday' };
const STATUS = { pending: { label: 'Waiting for approval', tone: 'info' }, approved: { label: 'Approved', tone: 'success' }, rejected: { label: 'Not approved', tone: 'danger' }, withdrawn: { label: 'Withdrawn', tone: 'neutral' } } as const;
const settled = (c: Pick<OtClaim, 'settle' | 'compOffDays' | 'rate'>) => (c.settle === 'comp_off' ? `Comp-off ${c.compOffDays} ${c.compOffDays === 1 ? 'day' : 'days'}` : `Paid in payroll at ${c.rate}×`);

export interface MyOvertimeScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: MyOvertime | null;
  onClaim: (input: { on: string; reason: string }) => Promise<unknown>;
  onWithdraw: (id: string) => Promise<unknown>;
}

export function MyOvertimeScreen(p: MyOvertimeScreenProps) {
  const d = p.data;
  const [claiming, setClaiming] = useState<MyOvertime['open'][number] | null>(null);
  const { busy, error, run } = useRun();
  return (
    <LivePage title="My overtime" description="Overtime counts past the minimum, in steps, within the legal limits. Your manager approves it." state={p.state} onRetry={p.onRetry} what="your overtime">
      {d && (
        <>
          {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
          <Card title="Days you can claim">
            {d.open.length ? (
              <ul className="yx-tim-list" aria-label="Days with overtime">
                {d.open.map((x) => (
                  <li key={x.on} className="yx-tim-row">
                    <span className="yx-tim-list__main">
                      <span>
                        {dayText(x.on)} · {CATEGORY[x.category]}
                      </span>
                      <span className="yx-tim-note">
                        Worked {duration(x.workedMinutes)} against {duration(x.scheduledMinutes)} · overtime {duration(x.payableMinutes)}
                        {x.overCapMinutes ? ` (${duration(x.overCapMinutes)} more is over the limit and needs HR)` : ''}
                      </span>
                    </span>
                    <Button size="sm" onClick={() => setClaiming(x)}>
                      Claim overtime
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="yx-tim-muted">No days with overtime to claim in the last month.</p>
            )}
          </Card>
          <Card title="My claims">
            {d.claims.length ? (
              <table className="yx-tim-table" aria-label="My overtime claims">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Overtime</th>
                    <th>Settled as</th>
                    <th>Status</th>
                    <th>
                      <span className="yx-visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.claims.map((c) => (
                    <tr key={c.id}>
                      <td>{dayText(c.on)}</td>
                      <td className="yx-tim-num">
                        {duration(c.payableMinutes)} at {c.rate}×{c.overCapMinutes ? ` · ${duration(c.overCapMinutes)} over the limit${c.overridden ? ', paid after HR review' : ''}` : ''}
                      </td>
                      <td>{settled(c)}</td>
                      <td>
                        <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                      </td>
                      <td>
                        {c.status === 'pending' && (
                          <Button size="sm" loading={busy === c.id} onClick={() => void run(c.id, () => p.onWithdraw(c.id))}>
                            Withdraw
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="yx-tim-muted">No claims yet.</p>
            )}
          </Card>
          {claiming && <ClaimDrawer day={claiming} onClose={() => setClaiming(null)} onClaim={p.onClaim} />}
        </>
      )}
    </LivePage>
  );
}

function ClaimDrawer({ day, onClose, onClaim }: { day: MyOvertime['open'][number]; onClose: () => void; onClaim: MyOvertimeScreenProps['onClaim'] }) {
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const errors = !reason.trim() ? [{ fieldId: 'ot-why', message: 'Say what the extra time was for.' }] : [];
  const saveErrors = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Claim overtime for ${dayText(day.on)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'claim'}
            onClick={() => {
              if (errors.length) return saveErrors.reveal();
              void run('claim', async () => {
                await onClaim({ on: day.on, reason: reason.trim() });
                onClose();
              });
            }}
          >
            {day.needsApproval ? 'Send for approval' : 'Claim'}
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={saveErrors.shownErrors} title="Check this before sending" />
        {error && <InlineAlert tone="danger" title="Not sent">{error}</InlineAlert>}
        <dl className="yx-tim-effect">
          <div className="yx-tim-effect__row">
            <dt>Worked</dt>
            <dd>{duration(day.workedMinutes)}</dd>
          </div>
          <div className="yx-tim-effect__row">
            <dt>Expected</dt>
            <dd>{day.category === 'normal' ? duration(day.scheduledMinutes) : `${CATEGORY[day.category]}: every minute counts`}</dd>
          </div>
          <div className="yx-tim-effect__row">
            <dt>Overtime</dt>
            <dd>{duration(day.payableMinutes)}</dd>
          </div>
          <div className="yx-tim-effect__row">
            <dt>Settled as</dt>
            <dd>{day.settle === 'comp_off' ? 'Comp-off, added to your leave balance when approved' : day.factoriesAct ? 'Paid in payroll at the legal overtime rate (Factories Act)' : 'Paid in payroll'}</dd>
          </div>
        </dl>
        <FormField id="ot-why" label="What was it for" required error={saveErrors.errorOf('ot-why')}>
          <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
        </FormField>
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ team / HR review

export interface OvertimeReviewScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: OtReview | null;
  month: string;
  onMonth: (month: string) => void;
  onOverride: (id: string, reason: string) => Promise<unknown>;
}

const shiftMonth = (month: string, n: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const monthText = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function OvertimeReviewScreen(p: OvertimeReviewScreenProps) {
  const d = p.data;
  const [overriding, setOverriding] = useState<OtClaim | null>(null);
  return (
    <LivePage
      title="Overtime"
      description={d ? `${d.scope === 'team' ? 'Your team' : d.scope === 'company' ? 'Everyone' : 'The people in your scope'} · approve claims in Approvals` : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="overtime"
      actions={
        <div className="yx-tim-row">
          <Button size="sm" onClick={() => p.onMonth(shiftMonth(p.month, -1))}>
            Previous month
          </Button>
          <Button size="sm" onClick={() => p.onMonth(shiftMonth(p.month, 1))}>
            Next month
          </Button>
        </div>
      }
    >
      {d && (
        <Card title={monthText(p.month)}>
          {d.claims.length ? (
            <table className="yx-tim-table" aria-label="Overtime claims">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Day</th>
                  <th>Overtime</th>
                  <th>Settled as</th>
                  <th>Status</th>
                  <th>
                    <span className="yx-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.claims.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>
                      {dayText(c.on)} · {CATEGORY[c.category]}
                    </td>
                    <td className="yx-tim-num">
                      {duration(c.payableMinutes)} at {c.rate}×
                      {c.overCapMinutes ? (
                        <>
                          {' '}
                          <Badge tone={c.overridden ? 'success' : 'warning'}>{c.overridden ? `${duration(c.overCapMinutes)} over the limit, paid` : `${duration(c.overCapMinutes)} over the limit`}</Badge>
                        </>
                      ) : null}
                    </td>
                    <td>{settled(c)}</td>
                    <td>
                      <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                    </td>
                    <td>
                      {c.canOverride && (
                        <Button size="sm" onClick={() => setOverriding(c)}>
                          Pay over the limit
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState compact title="No overtime claims this month" />
          )}
          {overriding && <OverrideDrawer claim={overriding} onClose={() => setOverriding(null)} onOverride={p.onOverride} />}
        </Card>
      )}
    </LivePage>
  );
}

function OverrideDrawer({ claim, onClose, onOverride }: { claim: OtClaim; onClose: () => void; onOverride: OvertimeReviewScreenProps['onOverride'] }) {
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const errors = reason.trim().length < 10 ? [{ fieldId: 'ov-why', message: 'Give the reason in a sentence (at least 10 letters).' }] : [];
  const saveErrors = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Pay ${duration(claim.overCapMinutes)} over the limit for ${claim.name}?`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'ov'}
            onClick={() => {
              if (errors.length) return saveErrors.reveal();
              void run('ov', async () => {
                await onOverride(claim.id, reason.trim());
                onClose();
              });
            }}
          >
            Pay over the limit
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={saveErrors.shownErrors} />
        {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
        <InlineAlert tone="warning" title="This goes past a legal or company limit">
          The reason is kept in the audit log with your name.
        </InlineAlert>
        <FormField id="ov-why" label="Why" required error={saveErrors.errorOf('ov-why')}>
          <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
        </FormField>
      </div>
    </Drawer>
  );
}
