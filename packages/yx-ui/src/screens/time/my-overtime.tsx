// My overtime (M02 Q7, YX-AT-04): days with overtime to claim, and my claims. The live page had no design, so it is
// designed here in the Time style (founder rule), with stories, then made live.
import { useState } from 'react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { useToast } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import { Card, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { LoadingBlock, type ViewState } from './attendance';
import { TimePage } from './time-kit';
import { fmtDuration } from './time-logic';
import type { LoadState, MyOvertime, OtCategory, OtClaim } from './live/types';
import './time.css';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const local = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
/** "Mon 12 Oct" */
const dayText = (iso: string) => { const d = local(iso); return `${WD[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
const CATEGORY: Record<OtCategory, string> = { normal: 'Working day', weekly_off: 'Weekly off', holiday: 'Holiday' };
const STATUS: Record<OtClaim['status'], { label: string; tone: BadgeTone }> = { pending: { label: 'Waiting for approval', tone: 'warning' }, approved: { label: 'Approved', tone: 'success' }, rejected: { label: 'Rejected', tone: 'danger' }, withdrawn: { label: 'Withdrawn', tone: 'neutral' } };
const settled = (c: Pick<OtClaim, 'settle' | 'compOffDays' | 'rate'>) => (c.settle === 'comp_off' ? `Comp-off ${c.compOffDays} ${c.compOffDays === 1 ? 'day' : 'days'}` : `Paid in payroll at ${c.rate}×`);
type OpenDay = MyOvertime['open'][number];

/** Murugan Selvam at the Hosur plant (a factory: overtime is paid at the legal 2×), October 2026. */
const claim = (id: string, on: string, status: OtClaim['status'], extra: Partial<OtClaim> = {}): OtClaim => ({ id, employeeId: 'e1', on, category: 'normal', workedMinutes: 551, scheduledMinutes: 450, eligibleMinutes: 90, payableMinutes: 90, overCapMinutes: 0, rate: 2, settle: 'pay', compOffDays: 0, reason: 'Line 2 changeover ran late', status, overridden: false, overrideReason: null, ...extra });
const SAMPLE: MyOvertime = {
  today: '2026-10-20',
  open: [
    { on: '2026-10-15', category: 'normal', workedMinutes: 551, scheduledMinutes: 450, eligibleMinutes: 90, payableMinutes: 90, overCapMinutes: 0, settle: 'pay', factoriesAct: true, needsApproval: true },
    { on: '2026-10-11', category: 'weekly_off', workedMinutes: 300, scheduledMinutes: 0, eligibleMinutes: 300, payableMinutes: 300, overCapMinutes: 60, settle: 'pay', factoriesAct: true, needsApproval: true },
  ],
  claims: [claim('c1', '2026-10-12', 'pending'), claim('c2', '2026-09-28', 'approved', { reason: 'Stayed on to finish the night cleaning of line 2' })],
};

/** What the live app gives My overtime: the person's open days and claims, and the claim and withdraw calls. */
export interface LiveMyOvertime {
  state: LoadState;
  onRetry?: () => void;
  data: MyOvertime | null;
  onClaim: (input: { on: string; reason: string }) => Promise<unknown>;
  onWithdraw: (id: string) => Promise<unknown>;
}

export interface MyOvertimeScreenProps {
  state?: ViewState;
  /** Story: open the claim drawer on the first open day. */
  claimOpen?: boolean;
  live?: LiveMyOvertime;
}

export function MyOvertimeScreen({ state: storyState = 'ready', claimOpen = false, live }: MyOvertimeScreenProps) {
  const { toast } = useToast();
  const d = live ? live.data : storyState === 'empty' ? { ...SAMPLE, open: [], claims: [] } : SAMPLE;
  const state = live ? live.state : storyState === 'empty' ? 'ready' : storyState;
  const [claiming, setClaiming] = useState<OpenDay | null>(claimOpen ? SAMPLE.open[0] : null);
  const [withdraw, setWithdraw] = useState<OtClaim | null>(null);
  const [busy, setBusy] = useState(false);
  const ok = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ tone: 'success', title: done });
      return true;
    } catch (e) {
      toast({ tone: 'error', title: 'That did not work', description: e instanceof Error ? e.message : 'Try again.' });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const cols: TableColumn<OtClaim>[] = [
    { key: 'on', header: 'Day', width: 150, value: (c) => c.on, render: (c) => <span className="yx-tim-list__main"><span>{dayText(c.on)}</span><span className="yx-tim-muted">{CATEGORY[c.category]}</span></span> },
    { key: 'ot', header: 'Overtime', type: 'number', value: (c) => c.payableMinutes / 60, render: (c) => <span className="yx-tim-list__main"><span>{fmtDuration(c.payableMinutes)}</span>{c.overCapMinutes > 0 && <span className="yx-tim-muted">{fmtDuration(c.overCapMinutes)} over the limit{c.overridden ? ', paid after HR review' : ''}</span>}</span> },
    { key: 'settle', header: 'Settled as', value: (c) => settled(c) },
    { key: 'status', header: 'Status', value: (c) => STATUS[c.status].label, render: (c) => <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge> },
  ];
  if (live?.state === 'no-access') return <NoAccessState grantedBy="HR" what="your overtime" />;
  return (
    <TimePage active="My overtime">
      <PageHeader title="My overtime" description="Overtime counts past the minimum, in steps, within the legal limits. Your manager approves it." />
      {state === 'loading' ? <LoadingBlock rows={6} /> : state === 'error' ? (
        <ErrorState title="Your overtime didn't load" description="Nothing has changed. Try again in a moment." onRetry={live?.onRetry ?? (() => {})} />
      ) : d && (
        <div className="yx-tim-stack">
          <div>
            <Card title="Days you can claim">
              {d.open.length ? (
                <ul className="yx-tim-list" aria-label="Days with overtime">
                  {d.open.map((x) => (
                    <li key={x.on}>
                      <span className="yx-tim-list__main">
                        <strong>{dayText(x.on)} · {fmtDuration(x.payableMinutes)}</strong>
                        <span className="yx-tim-muted">{CATEGORY[x.category]} · worked {fmtDuration(x.workedMinutes)}{x.category === 'normal' ? ` of ${fmtDuration(x.scheduledMinutes)}` : ''}</span>
                        {x.overCapMinutes > 0 && <span className="yx-tim-muted">{fmtDuration(x.overCapMinutes)} more is over the limit and needs HR</span>}
                      </span>
                      <Button size="sm" onClick={() => setClaiming(x)}>Claim overtime</Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact title="Nothing to claim" description="Days with overtime in the last month show here." />
              )}
            </Card>
          </div>
          <div>
            <DataTable
              label="My overtime claims"
              columns={cols}
              rows={d.claims}
              getRowId={(c) => c.id}
              state="ready"
              onRetry={() => {}}
              rowButtons={(c) => (c.status === 'pending' ? <Button size="sm" onClick={() => setWithdraw(c)}>Withdraw</Button> : null)}
              empty={<EmptyState compact title="No claims yet" description="Claim a day with overtime and it shows here with its approval." />}
            />
          </div>
        </div>
      )}
      {claiming && (
        <ClaimDrawer
          day={claiming}
          busy={busy}
          onClose={() => setClaiming(null)}
          onClaim={async (reason) => {
            const day = claiming;
            if (!live) return setClaiming(null);
            if (await ok(() => live.onClaim({ on: day.on, reason }), `Overtime for ${dayText(day.on)} sent for approval`)) setClaiming(null);
          }}
        />
      )}
      <ConfirmDialog
        open={!!withdraw}
        onOpenChange={(o) => !o && setWithdraw(null)}
        title={withdraw ? `Withdraw your overtime claim for ${dayText(withdraw.on)}?` : ''}
        consequence="Your manager no longer sees it. You can claim the day again later."
        confirmLabel="Withdraw claim"
        cancelLabel="Keep claim"
        destructive
        confirmDisabled={busy}
        onConfirm={() => { const c = withdraw!; setWithdraw(null); if (live) void ok(() => live.onWithdraw(c.id), `Overtime claim for ${dayText(c.on)} withdrawn`); }}
      />
    </TimePage>
  );
}

/** The claim: what was worked, what counts, how it is settled, and the reason (Send waits for it, never red while typing). */
function ClaimDrawer({ day, busy, onClose, onClaim }: { day: OpenDay; busy: boolean; onClose: () => void; onClaim: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Claim overtime · ${dayText(day.on)}`}
      subtitle={day.needsApproval ? 'Goes to your manager' : 'Counted without approval'}
      footer={
        <>
          {!reason.trim() && <span className="yx-tim-muted" style={{ width: '100%' }}>Enter what it was for</span>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!reason.trim()} loading={busy} onClick={() => onClaim(reason.trim())}>{day.needsApproval ? 'Send for approval' : 'Claim'}</Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <section className="yx-tim-effect" aria-label="What counts">
          <strong>What counts</strong>
          <dl className="yx-tim-stack">
            <div className="yx-tim-effect__row"><dt>Worked</dt><dd>{fmtDuration(day.workedMinutes)}</dd></div>
            <div className="yx-tim-effect__row"><dt>Expected</dt><dd>{day.category === 'normal' ? fmtDuration(day.scheduledMinutes) : `${CATEGORY[day.category]}: every minute counts`}</dd></div>
            <div className="yx-tim-effect__row"><dt>Overtime</dt><dd>{fmtDuration(day.payableMinutes)}</dd></div>
            <div className="yx-tim-effect__row"><dt>Settled as</dt><dd>{day.settle === 'comp_off' ? 'Comp-off, added to your leave balance when approved' : day.factoriesAct ? 'Paid in payroll at the legal overtime rate (Factories Act)' : 'Paid in payroll'}</dd></div>
          </dl>
          {day.overCapMinutes > 0 && <InlineAlert tone="warning">{fmtDuration(day.overCapMinutes)} more is over the legal limit: HR decides whether it is paid.</InlineAlert>}
        </section>
        <FormField label="What was it for" required>
          <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} placeholder="For example: line changeover ran late" />
        </FormField>
      </div>
    </Drawer>
  );
}
