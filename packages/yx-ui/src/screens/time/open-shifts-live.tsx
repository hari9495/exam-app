// TIM-35 · Open shifts and bids, live: the designed OpenShiftsScreen / OpenShiftsManager (roster.tsx) with the API's
// open shifts, bids, eligibility and fair order. Same table, cells, badges, award and offer dialogs; the offer form asks
// for what the API needs (location, day, shift, licence, award rule, when bids close). OpenShiftsPanel is the table and
// its dialogs alone, for the roster's "Open shifts" tab.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Segment } from '../people/people-kit';
import { Button } from '../../components/button';
import { Badge, DayDate } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { useToast } from '../../components/notify';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { RadioGroup } from '../../components/choice';
import { TextField, TimeField } from '../../components/inputs';
import { FieldRow, FormField } from '../../components/field';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { formatDate } from '../../lib/format';
import { errorText } from '../org/org-kit';
import { DueBadge, TimePage } from './time-kit';
import { fmt12 } from './time-logic';
import type { LoadState } from './live/types';

export type OpenShiftRule = 'manager_picks' | 'first_come';
export interface OpenShiftBid {
  id: string;
  employeeId: string;
  name: string;
  code: string | null;
  status: 'waiting' | 'won' | 'lost' | 'withdrawn';
  bidAt: string;
  eligible: boolean;
  /** Why this person can't be picked now (the server's check). */
  why: string | null;
  refusalCode: string | null;
  /** Open shifts won in the 30 days before the shift. */
  won30: number;
  /** Minutes rostered in the shift's week. */
  weekMinutes: number;
  /** Fair order among the eligible (1 = suggested). */
  rank: number | null;
}
export interface OpenShiftShift { id: string; name: string; start: string | null; end: string | null; night: boolean }
export interface OpenShiftRow {
  id: string;
  on: string;
  location: { id: string; name: string };
  shift: OpenShiftShift;
  licence: { id: string; name: string } | null;
  rule: OpenShiftRule;
  status: 'open' | 'awarded' | 'cancelled';
  closesAt: string | null;
  note: string | null;
  awarded: { employeeId: string; name: string } | null;
  version: number;
  bids: OpenShiftBid[];
}
export interface OpenShiftsData {
  today: string;
  maxDaysAhead: number;
  locations: { id: string; name: string; rule: OpenShiftRule }[];
  shifts: OpenShiftShift[];
  licenceTypes: { id: string; name: string }[];
  rows: OpenShiftRow[];
}
export interface OpenShiftInput { locationId: string; shiftId: string; on: string; licenceTypeId?: string; rule: OpenShiftRule; closesAt?: string; note?: string }
export interface LiveOpenShifts {
  state: LoadState;
  data: OpenShiftsData | null;
  onRetry?: () => void;
  onOffer: (input: OpenShiftInput) => Promise<unknown>;
  onAward: (id: string, employeeId: string, version: number) => Promise<unknown>;
  onCancel: (id: string, version: number, reason?: string) => Promise<unknown>;
}

const RULE_TEXT: Record<OpenShiftRule, string> = { manager_picks: 'Manager picks', first_come: 'First come' };
const STATUS: Record<OpenShiftRow['status'], { text: string; tone: 'warning' | 'success' | 'neutral' }> = { open: { text: 'Open', tone: 'warning' }, awarded: { text: 'Awarded', tone: 'success' }, cancelled: { text: 'Cancelled', tone: 'neutral' } };
const nowrap = { whiteSpace: 'nowrap' } as const;
/** "2026-10-12" as a local date. */
export const localDate = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const shiftLabel = (s: OpenShiftShift) => (s.start && s.end ? `${s.name} ${`${fmt12(s.start)} – ${fmt12(s.end)}`.replace(/:00/g, '')}` : s.name);
const hours = (m: number) => `${Math.round(m / 6) / 10} h`;
const timeText = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/** One bid as the award dialog explains it: when, the fair-order facts, and the suggestion. */
const bidDetail = (b: OpenShiftBid) => `Bid ${formatDate(new Date(b.bidAt))}, ${timeText(b.bidAt)} · ${plural(b.won30, 'open shift')} won in 30 days · ${hours(b.weekMinutes)} rostered that week${b.rank ? ` · ${ordinal(b.rank)} in the fair order` : ''}`;

/** The designed open-shifts table with its award, offer and cancel dialogs, on live data. */
export function OpenShiftsPanel({ live, offer, onOffer }: { live: LiveOpenShifts; offer: boolean; onOffer: (open: boolean) => void }) {
  const d = live.data;
  const { toast } = useToast();
  const done = (title: string, description?: string) => toast({ title, description, tone: 'success' });
  const today = localDate(d?.today ?? toIso(new Date()));
  const [award, setAward] = useState<OpenShiftRow | null>(null);
  const [pick, setPick] = useState('');
  const [pickTried, setPickTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [awardError, setAwardError] = useState<string | null>(null);
  const [cancel, setCancel] = useState<OpenShiftRow | null>(null);

  if (live.state === 'error') return <ErrorState title="We couldn't load the open shifts." description="Nothing has changed. Try again in a moment." onRetry={live.onRetry} />;
  if (live.state === 'no-access') return <NoAccessState what="open shifts" grantedBy="HR" />;

  const rows = d?.rows ?? [];
  const waiting = (r: OpenShiftRow) => r.bids.filter((b) => b.status === 'waiting');
  const cols: TableColumn<OpenShiftRow>[] = [
    { key: 'when', header: 'Shift', width: 260, value: (r) => r.on, render: (r) => (
      <span className="yx-tim-list__main">
        <span className="yx-tim-row">
          <strong><DayDate date={localDate(r.on)} /></strong>
          <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].text}</Badge>
          {r.status === 'open' && <DueBadge date={localDate(r.on)} today={today} />}
        </span>
        <span style={nowrap}>{shiftLabel(r.shift)}</span>
        <span className="yx-tim-muted">{r.licence ? `${r.licence.name} · ` : ''}{r.awarded ? `awarded to ${r.awarded.name}` : `${waiting(r).length} ${waiting(r).length === 1 ? 'claim' : 'claims'}`}{r.closesAt && r.status === 'open' ? ` · bids close ${formatDate(new Date(r.closesAt))}, ${timeText(r.closesAt)}` : ''}</span>
        {r.note && <span className="yx-tim-muted">{r.note}</span>}
      </span>
    ) },
    { key: 'pool', header: 'Offered to', value: (r) => r.location.name, optional: true },
    { key: 'rule', header: 'Award rule', value: (r) => RULE_TEXT[r.rule], optional: true },
  ];
  const openAward = (r: OpenShiftRow) => {
    setAward(r);
    setPick(r.bids.find((b) => b.eligible && b.rank === 1)?.employeeId ?? '');
    setPickTried(false);
    setAwardError(null);
  };
  const doAward = async () => {
    if (!award) return;
    if (!pick) {
      setPickTried(true);
      document.getElementById('os-pick')?.querySelector<HTMLElement>('button, [role="radio"]')?.focus();
      return;
    }
    setBusy(true);
    setAwardError(null);
    try {
      await live.onAward(award.id, pick, award.version);
      done(`Shift awarded to ${award.bids.find((b) => b.employeeId === pick)?.name ?? 'them'}`, 'They and the others who bid are told.');
      setAward(null);
    } catch (e) {
      setAwardError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const eligible = award ? award.bids.filter((b) => b.status === 'waiting' && b.eligible) : [];
  const blocked = award ? award.bids.filter((b) => b.status === 'waiting' && !b.eligible) : [];
  const emptyState = <EmptyState title="No open shifts" description="Unfilled slots from sick calls, swaps or a blocked licence can be offered here." action={<Button icon={Plus} onClick={() => onOffer(true)}>Offer an open shift</Button>} />;
  return (
    <>
      {!rows.length && live.state === 'ready' ? emptyState : <DataTable
        label="Open shifts"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        state={live.state === 'loading' ? 'loading' : 'ready'}
        empty={emptyState}
        rowButtons={(r) =>
          r.status !== 'open' ? null : (
            <>
              {waiting(r).length > 0 && <Button size="sm" variant="review" onClick={() => openAward(r)}>Pick claimant</Button>}
              <Button size="sm" onClick={() => setCancel(r)}>Cancel offer</Button>
            </>
          )
        }
      />}
      <Dialog
        open={!!award}
        onOpenChange={(o) => !o && setAward(null)}
        title={award ? `Award ${formatDate(localDate(award.on))} · ${shiftLabel(award.shift)}` : ''}
        footer={<><Button onClick={() => setAward(null)}>Cancel</Button><Button variant="approve" loading={busy} onClick={() => void doAward()}>Award shift</Button></>}
      >
        <div className="yx-tim-stack">
          {awardError && <InlineAlert tone="danger" title="Not awarded">{awardError}</InlineAlert>}
          {eligible.length ? (
            <FormField id="os-pick" label="Who gets the shift" required error={pickTried && !pick ? 'Pick who gets the shift' : undefined}>
              <RadioGroup aria-label="Claimant" value={pick} onChange={setPick} options={eligible.map((b) => ({ value: b.employeeId, label: b.name, description: bidDetail(b) }))} />
            </FormField>
          ) : (
            <p className="yx-tim-muted">No one who bid can take this shift now. Cancel it, or wait for more bids.</p>
          )}
          {blocked.length > 0 && (
            <ul className="yx-tim-list" aria-label="Bids that can't be picked">
              {blocked.map((b) => <li key={b.id}><span className="yx-tim-list__main"><span>{b.name}</span><span className="yx-tim-muted">{b.why}</span></span></li>)}
            </ul>
          )}
          <p className="yx-tim-muted">Fair order: fewest open shifts won in the last 30 days, then fewest hours that week, then the earliest bid. The rules are checked again when you award.</p>
        </div>
      </Dialog>
      <ConfirmDialog
        open={!!cancel}
        onOpenChange={(o) => !o && setCancel(null)}
        title={cancel ? `Cancel the open shift on ${formatDate(localDate(cancel.on))}?` : ''}
        consequence={cancel ? (waiting(cancel).length ? `${plural(waiting(cancel).length, 'person')} who bid ${waiting(cancel).length === 1 ? 'is' : 'are'} told it was cancelled.`.replace('persons', 'people') : 'No one has bid yet.') : ''}
        confirmLabel="Cancel open shift"
        cancelLabel="Keep it"
        confirmVariant="danger"
        onConfirm={async () => {
          await live.onCancel(cancel!.id, cancel!.version);
          done('Open shift cancelled');
        }}
      />
      {d && <OfferDialog data={d} open={offer} onOpenChange={onOffer} onOffer={live.onOffer} />}
    </>
  );
}

function OfferDialog({ data, open, onOpenChange, onOffer }: { data: OpenShiftsData; open: boolean; onOpenChange: (o: boolean) => void; onOffer: LiveOpenShifts['onOffer'] }) {
  const { toast } = useToast();
  const today = localDate(data.today);
  const max = new Date(today.getTime() + data.maxDaysAhead * 86_400_000);
  const first = data.locations[0];
  const [form, setForm] = useState<{ locationId: string | null; date: Date | null; shiftId: string | null; licence: string | null; rule: OpenShiftRule; closeDate: Date | null; closeTime: string | null; note: string }>({ locationId: first?.id ?? null, date: null, shiftId: data.shifts[0]?.id ?? null, licence: null, rule: first?.rule ?? 'manager_picks', closeDate: null, closeTime: null, note: '' });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = !form.locationId ? 'os-loc' : !form.date ? 'os-date' : !form.shiftId ? 'os-shift' : form.closeDate && !form.closeTime ? 'os-close-time' : null;
  const loc = data.locations.find((l) => l.id === form.locationId);
  const send = async () => {
    if (missing) {
      setTried(true);
      document.getElementById(missing)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const closesAt = form.closeDate && form.closeTime ? new Date(`${toIso(form.closeDate)}T${form.closeTime}:00+05:30`).toISOString() : undefined;
      await onOffer({ locationId: form.locationId!, shiftId: form.shiftId!, on: toIso(form.date!), rule: form.rule, ...(form.licence ? { licenceTypeId: form.licence } : {}), ...(closesAt ? { closesAt } : {}), ...(form.note.trim() ? { note: form.note.trim() } : {}) });
      toast({ title: 'Open shift offered', description: form.rule === 'first_come' ? 'The first eligible person to claim it gets it.' : 'You pick from the bids.', tone: 'success' });
      setForm({ ...form, date: null, closeDate: null, closeTime: null, note: '' });
      setTried(false);
      onOpenChange(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Offer an open shift"
      footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void send()}>Offer shift</Button></>}
    >
      <div className="yx-tim-stack">
        {error && <InlineAlert tone="danger" title="Not offered">{error}</InlineAlert>}
        {data.locations.length > 1 && <FormField id="os-loc" label="Location" required error={tried && !form.locationId ? 'Pick a location' : undefined}><Select value={form.locationId} onChange={(v) => setForm({ ...form, locationId: v, rule: data.locations.find((l) => l.id === v)?.rule ?? form.rule })} options={data.locations.map((l) => ({ value: l.id, label: l.name }))} /></FormField>}
        <FormField id="os-date" label="Date" required error={tried && !form.date ? 'Pick a date' : undefined}><DatePicker id="os-date" value={form.date} min={today} max={max} onChange={(v) => setForm({ ...form, date: v })} /></FormField>
        <FormField id="os-shift" label="Shift" required error={tried && !form.shiftId ? 'Pick a shift' : undefined}><Select value={form.shiftId} onChange={(v) => setForm({ ...form, shiftId: v })} options={data.shifts.map((s) => ({ value: s.id, label: shiftLabel(s) }))} /></FormField>
        <FormField label="Licence needed" optional><Select value={form.licence} clearable placeholder="None" onChange={(v) => setForm({ ...form, licence: v })} options={data.licenceTypes.map((l) => ({ value: l.id, label: l.name }))} /></FormField>
        <FormField label="Award rule" required helper={`Company setting for ${loc?.name ?? 'this location'}: ${RULE_TEXT[loc?.rule ?? 'manager_picks']}`}><Segment label="Award rule" value={form.rule} onChange={(v) => setForm({ ...form, rule: v })} options={[{ value: 'manager_picks', label: 'Manager picks' }, { value: 'first_come', label: 'First come' }]} /></FormField>
        <FieldRow>
          <FormField label="Bids close" optional><DatePicker value={form.closeDate} min={today} max={form.date ?? max} onChange={(v) => setForm({ ...form, closeDate: v })} /></FormField>
          <FormField id="os-close-time" label="At" optional error={tried && form.closeDate && !form.closeTime ? 'Enter the time bids close' : undefined}><TimeField id="os-close-time" value={form.closeTime} onChange={(v) => setForm({ ...form, closeTime: v })} /></FormField>
        </FieldRow>
        <FormField label="Note" optional><TextField value={form.note} maxLength={300} placeholder="For example Line 2 short, Babu Raj's licence expired" onChange={(v) => setForm({ ...form, note: v })} /></FormField>
        <p className="yx-tim-muted">Offered at {loc?.name ?? 'the location'} only to people who work there that day, are not on leave and pass the licence, rest and hour checks.</p>
      </div>
    </Dialog>
  );
}

export function LiveOpenShiftsScreen({ live }: { live: LiveOpenShifts }) {
  const [offer, setOffer] = useState(false);
  const where = live.data?.locations.map((l) => l.name).join(', ');
  return (
    <TimePage active="Roster">
      <PageHeader title="Open shifts and bids" description={`${where ? `${where} · ` : ''}offered only to people who pass the licence, leave, rest and hour checks`} actions={live.state === 'ready' && live.data ? <Button variant="primary" icon={Plus} onClick={() => setOffer(true)}>Offer an open shift</Button> : undefined} />
      <OpenShiftsPanel live={live} offer={offer} onOffer={setOffer} />
    </TimePage>
  );
}
