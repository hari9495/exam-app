import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { Checkbox } from '../../../components/choice';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { TextArea, TextField } from '../../../components/inputs';
import { Dialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePicker } from '../../desk/service-form';
import { LivePage, LeaveStatusBadge, addDays, dateText, daysText, dayText, rangeText } from './kit';
import type { LeaveInput, LeavePlan, MaternityCase, LeaveRequestRow, LoadState, MyLeave, PersonOption } from './types';

// Me › Leave (TIM-17 / 18 / 19 / 23): balances from the ledger (YX-LV-01; unpaid types show "taken this year",
// YX-LV-14), apply with a live summary from the server's own rules (days counted, sandwich, holidays, balance after,
// who else is off), my requests with withdraw and cancel, and the optional holidays to choose.

export interface MyLeaveScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: MyLeave | null;
  onPreview: (input: Omit<LeaveInput, 'reason' | 'delegateUserId' | 'certificate'>) => Promise<LeavePlan>;
  onApply: (input: LeaveInput) => Promise<unknown>;
  onWithdraw: (id: string) => Promise<unknown>;
  onCancel: (id: string, reason: string) => Promise<unknown>;
  onChooseHoliday: (holidayId: string, choose: boolean) => Promise<unknown>;
  onFindPeople: (q: string) => Promise<PersonOption[]>;
  /** Opens the apply sheet at once (a link from Home). */
  startApplying?: boolean;
}

export function MyLeaveScreen(p: MyLeaveScreenProps) {
  const [applying, setApplying] = useState(Boolean(p.startApplying));
  const [cancelling, setCancelling] = useState<LeaveRequestRow | null>(null);
  const [tab, setTab] = useState('requests');
  const d = p.data;
  return (
    <LivePage
      title="My leave"
      description={d ? `Leave year ${dateText(d.year.start)} to ${dateText(d.year.end)}. Each balance is the sum of its credits and debits.` : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="your leave"
      actions={
        <Button variant="primary" onClick={() => setApplying(true)}>
          Apply for leave
        </Button>
      }
    >
      {d && (
        <>
          <section aria-label="Balances" className="yx-tim-cards">
            {/* Unpaid leave shows what was taken; maternity and paternity are per event, so they are only in the apply list. */}
            {d.balances.filter((b) => b.hasBalance || b.kind === 'lop').map((b) => (
              <Card key={b.leaveTypeId} title={b.name} actions={b.paid ? undefined : <Badge tone="neutral">Unpaid</Badge>}>
                {b.hasBalance ? (
                  <>
                    <p className="yx-tim-big">
                      {b.available} <span className="yx-tim-muted">{b.available === 1 ? 'day' : 'days'} available</span>
                    </p>
                    <p className="yx-tim-note">
                      Balance {b.balance}
                      {b.pending ? ` · ${daysText(b.pending)} waiting for approval` : ''}
                      {b.entitlement !== null ? ` · ${b.entitlement} a year` : ''}
                    </p>
                  </>
                ) : (
                  <p className="yx-tim-big">
                    {b.takenThisYear} <span className="yx-tim-muted">{b.takenThisYear === 1 ? 'day' : 'days'} taken this year</span>
                  </p>
                )}
              </Card>
            ))}
            {!d.balances.length && <EmptyState compact title="No leave types yet" description="HR has not given you a leave policy yet." />}
          </section>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Leave">
              <TabsTrigger value="requests">My requests</TabsTrigger>
              <TabsTrigger value="holidays">Holidays</TabsTrigger>
            </TabsList>
            <TabsContent value="requests">
              <Requests rows={d.requests} today={d.today} onWithdraw={p.onWithdraw} onCancel={setCancelling} />
            </TabsContent>
            <TabsContent value="holidays">
              <Holidays data={d} onChoose={p.onChooseHoliday} />
            </TabsContent>
          </Tabs>
          {applying && <ApplyDrawer data={d} onClose={() => setApplying(false)} onPreview={p.onPreview} onApply={p.onApply} onFindPeople={p.onFindPeople} />}
          {cancelling && <CancelDialog row={cancelling} onClose={() => setCancelling(null)} onCancel={p.onCancel} />}
        </>
      )}
    </LivePage>
  );
}

function Requests({ rows, today, onWithdraw, onCancel }: { rows: LeaveRequestRow[]; today: string; onWithdraw: (id: string) => Promise<unknown>; onCancel: (r: LeaveRequestRow) => void }) {
  const { busy, error, run } = useRun();
  if (!rows.length) return <EmptyState compact title="No leave requests yet" description="Requests you send appear here with their approval." />;
  const lastMonthStart = addDays(`${today.slice(0, 7)}-01`, -31);
  return (
    <div className="yx-tim-stack">
      {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
      <table className="yx-tim-table" aria-label="My leave requests">
        <thead>
          <tr>
            <th>Dates</th>
            <th>Leave</th>
            <th>Days</th>
            <th>Status</th>
            <th>
              <span className="yx-visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                {rangeText(r.from, r.to)}
                {r.fromHalf === 'second' ? ' (from the second half)' : ''}
                {r.toHalf === 'first' ? ' (until the first half)' : ''}
              </td>
              <td>
                {r.type?.name ?? ''}
                {r.certificate !== 'none' && <span className="yx-tim-note"> · certificate {r.certificate === 'verified' ? 'verified' : 'to give HR'}</span>}
              </td>
              <td className="yx-tim-num">{r.days}</td>
              <td>
                <LeaveStatusBadge status={r.status} />
              </td>
              <td>
                {r.status === 'pending' && (
                  <Button size="sm" loading={busy === r.id} onClick={() => void run(r.id, () => onWithdraw(r.id))}>
                    Withdraw
                  </Button>
                )}
                {r.status === 'approved' && r.to >= lastMonthStart && (
                  <Button size="sm" onClick={() => onCancel(r)}>
                    Cancel leave
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Holidays({ data, onChoose }: { data: MyLeave; onChoose: (id: string, choose: boolean) => Promise<unknown> }) {
  const { busy, error, run } = useRun();
  const { list, calendar } = data.holidays;
  if (!calendar) return <EmptyState compact title="No holiday calendar yet" description="HR has not set up holidays for your location." />;
  const optional = list.filter((h) => h.kind === 'optional' || h.kind === 'restricted');
  const chosen = optional.filter((h) => h.chosen).length;
  return (
    <div className="yx-tim-stack">
      {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
      <p className="yx-tim-muted">
        {calendar.name}. {optional.length ? `Choose up to ${calendar.optionalLimit} optional holidays (${chosen} chosen).` : ''}
      </p>
      <table className="yx-tim-table" aria-label="Holidays">
        <thead>
          <tr>
            <th>Date</th>
            <th>Holiday</th>
            <th>Kind</th>
            <th>
              <span className="yx-visually-hidden">Choose</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((h) => {
            const optionalDay = h.kind === 'optional' || h.kind === 'restricted';
            return (
              <tr key={h.id}>
                <td>{dayText(h.on)}</td>
                <td>
                  {h.name}
                  {h.halfDay ? ' (half day)' : ''}
                </td>
                <td>{optionalDay ? 'Optional' : h.kind === 'national' ? 'National' : h.kind === 'state' ? 'State' : 'Festival'}</td>
                <td>{optionalDay && h.on >= data.today && <Checkbox label="Take this day" checked={Boolean(h.chosen)} disabled={busy !== null} onChange={(c) => void run(h.id, () => onChoose(h.id, c))} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const MATERNITY_CASES: { value: MaternityCase; label: string }[] = [
  { value: 'birth', label: 'Birth' },
  { value: 'third_child', label: 'Third child or later' },
  { value: 'adoption', label: 'Adoption or surrogacy' },
  { value: 'miscarriage', label: 'Miscarriage' },
  { value: 'tubectomy', label: 'Tubectomy' },
];

function ApplyDrawer({ data, onClose, onPreview, onApply, onFindPeople }: { data: MyLeave; onClose: () => void; onPreview: MyLeaveScreenProps['onPreview']; onApply: MyLeaveScreenProps['onApply']; onFindPeople: MyLeaveScreenProps['onFindPeople'] }) {
  const types = data.balances;
  const [typeId, setTypeId] = useState<string | null>(types[0]?.leaveTypeId ?? null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fromHalf, setFromHalf] = useState<'full' | 'second'>('full');
  const [toHalf, setToHalf] = useState<'full' | 'first'>('full');
  const [reason, setReason] = useState('');
  // Maternity (YX-LV-10): the expected date and the case decide the weeks and the eligibility window.
  const [expectedOn, setExpectedOn] = useState('');
  const [mCase, setMCase] = useState<MaternityCase>('birth');
  const chosen = types.find((t) => t.leaveTypeId === typeId);
  const maternity = chosen?.kind === 'maternity';
  const [delegate, setDelegate] = useState<string | null>(null);
  const [certificate, setCertificate] = useState(false);
  const [plan, setPlan] = useState<LeavePlan | null>(null);
  const { busy, error, run } = useRun();
  const end = to || from;
  const oneDay = from !== '' && end === from;

  // The live summary (TIM-18) comes from the server's own rules once the dates make sense; no error while typing.
  useEffect(() => {
    setPlan(null);
    if (!typeId || !from || !end || end < from) return;
    let live = true;
    const h = setTimeout(() => {
      void onPreview({ leaveTypeId: typeId, from, to: end, fromHalf, toHalf, ...(maternity ? { expectedOn: expectedOn || undefined, maternityCase: mCase } : {}) })
        .then((x) => live && setPlan(x))
        .catch(() => live && setPlan(null));
    }, 300);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [typeId, from, end, fromHalf, toHalf, expectedOn, mCase]); // eslint-disable-line react-hooks/exhaustive-deps

  const errors = useMemo(() => {
    const e: { fieldId: string; message: string }[] = [];
    if (!typeId) e.push({ fieldId: 'lv-type', message: 'Choose the kind of leave.' });
    if (!from) e.push({ fieldId: 'lv-from', message: 'Choose the first day.' });
    if (from && end < from) e.push({ fieldId: 'lv-to', message: 'The last day is before the first day.' });
    if (plan?.certificateNeeded && !certificate) e.push({ fieldId: 'lv-cert', message: `Tick that you will give a certificate to HR.` });
    for (const b of plan?.blocks ?? []) e.push({ fieldId: 'lv-from', message: b });
    return e;
  }, [typeId, from, end, plan, certificate]);
  const saveErrors = useSaveErrors(errors);
  const { errorOf } = saveErrors;

  const send = () => {
    if (errors.length) return saveErrors.reveal();
    void run('apply', async () => {
      await onApply({ leaveTypeId: typeId!, from, to: end, fromHalf, toHalf, reason: reason.trim() || undefined, delegateUserId: delegate ?? undefined, certificate: certificate || undefined, ...(maternity ? { expectedOn: expectedOn || undefined, maternityCase: mCase } : {}) });
      onClose();
    });
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Apply for leave"
      size="lg"
      dirty={Boolean(from || reason)}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'apply'} onClick={send}>
            Send for approval
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={saveErrors.shownErrors} title="Check these before sending" />
        {error && <InlineAlert tone="danger" title="Not sent">{error}</InlineAlert>}
        <FormField id="lv-type" label="Leave" required error={errorOf('lv-type')}>
          <Select value={typeId} onChange={setTypeId} options={types.map((t) => ({ value: t.leaveTypeId, label: t.hasBalance ? `${t.name} (${t.available} available)` : t.name }))} />
        </FormField>
        {maternity && (
          <>
            <FormField id="lv-expected" label="Expected date of delivery (or of the event)" required helper="Eligibility counts the days you worked in the 12 months before it.">
              <TextField type="date" value={expectedOn} onChange={setExpectedOn} />
            </FormField>
            <FormField id="lv-case" label="Kind of maternity leave">
              <Segment label="Kind of maternity leave" value={mCase} onChange={setMCase} options={MATERNITY_CASES} />
            </FormField>
          </>
        )}
        <div className="yx-tim-row">
          <FormField id="lv-from" label="First day" required error={errorOf('lv-from')}>
            <TextField type="date" value={from} min={addDays(data.today, -60)} onChange={(v) => setFrom(v)} />
          </FormField>
          <FormField id="lv-to" label="Last day" helper="Leave empty for one day." error={errorOf('lv-to')}>
            <TextField type="date" value={to} min={from || undefined} onChange={(v) => setTo(v)} />
          </FormField>
        </div>
        {chosen && plan?.type.rules.halfDays !== false && from && (
          <div className="yx-tim-row">
            {oneDay ? (
              <Segment
                label="Part of the day"
                value={fromHalf === 'second' ? 'second' : toHalf === 'first' ? 'first' : 'full'}
                onChange={(v) => {
                  setFromHalf(v === 'second' ? 'second' : 'full');
                  setToHalf(v === 'first' ? 'first' : 'full');
                }}
                options={[{ value: 'full', label: 'Whole day' }, { value: 'first', label: 'First half' }, { value: 'second', label: 'Second half' }]}
              />
            ) : (
              <>
                <div className="yx-tim-stack" data-gap="sm">
                  <span className="yx-tim-note">{dayText(from)}</span>
                  <Segment label={`${dayText(from)}: whole day or second half`} value={fromHalf} onChange={setFromHalf} options={[{ value: 'full', label: 'Whole day' }, { value: 'second', label: 'Second half only' }]} />
                </div>
                {end > from && (
                  <div className="yx-tim-stack" data-gap="sm">
                    <span className="yx-tim-note">{dayText(end)}</span>
                    <Segment label={`${dayText(end)}: whole day or first half`} value={toHalf} onChange={setToHalf} options={[{ value: 'full', label: 'Whole day' }, { value: 'first', label: 'First half only' }]} />
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {plan && (
          <dl className="yx-tim-effect" aria-live="polite">
            <div className="yx-tim-effect__row">
              <dt>Counts as</dt>
              <dd>{daysText(plan.total)}</dd>
            </div>
            {plan.holidaysExcluded > 0 && (
              <div className="yx-tim-effect__row">
                <dt>Holidays and weekly offs left out</dt>
                <dd>{plan.holidaysExcluded}</dd>
              </div>
            )}
            {plan.balanceAfter !== null && (
              <div className="yx-tim-effect__row">
                <dt>Balance after</dt>
                <dd>{plan.balanceAfter}</dd>
              </div>
            )}
            <div className="yx-tim-effect__row">
              <dt>Your team</dt>
              <dd>{plan.othersOff ? `${plan.othersOff} ${plan.othersOff === 1 ? 'other is' : 'others are'} off then` : 'No one else is off then'}</dd>
            </div>
            {plan.warnings.map((w) => (
              <p key={w} className="yx-tim-note">
                {w}
              </p>
            ))}
          </dl>
        )}
        {plan?.certificateNeeded && (
          <FormField id="lv-cert" label="Certificate" error={errorOf('lv-cert')}>
            <Checkbox label="I will give a certificate to HR" description="HR checks it. Your manager sees only whether it is in, never the certificate." checked={certificate} onChange={setCertificate} />
          </FormField>
        )}
        <FormField id="lv-reason" label="Reason" optional helper={plan?.type.rules.medical ? 'Only you and HR can read this.' : 'Your approvers see this.'}>
          <TextArea value={reason} onChange={setReason} rows={3} maxLength={1000} />
        </FormField>
        <FormField id="lv-delegate" label="Approves for me while I am away" optional helper="If you approve requests, they go to this person on your leave days. Otherwise they go to your manager.">
          <LivePicker kind="people" label="Colleague" value={delegate} onChange={setDelegate} onPick={(_k, q) => onFindPeople(q)} />
        </FormField>
      </div>
    </Drawer>
  );
}

function CancelDialog({ row, onClose, onCancel }: { row: LeaveRequestRow; onClose: () => void; onCancel: (id: string, reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const { busy, error, run } = useRun();
  const send = () => {
    setShowErrors(true);
    if (!reason.trim()) return;
    void run('cancel', async () => {
      await onCancel(row.id, reason.trim());
      onClose();
    });
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Cancel ${row.type?.name ?? 'leave'}, ${rangeText(row.from, row.to)}?`}
      description="Your manager approves the cancellation. The days come back to your balance once it is approved."
      footer={
        <>
          <Button onClick={onClose}>Keep the leave</Button>
          <Button variant="primary" loading={busy === 'cancel'} onClick={send}>
            Ask to cancel
          </Button>
        </>
      }
    >
      {error && <InlineAlert tone="danger" title="Not sent">{error}</InlineAlert>}
      <FormField id="lv-cancel-reason" label="Why" required error={showErrors && !reason.trim() ? 'Say why you are cancelling.' : undefined}>
        <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
      </FormField>
    </Dialog>
  );
}
