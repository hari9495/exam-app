// The live app's EXP-04 Trip (list, request sheet, record) and EXP-05 Advance (list, request sheet, card with its
// balance ledger): the designed screens with real data (expenses round 1). The design's parts are reused (OpsDesk,
// PageHeader, ObjectHeader, StatusTrail, Workspace, Facts, the settlement card, the ledger table, the request sheets);
// what the real record needs is added (who sees what, bookings, the approver's and finance's actions, refusals).
import { useState } from 'react';
import { ArrowLeft, Plane, Plus, Send, Trash2, X } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { ErrorSummary, FieldRow, FormField, useSaveErrors, useTooEarly } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { DataTable, type TableColumn } from '../../components/table';
import { Card, ObjectHeader, PageHeader } from '../../components/shell';
import { BottomSheet, ConfirmDialog } from '../../components/overlay';
import { FileUpload } from '../../components/upload';
import { Segment } from '../../components/segment';
import { useNarrow } from '../../components/stepper';
import { formatDate } from '../../lib/format';
import { dayKey } from '../../lib/dates';
import { errorText } from '../org/org-kit';
import { useAct } from '../growth/perf-live';
import { Actions, Facts, OpsDesk, StatusTrail, Workspace, type TrailStep } from './ops-kit';
import { ReasonDialog } from './expenses-live';
import { ADVANCE_STATUS, STATUS, TRIP_STATUS, day, money, moneyInput, paise, type LoadState } from './expenses-live-data';
import type { AdvanceDetail, AdvanceSummary, BookingInput, TravelMode, TripDetail, TripInput, TripSummary } from '../expenses/live/types';

const MODES: { value: TravelMode; label: string }[] = [
  { value: 'air', label: 'Air' },
  { value: 'rail', label: 'Rail' },
  { value: 'road', label: 'Road' },
  { value: 'other', label: 'Other' },
];
const BOOKING_KINDS = [
  { value: 'ticket', label: 'Ticket' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'cab', label: 'Cab' },
  { value: 'visa', label: 'Visa' },
  { value: 'other', label: 'Other' },
];

function Busy({ what, phone, title }: { what: string; phone: boolean; title: string }) {
  const inner = (
    <div className="yx-ops-stack" role="status" aria-busy="true" aria-label={`Loading ${what}`}>
      <Skeleton height={96} />
      <Skeleton height={240} />
    </div>
  );
  return phone ? <PhoneFrame tab="pay" title={title}>{inner}</PhoneFrame> : <>{inner}</>;
}
function NotReady({ state, onRetry, what, title, active, phone }: { state: LoadState; onRetry: () => void; what: string; title: string; active: string; phone: boolean }) {
  const inner = state === 'loading' ? <Busy what={what} phone={false} title={title} /> : state === 'no-access' ? <NoAccessState what={what} grantedBy="HR or finance" /> : <ErrorState title={`We couldn't load ${what}.`} description="It may have been removed, or the connection dropped. Nothing has changed." onRetry={onRetry} />;
  if (phone) return <PhoneFrame tab="pay" title={title}>{inner}</PhoneFrame>;
  return (
    <OpsDesk area="expenses" active={active}>
      <PageHeader title={title} />
      {inner}
    </OpsDesk>
  );
}

/* ================================================================== EXP-04 · Trips (live) */

export interface LiveTrips {
  view: 'list';
  state: LoadState;
  onRetry: () => void;
  mine: TripSummary[] | null;
  approvals: TripSummary[] | null;
  /** The travel desk's list to book (travel.booking.manage), else null. */
  desk: TripSummary[] | null;
  today: string;
  /** Opens the request sheet at once (the home's "Request a trip"). */
  startRequest?: boolean;
  onRequest: (input: TripInput) => Promise<unknown>;
  onOpen: (id: string) => void;
}

export interface LiveTrip {
  view: 'record';
  state: LoadState;
  onRetry: () => void;
  trip: TripDetail | null;
  today: string;
  onBack: () => void;
  onSubmit: () => Promise<unknown>;
  onCancel: () => Promise<unknown>;
  onDecide: (taskId: string, decision: 'approve' | 'reject', reason: string) => Promise<unknown>;
  onAddBooking: (input: BookingInput) => Promise<unknown>;
  onPartnerBook: (legSeq: number) => Promise<unknown>;
  onRemoveBooking: (bookingId: string) => Promise<unknown>;
  onOpenBooking: (bookingId: string) => Promise<unknown>;
  onNewClaim: () => Promise<unknown>;
  onOpenClaim: (id: string) => void;
  onOpenAdvance: (id: string) => void;
  onClose?: (reason: string) => Promise<unknown>;
}

type LegDraft = { key: number; from: string; to: string; on: Date | null; mode: TravelMode | null; nights: number | null };

/** The design's request sheet (TripRequestForm) with the real fields and checks. */
function TripRequestSheet({ phone, today, onClose, onSave }: { phone: boolean; today: string; onClose: () => void; onSave: (x: TripInput) => Promise<unknown> }) {
  const [purpose, setPurpose] = useState('');
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [legs, setLegs] = useState<LegDraft[]>([{ key: 1, from: '', to: '', on: null, mode: 'air', nights: 0 }]);
  const [estimate, setEstimate] = useState('');
  const [advance, setAdvance] = useState('');
  const [forexCur, setForexCur] = useState('');
  const [who, setWho] = useState<'self' | 'desk'>('self');
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useAct();
  const set = (key: number, patch: Partial<LegDraft>) => setLegs((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const fk = from ? dayKey(from) : null;
  const tk = to ? dayKey(to) : null;
  const errors = [
    ...(purpose.trim().length >= 3 ? [] : [{ fieldId: 'tr-purpose', message: 'Say what the trip is for, in at least 3 characters.' }]),
    ...(fk && tk ? (tk < fk ? [{ fieldId: 'tr-to', message: 'The trip cannot end before it starts.' }] : []) : [{ fieldId: fk ? 'tr-to' : 'tr-from', message: 'Enter the dates of the trip.' }]),
    ...(legs.every((l) => l.from.trim().length >= 2 && l.to.trim().length >= 2 && l.on && l.mode) ? [] : [{ fieldId: `tr-lf-${legs[0]!.key}`, message: 'Each leg needs where from, where to, a date and how.' }]),
    ...(fk && tk && legs.some((l) => l.on && (dayKey(l.on) < fk || dayKey(l.on) > tk)) ? [{ fieldId: `tr-lf-${legs[0]!.key}`, message: 'Every leg is within the trip dates.' }] : []),
    ...(moneyInput(estimate) ? [] : [{ fieldId: 'tr-estimate', message: 'Enter the estimated cost, e.g. 20000.' }]),
    ...(advance.trim() === '' || moneyInput(advance) ? [] : [{ fieldId: 'tr-advance', message: 'The advance is an amount, e.g. 10000.' }]),
    ...(!forexCur && moneyInput(estimate) && moneyInput(advance) && paise(advance) > paise(estimate) ? [{ fieldId: 'tr-advance', message: 'The advance cannot be more than the estimate.' }] : []),
    ...(forexCur === '' || /^[A-Z]{3}$/.test(forexCur) ? [] : [{ fieldId: 'tr-advcur', message: 'The currency is a 3-letter code, e.g. USD.' }]),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) {
      v.reveal();
      document.getElementById(errors[0]!.fieldId)?.focus();
      return;
    }
    setSaving(true);
    setFailed(null);
    try {
      await onSave({ purpose: purpose.trim(), fromOn: fk!, toOn: tk!, estimate: estimate.trim(), advanceRequested: advance.trim() || '0', ...(forexCur ? { advanceCurrency: forexCur } : {}), bookingNeeded: who === 'desk', legs: legs.map((l) => ({ fromCity: l.from.trim(), toCity: l.to.trim(), departOn: dayKey(l.on!), mode: l.mode!, stayNights: l.nights ?? 0 })) });
      toast({ tone: 'success', title: 'Trip sent for approval', description: 'Your manager approves it; an approved advance is created with it.' });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const form = (
    <div className="yx-ops-stack">
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && <InlineAlert tone="danger" title="Not sent">{failed}</InlineAlert>}
      <FormField id="tr-purpose" label="Purpose" required error={v.errorOf('tr-purpose')}>
        <TextField value={purpose} onChange={setPurpose} maxLength={300} />
      </FormField>
      <FieldRow>
        <FormField id="tr-from" label="From" required error={v.errorOf('tr-from')}>
          <DatePicker value={from} onChange={setFrom} aria-label="Trip starts" />
        </FormField>
        <FormField id="tr-to" label="To" required error={v.errorOf('tr-to')}>
          <DatePicker value={to} onChange={setTo} min={from ?? undefined} aria-label="Trip ends" />
        </FormField>
      </FieldRow>
      <Card title="Itinerary">
        <div className="yx-ops-stack">
          {legs.map((l, i) => (
            <div key={l.key} className="yx-ops-stack" data-gap="sm">
              <FieldRow>
                <FormField id={`tr-lf-${l.key}`} label={`Leg ${i + 1}: from`} required error={i === 0 ? v.errorOf(`tr-lf-${l.key}`) : undefined}>
                  <TextField value={l.from} onChange={(x) => set(l.key, { from: x })} maxLength={60} />
                </FormField>
                <FormField label="To" required>
                  <TextField value={l.to} onChange={(x) => set(l.key, { to: x })} maxLength={60} />
                </FormField>
              </FieldRow>
              <FieldRow>
                <FormField label="On" required>
                  <DatePicker value={l.on} onChange={(d) => set(l.key, { on: d })} min={from ?? undefined} max={to ?? undefined} aria-label={`Leg ${i + 1} date`} />
                </FormField>
                <FormField label="Mode">
                  <Select aria-label={`Leg ${i + 1} travel mode`} value={l.mode} onChange={(m) => set(l.key, { mode: m as TravelMode })} options={MODES} />
                </FormField>
                <FormField label="Nights there">
                  <NumberField value={l.nights} onChange={(n) => set(l.key, { nights: n })} min={0} max={90} />
                </FormField>
              </FieldRow>
              {legs.length > 1 && (
                <Actions>
                  <Button size="sm" variant="danger" icon={Trash2} onClick={() => setLegs((ls) => ls.filter((x) => x.key !== l.key))}>
                    Remove leg {i + 1}
                  </Button>
                </Actions>
              )}
            </div>
          ))}
          <Actions>
            <Button size="sm" icon={Plus} onClick={() => setLegs((ls) => [...ls, { key: Math.max(...ls.map((l) => l.key)) + 1, from: ls[ls.length - 1]?.to ?? '', to: '', on: null, mode: 'air', nights: 0 }])}>
              Add leg
            </Button>
          </Actions>
        </div>
      </Card>
      <FieldRow>
        <FormField id="tr-estimate" label="Estimated cost" required error={v.errorOf('tr-estimate')} helper="Tickets, hotel and spend together.">
          <TextField value={estimate} onChange={(x) => setEstimate(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={15} />
        </FormField>
        <FormField id="tr-advance" label="Advance needed" optional error={v.errorOf('tr-advance')} helper="Paid before you travel; settled against your claims">
          <TextField value={advance} onChange={(x) => setAdvance(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={15} />
        </FormField>
      </FieldRow>
      <FormField label="Who books tickets and hotel?">
        <Segment label="Who books tickets and hotel" value={who} onChange={setWho} options={[{ value: 'self', label: 'I book and upload them' }, { value: 'desk', label: 'Travel desk books (company paid, not reimbursed)' }]} />
      </FormField>
      <FormField id="tr-advcur" label="Forex card advance" optional error={v.errorOf('tr-advcur')} helper="The currency of the advance, e.g. USD. Settled in that currency against your bills in it.">
        <TextField value={forexCur} onChange={(x) => setForexCur(x.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))} maxLength={3} />
      </FormField>
      <p className="yx-ops-muted">Today is {formatDate(day(today))}. Bookings the company pays for count against the trip and are never paid back to you.</p>
    </div>
  );
  if (phone)
    return (
      <BottomSheet open onOpenChange={(o) => !o && onClose()} title="Request a trip" footer={<Button variant="primary" fullWidth icon={Send} loading={saving} onClick={() => void save()}>Send for approval</Button>}>
        {form}
      </BottomSheet>
    );
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} size="lg" title="Request a trip" subtitle="Your manager approves; an approved advance is created automatically." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={() => void save()}>Send for approval</Button></>}>
      {form}
    </Drawer>
  );
}

export function LiveTripsList({ live }: { live: LiveTrips }) {
  const phone = useNarrow();
  const [tab, setTab] = useState<'mine' | 'approvals' | 'desk'>('mine');
  const [requesting, setRequesting] = useState(Boolean(live.startRequest));
  if (live.state !== 'ready') return <NotReady state={live.state} onRetry={live.onRetry} what="your trips" title="Trips" active="Trips" phone={phone} />;
  const tabs = [{ value: 'mine' as const, label: 'My trips' }, ...(live.approvals?.length ? [{ value: 'approvals' as const, label: `Waiting for me (${live.approvals.length})` }] : []), ...(live.desk ? [{ value: 'desk' as const, label: `To book (${live.desk.length})` }] : [])];
  const rows = (tab === 'mine' ? live.mine : tab === 'approvals' ? live.approvals : live.desk) ?? [];
  const columns: TableColumn<TripSummary>[] = [
    ...(tab === 'mine' ? [] : [{ key: 'person', header: 'Traveller', value: (r: TripSummary) => r.person }]),
    { key: 'purpose', header: 'Trip', value: (r) => r.purpose, width: 260 },
    { key: 'dates', header: 'Dates', value: (r) => r.fromOn, render: (r) => `${formatDate(day(r.fromOn))} to ${formatDate(day(r.toOn))}`, width: 230 },
    { key: 'est', header: 'Estimate', value: (r) => paise(r.estimate), render: (r) => money(r.currency, r.estimate) },
    { key: 'status', header: 'Status', value: (r) => r.status, render: (r) => <Badge tone={TRIP_STATUS[r.status].tone}>{TRIP_STATUS[r.status].label}</Badge> },
  ];
  const list = (
    <>
      {tabs.length > 1 && <Segment label="Show" value={tab} onChange={setTab} options={tabs} />}
      <DataTable
        label="Trips"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        rowNoun={['trip', 'trips']}
        cardSummary
        empty={<EmptyState compact title={tab === 'mine' ? 'No trips yet.' : 'Nothing waiting.'} description={tab === 'mine' ? 'Request a trip before you travel.' : undefined} />}
        rowButtons={(r) => <Button size="sm" onClick={() => live.onOpen(r.id)}>Open</Button>}
      />
      {requesting && <TripRequestSheet phone={phone} today={live.today} onClose={() => setRequesting(false)} onSave={live.onRequest} />}
    </>
  );
  if (phone)
    return (
      <PhoneFrame tab="pay" title="Trips">
        <Button variant="primary" icon={Plane} fullWidth onClick={() => setRequesting(true)}>Request a trip</Button>
        {list}
      </PhoneFrame>
    );
  return (
    <OpsDesk area="expenses" active="Trips">
      <PageHeader title="Trips" description="Ask before you travel. An approved trip gets its advance, and its bookings and claims stay together." actions={<Button variant="primary" icon={Plane} onClick={() => setRequesting(true)}>Request a trip</Button>} />
      {list}
    </OpsDesk>
  );
}

/** The design's trip timeline, from the record: requested, approved, advance paid, travelled, claim submitted, settled. */
export function tripTrail(t: TripDetail, today: string): { steps: TrailStep[]; current: number; failed: boolean } {
  const done = [
    t.status !== 'draft',
    ['approved', 'closed'].includes(t.status),
    paise(t.advance?.amount ?? '0') === 0 ? ['approved', 'closed'].includes(t.status) : Boolean(t.advance?.paidOn),
    t.toOn < today && ['approved', 'closed'].includes(t.status),
    t.claims.some((c) => c.status !== 'draft' && c.status !== 'withdrawn'),
    t.status === 'closed',
  ];
  const steps: TrailStep[] = [
    { label: 'Requested' },
    { label: t.status === 'rejected' ? 'Rejected' : t.status === 'cancelled' ? 'Cancelled' : 'Approved' },
    { label: 'Advance paid', ...(t.advance?.paidOn ? { at: day(t.advance.paidOn) } : {}) },
    { label: 'Travelled', ...(t.toOn < today ? { at: day(t.toOn) } : {}) },
    { label: 'Claim submitted' },
    { label: 'Settled', ...(t.closedAt ? { at: day(t.closedAt) } : {}) },
  ];
  const current = done.findIndex((d) => !d);
  return { steps, current: current < 0 ? steps.length : current, failed: t.status === 'rejected' || t.status === 'cancelled' };
}

function BookingSheet({ currency, onClose, onSave }: { currency: string; onClose: () => void; onSave: (x: BookingInput) => Promise<unknown> }) {
  const [kind, setKind] = useState<string | null>('ticket');
  const [title, setTitle] = useState('');
  const [amt, setAmt] = useState('');
  const [paidBy, setPaidBy] = useState<'company' | 'employee'>('employee');
  const [file, setFile] = useState<File | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useAct();
  const early = useTooEarly([...(title.trim().length >= 2 ? [] : [{ fieldId: 'bk-title', message: 'Say what was booked, e.g. Mumbai to Pune flight.' }]), ...(moneyInput(amt) ? [] : [{ fieldId: 'bk-amount', message: 'Enter the amount, e.g. 5400.' }])]);
  const save = async () => {
    if (early.stop()) return;
    setSaving(true);
    setFailed(null);
    try {
      await onSave({ kind: (kind ?? 'other') as BookingInput['kind'], title: title.trim(), amount: amt.trim(), paidBy, file });
      toast({ tone: 'success', title: 'Booking added' });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} size="md" title="Add a booking" notice={failed ? <InlineAlert tone="danger" title="Not added">{failed}</InlineAlert> : undefined} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={() => void save()}>Add booking</Button></>}>
      <div className="yx-ops-stack">
        <FormField label="Kind">
          <Select aria-label="Kind of booking" value={kind} onChange={setKind} options={BOOKING_KINDS} />
        </FormField>
        <FormField id="bk-title" label="What was booked" required error={early.errorOf('bk-title')}>
          <TextField value={title} onChange={setTitle} maxLength={150} />
        </FormField>
        <FormField id="bk-amount" label={`Amount (${currency})`} required error={early.errorOf('bk-amount')}>
          <TextField value={amt} onChange={(x) => setAmt(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={15} />
        </FormField>
        <FormField label="Who paid">
          <Segment label="Who paid for the booking" value={paidBy} onChange={setPaidBy} options={[{ value: 'employee', label: 'I paid (I will claim it)' }, { value: 'company', label: 'The company paid' }]} />
        </FormField>
        <FormField label="Ticket or booking" optional helper="PDF, JPEG or PNG, up to 10 MB. Checked for viruses before anyone opens it.">
          <FileUpload accept={['.pdf', '.jpg', '.jpeg', '.png']} multiple={false} upload={async (f) => setFile(f)} onItemsChange={(items) => setFile(items.find((i) => i.status === 'done')?.file ?? null)} />
        </FormField>
      </div>
    </Drawer>
  );
}

export function LiveTripRecord({ live }: { live: LiveTrip }) {
  const phone = useNarrow();
  const t = live.trip;
  const { busy, act, toast } = useAct();
  const [booking, setBooking] = useState(false);
  const [dialog, setDialog] = useState<'reject' | 'cancel' | 'close' | null>(null);
  if (live.state !== 'ready' || !t) return <NotReady state={live.state} onRetry={live.onRetry} what="this trip" title="Trip" active="Trips" phone={phone} />;
  const trail = tripTrail(t, live.today);
  const adv = t.advance;
  const b = t.budget;
  const spent = b ? b.claimed : '0';
  const open = adv && adv.status === 'paid' ? adv.balance : null;
  const settlementCard = b ? (
    <Card title="Settlement">
      <Facts
        items={[
          { label: 'Advance', value: adv ? money(adv.currency, adv.amount ?? adv.requested) : money(t.currency, '0') },
          { label: 'Spent (claims)', value: money(t.currency, spent) },
          { label: 'Company paid bookings', value: money(t.currency, b.companyPaid) },
          open && paise(open) > 0 ? { label: 'You return', value: money(adv!.currency, open), tone: 'warning' as const } : { label: 'Left of the estimate', value: money(t.currency, b.left), tone: paise(b.left) < 0 ? ('danger' as const) : ('success' as const) },
        ]}
      />
      {open && paise(open) > 0 && t.status !== 'closed' && (
        <InlineAlert tone={adv!.overdue ? 'danger' : 'warning'} actions={<Button size="sm" onClick={() => live.onOpenAdvance(adv!.id)}>Open the advance</Button>}>
          Claim your trip spend, or return {money(adv!.currency, open)} by bank transfer{adv!.settleBy ? ` by ${formatDate(day(adv!.settleBy))}` : ''}. After that it is recovered from salary.
        </InlineAlert>
      )}
      {t.status === 'closed' && <InlineAlert tone="info">Settled{t.closedAt ? ` on ${formatDate(day(t.closedAt))}` : ''}.{t.closeReason ? ` ${t.closeReason}` : ''}</InlineAlert>}
    </Card>
  ) : (
    <Card title="Settlement">
      <p className="yx-ops-muted">The travel desk books the trip; the money is for the traveller and finance.</p>
    </Card>
  );
  const body = (
    <>
      {t.decisionNote && t.status === 'rejected' && <InlineAlert tone="danger" title="Approver's note">{t.decisionNote}</InlineAlert>}
      <StatusTrail steps={trail.steps} current={trail.current} failed={trail.failed} label="Trip timeline" />
      <Card title="Itinerary and bookings" actions={t.can.book ? <Button size="sm" icon={Plus} onClick={() => setBooking(true)}>Add a booking</Button> : undefined}>
        <div className="yx-ops-stack">
          <DataTable
            label="Itinerary"
            columns={[
              { key: 'd', header: 'Date', type: 'date', value: (l: TripDetail['legs'][number]) => day(l.departOn) },
              { key: 'r', header: 'Route', value: (l) => `${l.fromCity} → ${l.toCity}` },
              { key: 'm', header: 'Mode', value: (l) => MODES.find((m) => m.value === l.mode)?.label ?? l.mode },
              { key: 'n', header: 'Nights', value: (l) => l.stayNights },
            ]}
            rows={t.legs}
            getRowId={(l) => String(l.seq)}
            rowButtons={t.can.partner && t.status === 'approved' ? (l) => <Button size="sm" loading={busy === `pb-${l.seq}`} onClick={() => void act(`pb-${l.seq}`, () => live.onPartnerBook(l.seq), 'Booked through the travel partner')}>Book through partner</Button> : undefined}
          />
          <DataTable
            label="Bookings"
            columns={[
              { key: 't', header: 'Booking', value: (x: TripDetail['bookings'][number]) => x.title, width: 260 },
              { key: 'k', header: 'Kind', value: (x) => BOOKING_KINDS.find((k) => k.value === x.kind)?.label ?? x.kind },
              ...(b ? [{ key: 'a', header: 'Amount', value: (x: TripDetail['bookings'][number]) => paise(x.amount), render: (x: TripDetail['bookings'][number]) => money(t.currency, x.amount) }] : []),
              { key: 'p', header: 'Paid by', value: (x) => x.paidBy, render: (x) => <Badge tone={x.paidBy === 'company' ? 'info' : 'neutral'}>{x.paidBy === 'company' ? 'Company paid, not reimbursed' : 'Uploaded by employee'}</Badge> },
            ]}
            rows={t.bookings}
            getRowId={(x) => x.id}
            rowNoun={['booking', 'bookings']}
            empty={<EmptyState compact title="No bookings yet." description={t.bookingNeeded ? 'The travel desk adds them once the trip is approved.' : 'Upload your tickets and hotel bookings here.'} />}
            rowButtons={(x) => (
              <>
                {x.hasFile && <Button size="sm" loading={busy === `ob-${x.id}`} onClick={() => void act(`ob-${x.id}`, () => live.onOpenBooking(x.id))}>View</Button>}
                {t.can.book && <Button size="sm" variant="danger" loading={busy === `rb-${x.id}`} onClick={() => void act(`rb-${x.id}`, () => live.onRemoveBooking(x.id), 'Booking removed')}>Remove</Button>}
              </>
            )}
          />
        </div>
      </Card>
      {b && (
        <Card title="Claims on this trip">
          {t.claims.length === 0 ? (
            <p className="yx-ops-muted">No claims yet.</p>
          ) : (
            <ul className="yx-ops-stack yx-ops-plain" data-gap="sm">
              {t.claims.map((x) => (
                <li key={x.id} className="yx-ops-tile__row">
                  <span className="yx-ops-p">
                    {x.title} · {money(t.currency, x.approvedTotal ?? x.claimedTotal)} <Badge tone={STATUS[x.status].tone}>{STATUS[x.status].label}</Badge>
                  </span>
                  <Button size="sm" onClick={() => live.onOpenClaim(x.id)}>Open</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
  const overlays = (
    <>
      {booking && <BookingSheet currency={t.currency} onClose={() => setBooking(false)} onSave={live.onAddBooking} />}
      {dialog === 'reject' && <ReasonDialog title="Reject this trip?" consequence="The trip closes and the traveller sees your reason." label="Why not" confirm="Reject trip" destructive onClose={() => setDialog(null)} onConfirm={async (r) => (await live.onDecide(t.can.decide!, 'reject', r), toast({ tone: 'success', title: 'Trip rejected' }))} />}
      {dialog === 'close' && live.onClose && <ReasonDialog title="Close this trip?" consequence="No more bookings or claims can be added. An advance still open keeps its own follow-up." label="Why" confirm="Close the trip" onClose={() => setDialog(null)} onConfirm={async (r) => (await live.onClose!(r), toast({ tone: 'success', title: 'Trip closed' }))} />}
      {dialog === 'cancel' && (
        <ConfirmDialog open onOpenChange={(o) => !o && setDialog(null)} size="sm" title="Cancel this trip?" consequence="Its approval request and unpaid advance are cancelled. The trip stays on record." confirmLabel="Cancel the trip" destructive onConfirm={async () => {
          await live.onCancel();
          toast({ tone: 'success', title: 'Trip cancelled' });
        }} />
      )}
    </>
  );
  const actions = (
    <>
      {t.can.decide && (
        <>
          <Button icon={X} onClick={() => setDialog('reject')}>Reject</Button>
          <Button variant="primary" loading={busy === 'approve'} onClick={() => void act('approve', () => live.onDecide(t.can.decide!, 'approve', ''), 'Trip approved')}>Approve</Button>
        </>
      )}
      {t.can.submit && <Button variant="primary" icon={Send} loading={busy === 'submit'} onClick={() => void act('submit', live.onSubmit, 'Trip sent for approval')}>Send for approval</Button>}
      {t.can.claim && <Button variant="primary" loading={busy === 'claim'} onClick={() => void act('claim', live.onNewClaim)}>Add claim to this trip</Button>}
      {t.can.cancel && <Button onClick={() => setDialog('cancel')}>Cancel the trip</Button>}
      {t.can.close && live.onClose && <Button onClick={() => setDialog('close')}>Close the trip</Button>}
    </>
  );
  if (phone)
    return (
      <PhoneFrame tab="pay" title={t.purpose} back={<IconButton icon={ArrowLeft} label="Back to trips" onClick={live.onBack} />}>
        {settlementCard}
        {body}
        <div className="yx-ops-stack" data-gap="sm">{actions}</div>
        {overlays}
      </PhoneFrame>
    );
  return (
    <OpsDesk area="expenses" active="Trips">
      <ObjectHeader
        name={t.purpose}
        icon={Plane}
        secondary={<span>{t.person} · {formatDate(day(t.fromOn))} to {formatDate(day(t.toOn))}</span>}
        status={<Badge tone={TRIP_STATUS[t.status].tone}>{TRIP_STATUS[t.status].label}</Badge>}
        facts={b ? [{ label: 'Estimate', value: money(t.currency, b.estimate) }, { label: 'Advance', value: adv ? money(adv.currency, adv.amount ?? adv.requested) : money(t.currency, t.advanceRequested) }] : undefined}
        actions={actions}
      />
      <Workspace main={body} rail={settlementCard} />
      {overlays}
    </OpsDesk>
  );
}

/* ================================================================== EXP-05 · Advances (live) */

export interface LiveAdvances {
  view: 'list';
  state: LoadState;
  onRetry: () => void;
  mine: AdvanceSummary[] | null;
  approvals: AdvanceSummary[] | null;
  /** Finance's list to pay and settle (expense.payout.manage), else null. */
  payout: AdvanceSummary[] | null;
  onRequest: (purpose: string, amount: string) => Promise<unknown>;
  onRequestTrip: () => void;
  onOpen: (id: string) => void;
}

export interface LiveAdvance {
  view: 'record';
  state: LoadState;
  onRetry: () => void;
  advance: AdvanceDetail | null;
  today: string;
  onBack: () => void;
  onChangeAmount: (amount: string, reason: string) => Promise<unknown>;
  onDecide: (taskId: string, decision: 'approve' | 'reject', reason: string) => Promise<unknown>;
  onPay: (paidOn: string, ref: string, fxRate?: string) => Promise<unknown>;
  onReturn: (amount: string, on: string, ref: string, fxRate?: string) => Promise<unknown>;
  onNewClaim: () => Promise<unknown>;
  onOpenTrip: (id: string) => void;
  onOpenClaim: (id: string) => void;
}

/** The design's request sheet: a standing imprest here; a trip's advance is asked on the trip request. */
function AdvanceRequestSheet({ phone, onClose, onSave, onRequestTrip }: { phone: boolean; onClose: () => void; onSave: (purpose: string, amount: string) => Promise<unknown>; onRequestTrip: () => void }) {
  const [type, setType] = useState('imprest');
  const [amt, setAmt] = useState('');
  const [purpose, setPurpose] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useAct();
  const early = useTooEarly([...(moneyInput(amt) && paise(amt) > 0 ? [] : [{ fieldId: 'ad-amount', message: 'Enter an amount above 0, e.g. 15000.' }]), ...(purpose.trim().length >= 3 ? [] : [{ fieldId: 'ad-purpose', message: 'Say what it is for, in at least 3 characters.' }])]);
  const save = async () => {
    if (type === 'trip') return onRequestTrip();
    if (early.stop()) return;
    setSaving(true);
    setFailed(null);
    try {
      await onSave(purpose.trim(), amt.trim());
      toast({ tone: 'success', title: 'Advance sent for approval' });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const form = (
    <div className="yx-ops-stack">
      {failed && <InlineAlert tone="danger" title="Not sent">{failed}</InlineAlert>}
      <FormField label="Type">
        <RadioGroup value={type} onChange={setType} options={[{ value: 'trip', label: 'For a trip', description: 'Request it on the trip instead' }, { value: 'imprest', label: 'Standing imprest', description: 'Petty expenses at a site' }]} />
      </FormField>
      {type === 'imprest' ? (
        <>
          <FormField id="ad-amount" label="Amount" required error={early.errorOf('ad-amount')}>
            <TextField value={amt} onChange={(x) => setAmt(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={15} />
          </FormField>
          <FormField id="ad-purpose" label="Purpose" required error={early.errorOf('ad-purpose')}>
            <TextArea value={purpose} onChange={setPurpose} rows={2} maxLength={300} />
          </FormField>
          <p className="yx-ops-muted">Your manager and finance approve it. Settle it with claims or a bank transfer.</p>
        </>
      ) : (
        <p className="yx-ops-muted">A trip&apos;s advance is asked on the trip request, so it is paid and settled with the trip.</p>
      )}
    </div>
  );
  const label = type === 'trip' ? 'Request a trip' : 'Send for approval';
  if (phone)
    return (
      <BottomSheet open onOpenChange={(o) => !o && onClose()} title="Request an advance" footer={<Button variant="primary" fullWidth loading={saving} onClick={() => void save()}>{label}</Button>}>
        {form}
      </BottomSheet>
    );
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title="Request an advance" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={() => void save()}>{label}</Button></>}>
      {form}
    </Drawer>
  );
}

export function LiveAdvancesList({ live }: { live: LiveAdvances }) {
  const phone = useNarrow();
  const [tab, setTab] = useState<'mine' | 'approvals' | 'payout'>('mine');
  const [requesting, setRequesting] = useState(false);
  if (live.state !== 'ready') return <NotReady state={live.state} onRetry={live.onRetry} what="your advances" title="Advances" active="Advances" phone={phone} />;
  const tabs = [{ value: 'mine' as const, label: 'My advances' }, ...(live.approvals?.length ? [{ value: 'approvals' as const, label: `Waiting for me (${live.approvals.length})` }] : []), ...(live.payout ? [{ value: 'payout' as const, label: `Finance (${live.payout.length})` }] : [])];
  const rows = (tab === 'mine' ? live.mine : tab === 'approvals' ? live.approvals : live.payout) ?? [];
  const columns: TableColumn<AdvanceSummary>[] = [
    ...(tab === 'mine' ? [] : [{ key: 'person', header: 'Person', value: (r: AdvanceSummary) => r.person ?? '' }]),
    { key: 'purpose', header: 'Advance', value: (r) => `${r.purpose}${r.kind === 'trip' ? ' (trip)' : ''}`, width: 260 },
    { key: 'amount', header: 'Paid', value: (r) => paise(r.amount ?? r.requested), render: (r) => money(r.currency, r.amount ?? r.requested) },
    { key: 'balance', header: 'Open balance', value: (r) => paise(r.balance), render: (r) => money(r.currency, r.balance) },
    { key: 'by', header: 'Settle by', value: (r) => r.settleBy ?? '', render: (r) => (r.settleBy ? formatDate(day(r.settleBy)) : '—') },
    { key: 'status', header: 'Status', value: (r) => r.status, render: (r) => <span className="yx-ops-row"><Badge tone={ADVANCE_STATUS[r.status].tone}>{ADVANCE_STATUS[r.status].label}</Badge>{r.overdue && <Badge tone="danger">Overdue</Badge>}</span> },
  ];
  const list = (
    <>
      {tabs.length > 1 && <Segment label="Show" value={tab} onChange={setTab} options={tabs} />}
      <DataTable
        label="Advances"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        rowNoun={['advance', 'advances']}
        cardSummary
        empty={<EmptyState compact title={tab === 'mine' ? 'No advances.' : 'Nothing waiting.'} description={tab === 'mine' ? 'For a trip, ask on the trip request. For site expenses, request a standing advance.' : undefined} />}
        rowButtons={(r) => <Button size="sm" onClick={() => live.onOpen(r.id)}>Open</Button>}
      />
      {requesting && <AdvanceRequestSheet phone={phone} onClose={() => setRequesting(false)} onSave={live.onRequest} onRequestTrip={live.onRequestTrip} />}
    </>
  );
  if (phone)
    return (
      <PhoneFrame tab="pay" title="Advances">
        {list}
        <Button variant="primary" fullWidth onClick={() => setRequesting(true)}>Request an advance</Button>
      </PhoneFrame>
    );
  return (
    <OpsDesk area="expenses" active="Advances">
      <PageHeader title="Advances" description="Money paid to you before you spend it. Your claims settle it first; what is left you return." actions={<Button variant="primary" onClick={() => setRequesting(true)}>Request an advance</Button>} />
      {list}
    </OpsDesk>
  );
}

type Money3 = { amount: string; reason: string; on: Date | null; ref: string; rate: string };

export function LiveAdvanceRecord({ live }: { live: LiveAdvance }) {
  const phone = useNarrow();
  const a = live.advance;
  const { busy, act, toast } = useAct();
  const [dialog, setDialog] = useState<'amount' | 'reject' | 'pay' | 'return' | null>(null);
  const [f, setF] = useState<Money3>({ amount: '', reason: '', on: day(live.today), ref: '', rate: '' });
  const set = (p: Partial<Money3>) => setF((x) => ({ ...x, ...p }));
  const forex = Boolean(a && a.payCurrency && a.currency !== a.payCurrency);
  const okDate = f.on !== null && dayKey(f.on) <= live.today;
  const okRate = f.rate === '' || /^\d{1,10}(\.\d{1,8})?$/.test(f.rate);
  const errs =
    dialog === 'amount'
      ? [...(!moneyInput(f.amount) || paise(f.amount) <= 0 ? [{ fieldId: 'ad-new', message: 'Enter an amount above 0.' }] : a && paise(f.amount) > paise(a.requested) ? [{ fieldId: 'ad-new', message: `Enter at most ${money(a.currency, a.requested)}.` }] : []), ...(a && moneyInput(f.amount) && paise(f.amount) < paise(a.requested) && f.reason.trim().length < 3 ? [{ fieldId: 'ad-why', message: 'Enter a reason of at least 3 characters.' }] : [])]
      : dialog === 'pay' || dialog === 'return'
        ? [
            ...(dialog === 'return' && (!moneyInput(f.amount) || paise(f.amount) <= 0) ? [{ fieldId: 'ad-ret', message: 'Enter an amount above 0.' }] : []),
            ...(dialog === 'return' && a && moneyInput(f.amount) && paise(f.amount) > paise(a.balance) ? [{ fieldId: 'ad-ret', message: `Enter at most the open balance, ${money(a.currency, a.balance)}.` }] : []),
            ...(okDate ? [] : [{ fieldId: 'ad-on', message: f.on === null ? 'Choose the date.' : 'Choose a date on or before today.' }]),
            ...(f.ref.trim().length >= 2 ? [] : [{ fieldId: 'ad-ref', message: 'Enter the bank reference.' }]),
            ...(okRate ? [] : [{ fieldId: 'ad-rate', message: 'Enter the rate as a number, e.g. 83.25.' }]),
          ]
        : [];
  const early = useTooEarly(errs);
  if (live.state !== 'ready' || !a) return <NotReady state={live.state} onRetry={live.onRetry} what="this advance" title="Advances" active="Advances" phone={phone} />;
  const openDialog = (d: 'amount' | 'pay' | 'return') => {
    early.reset();
    setF({ amount: d === 'return' ? a.balance : d === 'amount' ? (a.amount ?? a.requested) : '', reason: '', on: day(live.today), ref: '', rate: '' });
    setDialog(d);
  };
  const n = a.policy?.recoveryInstalments;
  const card = (
    <Card title={a.purpose}>
      <div className="yx-ops-stack">
        <span className="yx-ops-row">
          <Badge tone={ADVANCE_STATUS[a.status].tone}>{ADVANCE_STATUS[a.status].label}</Badge>
          {a.overdue && <Badge tone="danger">Overdue</Badge>}
          <span className="yx-ops-muted">{a.person} · {a.kind === 'trip' ? 'For a trip' : 'Standing imprest'}</span>
        </span>
        <Facts
          items={[
            { label: a.paidOn ? 'Paid' : 'Asked for', value: money(a.currency, a.amount ?? a.requested) },
            { label: 'Open balance', value: money(a.currency, a.balance), tone: a.overdue ? 'danger' : undefined },
            { label: 'Settle by', value: a.settleBy ? formatDate(day(a.settleBy)) : '—' },
            ...(a.fxRate ? [{ label: `Loaded at (${a.payCurrency} per ${a.currency})`, value: Number(a.fxRate).toLocaleString('en-IN', { maximumFractionDigits: 4 }) }] : []),
          ]}
        />
        {a.changeReason && <InlineAlert tone="info" title="Approver's reason">{a.changeReason}</InlineAlert>}
        {a.overdue && paise(a.balance) > 0 && (
          <InlineAlert tone="danger" title="Settlement window ended">
            {a.can.recordReturn
              ? `${money(a.currency, a.balance)} is recovered from salary${n ? ` in ${n} ${n === 1 ? 'instalment' : 'instalments'}` : ''} from the next payroll. Protected net pay applies. An open balance at exit goes to full and final settlement.`
              : `Submit claims or return ${money(a.currency, a.balance)}. Otherwise it is recovered from salary${n ? ` in ${n} ${n === 1 ? 'instalment' : 'instalments'}` : ''}.`}
          </InlineAlert>
        )}
        <DataTable
          label="Balance ledger"
          columns={[
            { key: 'd', header: 'Date', type: 'date', value: (l: AdvanceDetail['ledger'][number]) => day(l.on) },
            { key: 't', header: 'What happened', value: (l) => l.text, width: 320 },
            { key: 'a', header: 'Amount', value: (l) => paise(l.amount), render: (l) => (l.kind === 'exchange_difference' ? '—' : money(a.currency, l.amount)) },
            ...(a.fxRate && a.payCurrency ? [{ key: 'p', header: `In ${a.payCurrency}`, value: (l: AdvanceDetail['ledger'][number]) => paise(l.amountPay ?? '0'), render: (l: AdvanceDetail['ledger'][number]) => money(a.payCurrency!, l.amountPay ?? null) }] : []),
          ]}
          rows={a.ledger}
          getRowId={(l) => l.id}
          rowNoun={['entry', 'entries']}
          empty={<EmptyState compact title="Nothing yet." description="The advance shows here once finance pays it." />}
          rowButtons={(l) => (l.claimId ? <Button size="sm" onClick={() => live.onOpenClaim(l.claimId!)}>Open claim</Button> : null)}
        />
      </div>
    </Card>
  );
  const actions = (
    <>
      {a.tripId && <Button icon={Plane} onClick={() => live.onOpenTrip(a.tripId!)}>Open the trip</Button>}
      {a.can.changeAmount && <Button onClick={() => openDialog('amount')}>Approve less</Button>}
      {a.can.decide && (
        <>
          <Button icon={X} onClick={() => setDialog('reject')}>Reject</Button>
          <Button variant="primary" loading={busy === 'approve'} onClick={() => void act('approve', () => live.onDecide(a.can.decide!, 'approve', ''), 'Advance approved')}>Approve</Button>
        </>
      )}
      {a.can.pay && <Button variant="primary" onClick={() => openDialog('pay')}>Record payment</Button>}
      {a.can.recordReturn && <Button onClick={() => openDialog('return')}>Record a return</Button>}
      {a.can.claim && <Button icon={Plus} loading={busy === 'claim'} onClick={() => void act('claim', live.onNewClaim)}>Claim against this advance</Button>}
    </>
  );
  const fields = (
    <div className="yx-ops-stack">
      {dialog === 'amount' && (
        <>
          <FormField id="ad-new" label={`Approve (${a.currency})`} required error={early.errorOf('ad-new')}>
            <TextField value={f.amount} onChange={(x) => set({ amount: x.replace(/[^0-9.]/g, '') })} inputMode="decimal" maxLength={15} />
          </FormField>
          <FormField id="ad-why" label="Reason" required error={early.errorOf('ad-why')} helper="For example: two weeks of site spend is enough">
            <TextArea value={f.reason} onChange={(x) => set({ reason: x })} rows={2} maxLength={300} />
          </FormField>
        </>
      )}
      {(dialog === 'pay' || dialog === 'return') && (
        <>
          {dialog === 'return' && (
            <FormField id="ad-ret" label={`Amount returned (${a.currency})`} required error={early.errorOf('ad-ret')}>
              <TextField value={f.amount} onChange={(x) => set({ amount: x.replace(/[^0-9.]/g, '') })} inputMode="decimal" maxLength={15} />
            </FormField>
          )}
          <FormField id="ad-on" label={dialog === 'pay' ? 'Paid on' : 'Received on'} required error={early.errorOf('ad-on')}>
            <DatePicker value={f.on} onChange={(d) => set({ on: d })} max={day(live.today)} aria-label={dialog === 'pay' ? 'Paid on' : 'Received on'} />
          </FormField>
          <FormField id="ad-ref" label="Bank reference" required error={early.errorOf('ad-ref')} helper="The UTR or transfer reference.">
            <TextField value={f.ref} onChange={(x) => set({ ref: x })} maxLength={80} />
          </FormField>
          {forex && (
            <FormField id="ad-rate" label={`${dialog === 'pay' ? 'Loading rate' : 'Rate it came back at'} (${a.payCurrency} per ${a.currency})`} optional error={early.errorOf('ad-rate')} helper="Leave it empty to use the company rate for that day.">
              <TextField value={f.rate} onChange={(x) => set({ rate: x.replace(/[^0-9.]/g, '') })} inputMode="decimal" maxLength={20} />
            </FormField>
          )}
        </>
      )}
    </div>
  );
  const confirm = async () => {
    if (early.stop()) return false;
    if (dialog === 'amount') await live.onChangeAmount(Number(f.amount).toFixed(2), f.reason.trim());
    if (dialog === 'pay') await live.onPay(dayKey(f.on!), f.ref.trim(), forex && f.rate ? f.rate : undefined);
    if (dialog === 'return') await live.onReturn(moneyInput(f.amount)!, dayKey(f.on!), f.ref.trim(), forex && f.rate ? f.rate : undefined);
    toast({ tone: 'success', title: dialog === 'amount' ? 'Amount saved. Approve the request next.' : dialog === 'pay' ? 'Payment recorded' : 'Return recorded' });
    setDialog(null);
  };
  const overlays = (
    <>
      {dialog === 'reject' && <ReasonDialog title="Reject this advance?" consequence="The request closes and the employee sees your reason." label="Why not" confirm="Reject advance" destructive onClose={() => setDialog(null)} onConfirm={async (r) => (await live.onDecide(a.can.decide!, 'reject', r), toast({ tone: 'success', title: 'Advance rejected' }))} />}
      {(dialog === 'amount' || dialog === 'pay' || dialog === 'return') && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          size="md"
          title={dialog === 'amount' ? 'Approve a lower amount?' : dialog === 'pay' ? `Record payment of ${money(a.currency, a.amount)}?` : 'Record money returned by the employee?'}
          consequence={dialog === 'amount' ? `Asked for ${money(a.currency, a.requested)}. The employee sees the amount you approve and your reason.` : dialog === 'pay' ? (a.kind === 'trip' ? `The employee is told. It is settled within ${a.policy?.settleDays ?? 'the company’s'} days of the trip ending.` : 'The employee is told.') : `Open balance ${money(a.currency, a.balance)}. When it reaches nil the advance is settled.`}
          confirmLabel={dialog === 'amount' ? 'Save amount' : dialog === 'pay' ? 'Record payment' : 'Record return'}
          onConfirm={confirm}
        >
          {fields}
        </ConfirmDialog>
      )}
    </>
  );
  if (phone)
    return (
      <PhoneFrame tab="pay" title="Advances" back={<IconButton icon={ArrowLeft} label="Back to advances" onClick={live.onBack} />}>
        {card}
        <div className="yx-ops-stack" data-gap="sm">{actions}</div>
        {overlays}
      </PhoneFrame>
    );
  return (
    <OpsDesk area="expenses" active="Advances">
      <PageHeader title="Advances" description={a.can.pay || a.can.recordReturn ? 'Advance balances and recoveries. Open balances at exit go to full and final settlement.' : 'Money paid to you before you spend it.'} actions={actions} />
      {card}
      {overlays}
    </OpsDesk>
  );
}
