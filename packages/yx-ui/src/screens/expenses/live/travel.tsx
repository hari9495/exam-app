import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../components/button';
import { DatePicker } from '../../../components/date';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { NumberField, TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { errorText, useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { ReasonDialog, STATUS as CLAIM_STATUS, money } from './claims';
import type { AdvanceDetail, AdvanceStatus, AdvanceSummary, BookingInput, LoadState, Route, TripDetail, TripInput, TripStatus, TripSummary, TravelMode } from './types';

// Expenses batch E4, wired (M05-BUILD-DESIGN §5.5, §9.4, §19; EXP-04 trip, EXP-05 advance). A trip request goes to
// the manager (and the travel desk when it is asked to book); its approval creates the advance. Company-paid bookings
// count against the trip, never paid back. The advance card shows its ledger: paid, settled by claims, returned.

const fromKey = (iso: string) => new Date(`${iso}T00:00:00`);
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
export const TRIP_STATUS: Record<TripStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'With approvers', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Not approved', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  closed: { label: 'Closed', tone: 'neutral' },
};
export const ADVANCE_STATUS: Record<AdvanceStatus, { label: string; tone: BadgeTone }> = {
  requested: { label: 'With approvers', tone: 'info' },
  approved: { label: 'Approved, not paid yet', tone: 'warning' },
  rejected: { label: 'Not approved', tone: 'danger' },
  paid: { label: 'Paid', tone: 'success' },
  settled: { label: 'Settled', tone: 'success' },
  to_fnf: { label: 'In full and final settlement', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
const MODES: { value: TravelMode; label: string }[] = [
  { value: 'air', label: 'Air' },
  { value: 'rail', label: 'Rail' },
  { value: 'road', label: 'Road' },
  { value: 'other', label: 'Other' },
];
const KINDS = [
  { value: 'ticket', label: 'Ticket' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'cab', label: 'Cab' },
  { value: 'visa', label: 'Visa' },
  { value: 'other', label: 'Other' },
] as const;

function RouteSteps({ route }: { route: Route }) {
  if (!route) return null;
  return (
    <ul className="yx-lif-list">
      {route.steps.map((s, i) => (
        <li key={`${s.name}-${i}`}>
          <Text>{s.name}</Text> <Badge tone={s.state === 'approved' ? 'success' : s.state === 'rejected' ? 'danger' : s.state === 'open' ? 'info' : 'neutral'}>{s.state === 'open' ? 'Waiting' : s.state === 'approved' ? 'Approved' : s.state === 'rejected' ? 'Not approved' : s.state === 'skipped' ? 'Skipped' : 'Later'}</Badge>
        </li>
      ))}
    </ul>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'success' }) {
  return (
    <Text as="p">
      <Text tone="secondary">{`${label}: `}</Text>
      <Text weight="semibold" tone={tone}>
        {value}
      </Text>
    </Text>
  );
}

// ------------------------------------------------------------------------------------------ trips list + request (EXP-04)

export interface TripsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  mine: TripSummary[] | null;
  approvals: TripSummary[] | null;
  desk: TripSummary[] | null;
  today: string;
  onRequest: (input: TripInput) => Promise<unknown>;
  onOpen: (id: string) => void;
}

export function TripsScreen(p: TripsScreenProps) {
  const [tab, setTab] = useState<'mine' | 'approvals' | 'desk'>('mine');
  const [requesting, setRequesting] = useState(false);
  const rows = (tab === 'mine' ? p.mine : tab === 'approvals' ? p.approvals : p.desk) ?? [];
  const tabs = [{ value: 'mine' as const, label: 'My trips' }, ...(p.approvals?.length ? [{ value: 'approvals' as const, label: `Waiting for me (${p.approvals.length})` }] : []), ...(p.desk ? [{ value: 'desk' as const, label: `To book (${p.desk.length})` }] : [])];
  const columns: TableColumn<TripSummary>[] = [
    ...(tab === 'mine' ? [] : [{ key: 'person', header: 'Person', type: 'person' as const, value: (r: TripSummary) => r.person, person: (r: TripSummary) => ({ name: r.person }), width: 200, hideable: false }]),
    { key: 'purpose', header: 'Trip', value: (r) => r.purpose, width: 260, hideable: tab !== 'mine' },
    { key: 'dates', header: 'Dates', value: (r) => r.fromOn, render: (r) => <Text>{`${dateText(r.fromOn)} to ${dateText(r.toOn)}`}</Text>, width: 230 },
    { key: 'status', header: 'Status', value: (r) => r.status, render: (r) => <Badge tone={TRIP_STATUS[r.status].tone}>{TRIP_STATUS[r.status].label}</Badge>, width: 160 },
  ];
  return (
    <LivePage
      title="Trips"
      description="Ask before you travel. An approved trip gets its advance, and its bookings and claims stay together."
      state={p.state}
      onRetry={p.onRetry}
      what="your trips"
      actions={
        <Button variant="primary" icon={Plus} onClick={() => setRequesting(true)}>
          Request a trip
        </Button>
      }
    >
      {tabs.length > 1 && <Segment label="Show" value={tab} onChange={setTab} options={tabs} />}
      <DataTable
        label="Trips"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        rowNoun={['trip', 'trips']}
        cardSummary
        empty={<EmptyState compact title={tab === 'mine' ? 'No trips yet.' : 'Nothing waiting.'} description={tab === 'mine' ? 'Request a trip before you travel.' : undefined} />}
        rowButtons={(r) => (
          <Button size="sm" onClick={() => p.onOpen(r.id)}>
            Open
          </Button>
        )}
      />
      {requesting && <TripDrawer today={p.today} onClose={() => setRequesting(false)} onSave={p.onRequest} />}
    </LivePage>
  );
}

type LegDraft = { key: number; from: string; to: string; on: Date | null; mode: TravelMode | null; nights: number | null };

function TripDrawer({ today, onClose, onSave }: { today: string; onClose: () => void; onSave: (x: TripInput) => Promise<unknown> }) {
  const [purpose, setPurpose] = useState('');
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [legs, setLegs] = useState<LegDraft[]>([{ key: 1, from: '', to: '', on: null, mode: 'air', nights: 0 }]);
  const [estimate, setEstimate] = useState('');
  const [advance, setAdvance] = useState('');
  const [who, setWho] = useState<'self' | 'desk'>('self');
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: number, patch: Partial<LegDraft>) => setLegs((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const fk = from ? dayKey(from) : null;
  const tk = to ? dayKey(to) : null;
  const errors = [
    ...(purpose.trim().length >= 3 ? [] : [{ fieldId: 'tr-purpose', message: 'Say what the trip is for.' }]),
    ...(fk && tk ? (tk < fk ? [{ fieldId: 'tr-to', message: 'The trip cannot end before it starts.' }] : []) : [{ fieldId: 'tr-from', message: 'Enter the dates of the trip.' }]),
    ...(legs.every((l) => l.from.trim().length >= 2 && l.to.trim().length >= 2 && l.on && l.mode) ? [] : [{ fieldId: 'tr-legs', message: 'Each leg needs where from, where to, a date and how.' }]),
    ...(fk && tk && legs.some((l) => l.on && (dayKey(l.on) < fk || dayKey(l.on) > tk)) ? [{ fieldId: 'tr-legs', message: 'Every leg is within the trip dates.' }] : []),
    ...(MONEY.test(estimate.trim()) ? [] : [{ fieldId: 'tr-estimate', message: 'Enter the estimated cost, e.g. 20000.' }]),
    ...(advance.trim() === '' || MONEY.test(advance.trim()) ? [] : [{ fieldId: 'tr-advance', message: 'The advance is an amount, e.g. 10000.' }]),
    ...(MONEY.test(estimate.trim()) && MONEY.test(advance.trim()) && Number(advance) > Number(estimate) ? [{ fieldId: 'tr-advance', message: 'The advance cannot be more than the estimate.' }] : []),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await onSave({ purpose: purpose.trim(), fromOn: fk!, toOn: tk!, estimate: estimate.trim(), advanceRequested: advance.trim() || '0', bookingNeeded: who === 'desk', legs: legs.map((l) => ({ fromCity: l.from.trim(), toCity: l.to.trim(), departOn: dayKey(l.on!), mode: l.mode!, stayNights: l.nights ?? 0 })) });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title="Request a trip"
      subtitle="Your manager approves it; an approved advance is created with it."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Send for approval
          </Button>
        </>
      }
    >
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && (
        <InlineAlert tone="danger" title="Not sent">
          {failed}
        </InlineAlert>
      )}
      <FormField id="tr-purpose" label="Purpose" required error={v.errorOf('tr-purpose')}>
        <TextField value={purpose} onChange={setPurpose} maxLength={300} />
      </FormField>
      <div className="yx-lif-grid">
        <FormField id="tr-from" label="From" required error={v.errorOf('tr-from')}>
          <DatePicker value={from} onChange={setFrom} aria-label="Trip starts" />
        </FormField>
        <FormField id="tr-to" label="To" required error={v.errorOf('tr-to')}>
          <DatePicker value={to} onChange={setTo} min={from ?? undefined} aria-label="Trip ends" />
        </FormField>
      </div>
      <Card title="Itinerary" actions={<Button size="sm" icon={Plus} onClick={() => setLegs((ls) => [...ls, { key: Math.max(...ls.map((l) => l.key)) + 1, from: ls[ls.length - 1]?.to ?? '', to: '', on: null, mode: 'air', nights: 0 }])}>Add leg</Button>}>
        <div id="tr-legs">
          {v.errorOf('tr-legs') && (
            <Text as="p" tone="danger" size="sm">
              {v.errorOf('tr-legs')}
            </Text>
          )}
          {legs.map((l, i) => (
            <div className="yx-lif-grid" key={l.key}>
              <FormField id={`tr-lf-${l.key}`} label={`Leg ${i + 1}: from`} required>
                <TextField value={l.from} onChange={(x) => set(l.key, { from: x })} maxLength={60} />
              </FormField>
              <FormField id={`tr-lt-${l.key}`} label="To" required>
                <TextField value={l.to} onChange={(x) => set(l.key, { to: x })} maxLength={60} />
              </FormField>
              <FormField id={`tr-ld-${l.key}`} label="On" required>
                <DatePicker value={l.on} onChange={(d) => set(l.key, { on: d })} min={from ?? undefined} max={to ?? undefined} aria-label={`Leg ${i + 1} date`} />
              </FormField>
              <FormField id={`tr-lm-${l.key}`} label="How">
                <Select aria-label={`Leg ${i + 1} travel mode`} value={l.mode} onChange={(m) => set(l.key, { mode: m as TravelMode })} options={MODES} />
              </FormField>
              <FormField id={`tr-ln-${l.key}`} label="Nights there">
                <NumberField value={l.nights} onChange={(n) => set(l.key, { nights: n })} min={0} max={90} />
              </FormField>
              {legs.length > 1 && (
                <Button size="sm" variant="danger" icon={Trash2} onClick={() => setLegs((ls) => ls.filter((x) => x.key !== l.key))}>
                  Remove leg
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
      <div className="yx-lif-grid">
        <FormField id="tr-estimate" label="Estimated cost" required error={v.errorOf('tr-estimate')} helper="Tickets, hotel and spend together.">
          <TextField value={estimate} onChange={(x) => setEstimate(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={15} />
        </FormField>
        <FormField id="tr-advance" label="Advance needed" optional error={v.errorOf('tr-advance')} helper="Paid before you travel; your claims on the trip settle it.">
          <TextField value={advance} onChange={(x) => setAdvance(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={15} />
        </FormField>
      </div>
      <FormField id="tr-who" label="Who books tickets and hotel?">
        <Segment
          label="Who books tickets and hotel"
          value={who}
          onChange={setWho}
          options={[
            { value: 'self', label: 'I book and upload them' },
            { value: 'desk', label: 'The travel desk books' },
          ]}
        />
      </FormField>
      <Text as="p" tone="secondary" size="sm">
        {`Bookings the company pays for count against the trip and are never paid back to you. Today is ${dateText(today)}.`}
      </Text>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ one trip (EXP-04)

export interface TripScreenProps {
  state: LoadState;
  onRetry?: () => void;
  trip: TripDetail | null;
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
}

export function TripScreen(p: TripScreenProps) {
  const t = p.trip;
  const { busy, error, run } = useRun();
  const [booking, setBooking] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const adv = t?.advance ?? null;
  const toReturn = adv && adv.status !== 'settled' && Number(adv.balance) > 0 ? adv.balance : null;
  return (
    <LivePage title={t ? t.purpose : 'Trip'} description={t ? `${t.person} · ${dateText(t.fromOn)} to ${dateText(t.toOn)}` : undefined} state={p.state} onRetry={p.onRetry} what="this trip" actions={<Button onClick={p.onBack}>Back</Button>}>
      {t && (
        <>
          {error && (
            <InlineAlert tone="danger" title="That didn't work">
              {error}
            </InlineAlert>
          )}
          <Card title="Trip">
            <Badge tone={TRIP_STATUS[t.status].tone}>{TRIP_STATUS[t.status].label}</Badge>
            {t.decisionNote && t.status === 'rejected' && (
              <Text as="p" tone="secondary">
                {`Approver's note: ${t.decisionNote}`}
              </Text>
            )}
            <RouteSteps route={t.route} />
          </Card>
          {t.budget && (
            <Card title="Settlement">
              <Fact label="Estimate" value={money(t.currency, t.budget.estimate)} />
              <Fact label="Company-paid bookings (not paid back)" value={money(t.currency, t.budget.companyPaid)} />
              <Fact label="Your claims on this trip" value={money(t.currency, t.budget.claimed)} />
              <Fact label="Left of the estimate" value={money(t.currency, t.budget.left)} tone={Number(t.budget.left) < 0 ? 'danger' : undefined} />
              {adv && (
                <>
                  <Fact label="Advance" value={`${money(t.currency, adv.amount)} · ${ADVANCE_STATUS[adv.status].label}`} />
                  {adv.status === 'paid' && <Fact label="Left on the advance" value={money(t.currency, adv.balance)} tone={adv.overdue ? 'danger' : undefined} />}
                  {adv.status === 'paid' && toReturn && (
                    <InlineAlert tone={adv.overdue ? 'danger' : 'warning'} title={adv.overdue ? 'The time to settle has passed' : 'Settle the advance'}>
                      {`Claim your trip spend, or return ${money(t.currency, toReturn)} by bank${adv.settleBy ? ` by ${dateText(adv.settleBy)}` : ''}. Finance records the return.`}
                    </InlineAlert>
                  )}
                  <Button size="sm" onClick={() => p.onOpenAdvance(adv.id)}>
                    Open the advance
                  </Button>
                </>
              )}
            </Card>
          )}
          <Card title="Itinerary">
            <DataTable
              label="Itinerary"
              columns={[
                { key: 'd', header: 'Date', value: (l: TripDetail['legs'][number]) => l.departOn, render: (l) => <Text>{dateText(l.departOn)}</Text>, width: 140 },
                { key: 'r', header: 'Route', value: (l) => `${l.fromCity} → ${l.toCity}`, width: 240 },
                { key: 'm', header: 'How', value: (l) => MODES.find((m) => m.value === l.mode)?.label ?? l.mode, width: 100 },
                { key: 'n', header: 'Nights', value: (l) => l.stayNights, width: 90 },
              ]}
              rows={t.legs}
              getRowId={(l) => String(l.seq)}
              rowNoun={['leg', 'legs']}
              rowButtons={
                t.can.partner && t.status === 'approved'
                  ? (l) => (
                      <Button size="sm" loading={busy === `pb-${l.seq}`} onClick={() => void run(`pb-${l.seq}`, () => p.onPartnerBook(l.seq))}>
                        Book through partner
                      </Button>
                    )
                  : undefined
              }
            />
          </Card>
          <Card
            title="Bookings"
            actions={
              t.can.book ? (
                <Button size="sm" icon={Plus} onClick={() => setBooking(true)}>
                  Add a booking
                </Button>
              ) : undefined
            }
          >
            <DataTable
              label="Bookings"
              columns={[
                { key: 't', header: 'Booking', value: (b: TripDetail['bookings'][number]) => b.title, width: 240 },
                { key: 'k', header: 'Kind', value: (b) => KINDS.find((k) => k.value === b.kind)?.label ?? b.kind, width: 100 },
                { key: 'a', header: 'Amount', value: (b) => Number(b.amount), render: (b) => <Text>{money(t.currency, b.amount)}</Text>, width: 130 },
                { key: 'p', header: 'Paid by', value: (b) => b.paidBy, render: (b) => <Badge tone={b.paidBy === 'company' ? 'info' : 'neutral'}>{b.paidBy === 'company' ? 'Company (not paid back)' : 'Me (claim it)'}</Badge>, width: 200 },
              ]}
              rows={t.bookings}
              getRowId={(b) => b.id}
              rowNoun={['booking', 'bookings']}
              empty={<EmptyState compact title="No bookings yet." description={t.bookingNeeded ? 'The travel desk adds them once the trip is approved.' : 'Upload your tickets and hotel bookings here.'} />}
              rowButtons={(b) => (
                <>
                  {b.hasFile && (
                    <Button size="sm" loading={busy === `ob-${b.id}`} onClick={() => void run(`ob-${b.id}`, () => p.onOpenBooking(b.id))}>
                      View
                    </Button>
                  )}
                  {t.can.book && (
                    <Button size="sm" variant="danger" loading={busy === `rb-${b.id}`} onClick={() => void run(`rb-${b.id}`, () => p.onRemoveBooking(b.id))}>
                      Remove
                    </Button>
                  )}
                </>
              )}
            />
          </Card>
          {t.budget && (
            <Card
              title="Claims on this trip"
              actions={
                t.can.claim ? (
                  <Button size="sm" icon={Plus} loading={busy === 'claim'} onClick={() => void run('claim', p.onNewClaim)}>
                    Add a claim to this trip
                  </Button>
                ) : undefined
              }
            >
              {t.claims.length === 0 ? (
                <Text as="p" tone="secondary">
                  No claims yet.
                </Text>
              ) : (
                <ul className="yx-lif-list">
                  {t.claims.map((x) => (
                    <li key={x.id}>
                      <Text>{`${x.title} · ${money(t.currency, x.approvedTotal ?? x.claimedTotal)}`}</Text> <Badge tone={CLAIM_STATUS[x.status].tone}>{CLAIM_STATUS[x.status].label}</Badge>
                      {Number(x.advanceAdjusted) > 0 && <Text tone="secondary">{` · ${money(t.currency, x.advanceAdjusted)} from the advance`}</Text>}{' '}
                      <Button size="sm" onClick={() => p.onOpenClaim(x.id)}>
                        Open
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <div className="yx-lif-row">
            {t.can.submit && (
              <Button variant="primary" loading={busy === 'submit'} onClick={() => void run('submit', p.onSubmit)}>
                Send for approval
              </Button>
            )}
            {t.can.decide && (
              <>
                <Button variant="primary" loading={busy === 'approve'} onClick={() => void run('approve', () => p.onDecide(t.can.decide!, 'approve', ''))}>
                  Approve
                </Button>
                <Button variant="danger" onClick={() => setRejecting(true)}>
                  Do not approve
                </Button>
              </>
            )}
            {t.can.cancel && <Button onClick={() => setCancelling(true)}>Cancel the trip</Button>}
          </div>
          {booking && <BookingDrawer currency={t.currency} onClose={() => setBooking(false)} onSave={p.onAddBooking} />}
          {rejecting && <ReasonDialog title="Not approve this trip?" consequence="The trip closes and the traveller sees your reason." label="Why not" confirm="Do not approve" onClose={() => setRejecting(false)} onConfirm={(reason) => p.onDecide(t.can.decide!, 'reject', reason)} />}
          {cancelling && (
            <ConfirmDialog open onOpenChange={(o) => !o && setCancelling(false)} size="sm" title="Cancel this trip?" consequence="Its approval request and unpaid advance are cancelled. The trip stays on record." confirmLabel="Cancel the trip" destructive onConfirm={async () => {
              await p.onCancel();
              setCancelling(false);
            }} />
          )}
        </>
      )}
    </LivePage>
  );
}

function BookingDrawer({ currency, onClose, onSave }: { currency: string; onClose: () => void; onSave: (x: BookingInput) => Promise<unknown> }) {
  const [kind, setKind] = useState<BookingInput['kind'] | null>('ticket');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState<'company' | 'employee'>('employee');
  const [file, setFile] = useState<File | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errors = [...(title.trim().length >= 2 ? [] : [{ fieldId: 'bk-title', message: 'Say what was booked, e.g. Mumbai to Pune flight.' }]), ...(MONEY.test(amount.trim()) ? [] : [{ fieldId: 'bk-amount', message: 'Enter the amount, e.g. 5400.' }])];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await onSave({ kind: kind ?? 'other', title: title.trim(), amount: amount.trim(), paidBy, file });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Add a booking"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Add booking
          </Button>
        </>
      }
    >
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && (
        <InlineAlert tone="danger" title="Not added">
          {failed}
        </InlineAlert>
      )}
      <FormField id="bk-kind" label="Kind">
        <Select aria-label="Kind of booking" value={kind} onChange={(x) => setKind(x as BookingInput['kind'])} options={[...KINDS]} />
      </FormField>
      <FormField id="bk-title" label="What was booked" required error={v.errorOf('bk-title')}>
        <TextField value={title} onChange={setTitle} maxLength={150} />
      </FormField>
      <FormField id="bk-amount" label={`Amount (${currency})`} required error={v.errorOf('bk-amount')}>
        <TextField value={amount} onChange={(x) => setAmount(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={15} />
      </FormField>
      <FormField id="bk-paid" label="Who paid">
        <Segment
          label="Who paid for the booking"
          value={paidBy}
          onChange={setPaidBy}
          options={[
            { value: 'employee', label: 'I paid (I will claim it)' },
            { value: 'company', label: 'The company paid' },
          ]}
        />
      </FormField>
      <FormField id="bk-file" label="Ticket or booking" optional helper="PDF, JPEG or PNG, up to 10 MB. Checked for viruses before anyone opens it.">
        <label className="yx-button" data-variant="secondary" data-size="md">
          {file ? `Chosen: ${file.name}` : 'Choose a file'}
          <input type="file" accept="image/jpeg,image/png,application/pdf" className="yx-visually-hidden" aria-label="Ticket or booking file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      </FormField>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ advances (EXP-05)

export interface AdvancesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  mine: AdvanceSummary[] | null;
  approvals: AdvanceSummary[] | null;
  payout: AdvanceSummary[] | null;
  onRequest: (purpose: string, amount: string) => Promise<unknown>;
  onOpen: (id: string) => void;
}

export function AdvancesScreen(p: AdvancesScreenProps) {
  const [tab, setTab] = useState<'mine' | 'approvals' | 'payout'>('mine');
  const [requesting, setRequesting] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [amount, setAmount] = useState('');
  const rows = (tab === 'mine' ? p.mine : tab === 'approvals' ? p.approvals : p.payout) ?? [];
  const tabs = [{ value: 'mine' as const, label: 'My advances' }, ...(p.approvals?.length ? [{ value: 'approvals' as const, label: `Waiting for me (${p.approvals.length})` }] : []), ...(p.payout ? [{ value: 'payout' as const, label: `Finance (${p.payout.length})` }] : [])];
  const columns: TableColumn<AdvanceSummary>[] = [
    ...(tab === 'mine' ? [] : [{ key: 'person', header: 'Person', type: 'person' as const, value: (r: AdvanceSummary) => r.person ?? '', person: (r: AdvanceSummary) => ({ name: r.person ?? '' }), width: 200, hideable: false }]),
    { key: 'purpose', header: 'Advance', value: (r) => r.purpose, render: (r) => <Text>{`${r.purpose}${r.kind === 'trip' ? ' (trip)' : ''}`}</Text>, width: 260, hideable: tab !== 'mine' },
    { key: 'amount', header: 'Amount', value: (r) => Number(r.amount ?? r.requested), render: (r) => <Text>{money(r.currency, r.amount ?? r.requested)}</Text>, width: 140 },
    { key: 'balance', header: 'Open balance', value: (r) => Number(r.balance), render: (r) => <Text tone={r.overdue ? 'danger' : undefined}>{money(r.currency, r.balance)}</Text>, width: 150 },
    { key: 'status', header: 'Status', value: (r) => r.status, render: (r) => <><Badge tone={ADVANCE_STATUS[r.status].tone}>{ADVANCE_STATUS[r.status].label}</Badge> {r.overdue && <Badge tone="danger">Overdue</Badge>}</>, width: 230 },
  ];
  return (
    <LivePage
      title="Advances"
      description="Money paid to you before you spend it. Your claims settle it first; what is left you return."
      state={p.state}
      onRetry={p.onRetry}
      what="your advances"
      actions={
        <Button variant="primary" icon={Plus} onClick={() => setRequesting(true)}>
          Request an advance
        </Button>
      }
    >
      {tabs.length > 1 && <Segment label="Show" value={tab} onChange={setTab} options={tabs} />}
      <DataTable
        label="Advances"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        rowNoun={['advance', 'advances']}
        cardSummary
        empty={<EmptyState compact title={tab === 'mine' ? 'No advances.' : 'Nothing waiting.'} description={tab === 'mine' ? 'For a trip, ask on the trip request. For site expenses, request a standing advance.' : undefined} />}
        rowButtons={(r) => (
          <Button size="sm" onClick={() => p.onOpen(r.id)}>
            Open
          </Button>
        )}
      />
      {requesting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRequesting(false)}
          size="md"
          title="Request a standing advance"
          consequence="For regular spend at a site. Your manager and finance approve it. For a trip, ask on the trip request instead."
          confirmLabel="Send for approval"
          confirmDisabled={purpose.trim().length < 3 || !MONEY.test(amount.trim()) || Number(amount) <= 0}
          onConfirm={async () => {
            await p.onRequest(purpose.trim(), amount.trim());
            setRequesting(false);
          }}
        >
          <FormField id="ad-amount" label="Amount" required>
            <TextField value={amount} onChange={(x) => setAmount(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={15} />
          </FormField>
          <FormField id="ad-purpose" label="What it is for" required>
            <TextArea value={purpose} onChange={setPurpose} rows={2} maxLength={300} />
          </FormField>
        </ConfirmDialog>
      )}
    </LivePage>
  );
}

export interface AdvanceScreenProps {
  state: LoadState;
  onRetry?: () => void;
  advance: AdvanceDetail | null;
  today: string;
  onBack: () => void;
  onChangeAmount: (amount: string, reason: string) => Promise<unknown>;
  onDecide: (taskId: string, decision: 'approve' | 'reject', reason: string) => Promise<unknown>;
  onPay: (paidOn: string, ref: string) => Promise<unknown>;
  onReturn: (amount: string, on: string, ref: string) => Promise<unknown>;
  onNewClaim: () => Promise<unknown>;
  onOpenTrip: (id: string) => void;
  onOpenClaim: (id: string) => void;
}

export function AdvanceScreen(p: AdvanceScreenProps) {
  const a = p.advance;
  const { busy, error, run } = useRun();
  const [dialog, setDialog] = useState<'amount' | 'reject' | 'pay' | 'return' | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [on, setOn] = useState<Date | null>(fromKey(p.today));
  const [ref, setRef] = useState('');
  const open = (d: 'amount' | 'pay' | 'return') => {
    setAmount(d === 'return' ? String(Number(a?.balance ?? 0)) : String(Number(a?.amount ?? a?.requested ?? 0)));
    setReason('');
    setRef('');
    setOn(fromKey(p.today));
    setDialog(d);
  };
  const okDate = on !== null && dayKey(on) <= p.today;
  return (
    <LivePage title={a ? a.purpose : 'Advance'} description={a ? `${a.person} · ${a.kind === 'trip' ? 'For a trip' : 'Standing advance'}` : undefined} state={p.state} onRetry={p.onRetry} what="this advance" actions={<Button onClick={p.onBack}>Back</Button>}>
      {a && (
        <>
          {error && (
            <InlineAlert tone="danger" title="That didn't work">
              {error}
            </InlineAlert>
          )}
          <Card title="Balance">
            <Badge tone={ADVANCE_STATUS[a.status].tone}>{ADVANCE_STATUS[a.status].label}</Badge>
            <Fact label="Asked for" value={money(a.currency, a.requested)} />
            {a.amount !== null && a.amount !== a.requested && <Fact label="Approved" value={money(a.currency, a.amount)} />}
            {a.changeReason && (
              <Text as="p" tone="secondary">
                {`Approver's reason: ${a.changeReason}`}
              </Text>
            )}
            {a.paidOn && <Fact label="Paid on" value={dateText(a.paidOn)} />}
            {a.paidOn && <Fact label="Open balance" value={money(a.currency, a.balance)} tone={a.overdue ? 'danger' : undefined} />}
            {a.settleBy && <Fact label="Settle by" value={dateText(a.settleBy)} />}
            {a.overdue && (
              <InlineAlert tone="danger" title="The time to settle has passed">
                {`Claim your spend or return ${money(a.currency, a.balance)} by bank. Finance has been told. At exit, an open balance is recovered in the full and final settlement.`}
              </InlineAlert>
            )}
            {a.tripId && (
              <Button size="sm" onClick={() => p.onOpenTrip(a.tripId!)}>
                Open the trip
              </Button>
            )}
          </Card>
          <Card title="Balance ledger">
            <DataTable
              label="Balance ledger"
              columns={[
                { key: 'd', header: 'Date', value: (l: AdvanceDetail['ledger'][number]) => l.on, render: (l) => <Text>{dateText(l.on)}</Text>, width: 140 },
                { key: 't', header: 'What happened', value: (l) => l.text, width: 320 },
                { key: 'a', header: 'Amount', value: (l) => Number(l.amount), render: (l) => <Text>{money(a.currency, l.amount)}</Text>, width: 140 },
              ]}
              rows={a.ledger}
              getRowId={(l) => l.id}
              rowNoun={['entry', 'entries']}
              empty={<EmptyState compact title="Nothing yet." description="The advance shows here once finance pays it." />}
              rowButtons={(l) =>
                l.claimId ? (
                  <Button size="sm" onClick={() => p.onOpenClaim(l.claimId!)}>
                    Open claim
                  </Button>
                ) : null
              }
            />
          </Card>
          <div className="yx-lif-row">
            {a.can.changeAmount && <Button onClick={() => open('amount')}>Approve less</Button>}
            {a.can.decide && (
              <>
                <Button variant="primary" loading={busy === 'approve'} onClick={() => void run('approve', () => p.onDecide(a.can.decide!, 'approve', ''))}>
                  Approve
                </Button>
                <Button variant="danger" onClick={() => setDialog('reject')}>
                  Do not approve
                </Button>
              </>
            )}
            {a.can.pay && (
              <Button variant="primary" onClick={() => open('pay')}>
                Record payment
              </Button>
            )}
            {a.can.recordReturn && <Button onClick={() => open('return')}>Record a return</Button>}
            {a.can.claim && (
              <Button icon={Plus} loading={busy === 'claim'} onClick={() => void run('claim', p.onNewClaim)}>
                Claim against this advance
              </Button>
            )}
          </div>
          {dialog === 'reject' && <ReasonDialog title="Not approve this advance?" consequence="The request closes and the employee sees your reason." label="Why not" confirm="Do not approve" onClose={() => setDialog(null)} onConfirm={(r) => p.onDecide(a.can.decide!, 'reject', r)} />}
          {dialog === 'amount' && (
            <ConfirmDialog
              open
              onOpenChange={(o) => !o && setDialog(null)}
              size="md"
              title="Approve a lower amount?"
              consequence={`Asked for ${money(a.currency, a.requested)}. The employee sees the amount you approve and your reason. Then approve the request.`}
              confirmLabel="Save amount"
              confirmDisabled={!MONEY.test(amount) || Number(amount) <= 0 || Number(amount) > Number(a.requested) || (Number(amount) < Number(a.requested) && reason.trim().length < 3)}
              onConfirm={async () => {
                await p.onChangeAmount(Number(amount).toFixed(2), reason.trim());
                setDialog(null);
              }}
            >
              <FormField id="ad-new" label={`Approve (${a.currency})`} required>
                <TextField value={amount} onChange={(x) => setAmount(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={15} />
              </FormField>
              <FormField id="ad-why" label="Reason" required helper="For example: two weeks of site spend is enough">
                <TextArea value={reason} onChange={setReason} rows={2} maxLength={300} />
              </FormField>
            </ConfirmDialog>
          )}
          {dialog === 'pay' && (
            <ConfirmDialog
              open
              onOpenChange={(o) => !o && setDialog(null)}
              size="md"
              title={`Record payment of ${money(a.currency, a.amount)}?`}
              consequence={a.kind === 'trip' ? 'The employee is told and the settle-by date starts from the trip end.' : 'The employee is told.'}
              confirmLabel="Record payment"
              confirmDisabled={!okDate || ref.trim().length < 2}
              onConfirm={async () => {
                await p.onPay(dayKey(on!), ref.trim());
                setDialog(null);
              }}
            >
              <FormField id="ad-paid-on" label="Paid on" required>
                <DatePicker value={on} onChange={setOn} max={fromKey(p.today)} aria-label="Paid on" />
              </FormField>
              <FormField id="ad-ref" label="Bank reference" required helper="The UTR or transfer reference.">
                <TextField value={ref} onChange={setRef} maxLength={80} />
              </FormField>
            </ConfirmDialog>
          )}
          {dialog === 'return' && (
            <ConfirmDialog
              open
              onOpenChange={(o) => !o && setDialog(null)}
              size="md"
              title="Record money returned by the employee?"
              consequence={`Open balance ${money(a.currency, a.balance)}. When it reaches nil the advance is settled.`}
              confirmLabel="Record return"
              confirmDisabled={!okDate || ref.trim().length < 2 || !MONEY.test(amount) || Number(amount) <= 0 || Number(amount) > Number(a.balance)}
              onConfirm={async () => {
                await p.onReturn(Number(amount).toFixed(2), dayKey(on!), ref.trim());
                setDialog(null);
              }}
            >
              <FormField id="ad-ret" label={`Amount returned (${a.currency})`} required>
                <TextField value={amount} onChange={(x) => setAmount(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={15} />
              </FormField>
              <FormField id="ad-ret-on" label="Received on" required>
                <DatePicker value={on} onChange={setOn} max={fromKey(p.today)} aria-label="Received on" />
              </FormField>
              <FormField id="ad-ret-ref" label="Bank reference" required>
                <TextField value={ref} onChange={setRef} maxLength={80} />
              </FormField>
            </ConfirmDialog>
          )}
        </>
      )}
    </LivePage>
  );
}
