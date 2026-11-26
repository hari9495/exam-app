// IT assets part 5 (founder answer 2715): asset booking.
//   MyAssetBookingsScreen  Me › Asset bookings (the avatar menu, next to My assets): my bookings, past and to come, and
//                          "Book an asset": the dates, a daily or weekly repeat, then the "free between" search lists
//                          the bookable assets free for those days (by category and location) and one is booked. With the
//                          company's approval setting a booking waits for IT. I cancel a booking not handed over yet.
//   AssetBookingsScreen    People › Asset bookings (Helpdesk › IT bookings): every booking of the assets IT sees, to
//                          approve or decline (with a reason), hand over (an issue on the register), take back (the
//                          return) or cancel (with a reason); an overdue one in red. Picking a person is the loan report:
//                          their past, current and future bookings.
import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Badge, type BadgeTone } from '../../components/display';
import { Card, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextField } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { Text } from '../../components/foundations';
import { useToast } from '../../components/notify';
import { LivePage, rangeText } from '../time/live/kit';
import { PeopleFrame, Segment } from './people-kit';

type Choice = { value: string; label: string };
type State = 'ready' | 'loading' | 'error' | 'no-access';
export type BookingStatus = 'pending' | 'booked' | 'declined' | 'cancelled' | 'out' | 'returned';
export type BookingRepeat = 'none' | 'daily' | 'weekly';

export interface MyBookingRow {
  id: string;
  /** Shared by the bookings of one repeat. */
  seriesId: string | null;
  tag: string;
  asset: string;
  startsOn: string;
  endsOn: string;
  status: BookingStatus;
  purpose: string | null;
  /** Why it was declined or cancelled. */
  reason: string | null;
  /** Handed over and past its last day. */
  overdue: boolean;
}
export interface FreeAsset {
  id: string;
  tag: string;
  name: string;
  categoryId: string | null;
  category: string;
  locationId: string | null;
  location: string | null;
}
export interface FreeAssets {
  rows: FreeAsset[];
  categories: Choice[];
  locations: Choice[];
}
export interface BookingInput {
  assetId: string;
  startsOn: string;
  endsOn: string;
  repeat: BookingRepeat;
  until: string | null;
  purpose: string | null;
}
export interface LiveMyBookings {
  state: State;
  onRetry: () => void;
  today: string;
  /** The company's longest booking (Settings › Assets). */
  maxDays: number;
  /** The company asks IT to approve each booking. */
  approval: boolean;
  rows: MyBookingRow[];
  /** The "free between" search. */
  onSearch: (from: string, to: string) => Promise<FreeAssets>;
  onBook: (input: BookingInput) => Promise<{ ids: string[]; status: BookingStatus }>;
  onCancel: (id: string, series: boolean) => Promise<unknown>;
}

export interface ItBookingRow extends MyBookingRow {
  assetId: string;
  employeeId: string | null;
  person: string;
  /** Asset manager of the asset's place. */
  canManage: boolean;
}
export type TakeBackInput = { condition: string; status: 'in_stock' | 'in_repair' | 'lost' };
export interface LiveItBookings {
  state: State;
  onRetry: () => void;
  today: string;
  rows: ItBookingRow[];
  onApprove: (id: string) => Promise<unknown>;
  onDecline: (id: string, reason: string) => Promise<unknown>;
  onCancel: (id: string, reason: string) => Promise<unknown>;
  onHandOver: (id: string, condition: string) => Promise<unknown>;
  onTakeBack: (b: ItBookingRow, input: TakeBackInput) => Promise<unknown>;
  onOpenAsset?: (id: string) => void;
}

export const BOOKING_STATUS: Record<BookingStatus, { text: string; tone: BadgeTone }> = {
  pending: { text: 'Waiting for IT', tone: 'warning' },
  booked: { text: 'Booked', tone: 'info' },
  out: { text: 'Handed over', tone: 'success' },
  returned: { text: 'Returned', tone: 'neutral' },
  declined: { text: 'Declined', tone: 'danger' },
  cancelled: { text: 'Cancelled', tone: 'neutral' },
};
export function BookingBadge({ b }: { b: { status: BookingStatus; overdue: boolean } }) {
  return b.overdue ? <Badge tone="danger">Overdue</Badge> : <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].text}</Badge>;
}
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (s: string) => new Date(`${s}T00:00:00`);
const daysOf = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
const toCome = (b: { status: BookingStatus }) => b.status === 'pending' || b.status === 'booked' || b.status === 'out';
const ok = () => Promise.resolve();

// ------------------------------------------------------------------------------------------ Me › Asset bookings

/** My asset bookings: the designed view (sample data) or, with `live`, mine. */
export function MyAssetBookingsScreen(props: { rows: MyBookingRow[]; today: string; maxDays?: number; approval?: boolean; show?: 'coming' | 'past'; booking?: boolean; found?: FreeAssets } | { live: LiveMyBookings }) {
  if ('live' in props) return <MyBookings {...props.live} />;
  const found = props.found ?? SAMPLE_FREE;
  return <MyBookings state="ready" onRetry={() => undefined} rows={props.rows} today={props.today} maxDays={props.maxDays ?? 14} approval={props.approval ?? false} onSearch={() => Promise.resolve(found)} onBook={() => Promise.resolve({ ids: ['b9'], status: props.approval ? 'pending' : 'booked' })} onCancel={ok} show={props.show} booking={props.booking} />;
}

const SAMPLE_FREE: FreeAssets = {
  rows: [
    { id: 'a7', tag: 'PJ-0003', name: 'Epson EB-X51 projector', categoryId: 'c2', category: 'Projector', locationId: 'l1', location: 'Hosur plant' },
    { id: 'a8', tag: 'LT-0507', name: 'Dell Latitude 5440 (spare)', categoryId: 'c1', category: 'Laptop', locationId: 'l2', location: 'Chennai office' },
  ],
  categories: [{ value: 'c1', label: 'Laptop' }, { value: 'c2', label: 'Projector' }],
  locations: [{ value: 'l2', label: 'Chennai office' }, { value: 'l1', label: 'Hosur plant' }],
};

function MyBookings({ state, onRetry, today, maxDays, approval, rows, onSearch, onBook, onCancel, show: initialShow = 'coming', booking = false }: LiveMyBookings & { show?: 'coming' | 'past'; booking?: boolean }) {
  const { toast } = useToast();
  const [show, setShow] = useState(initialShow);
  const [open, setOpen] = useState(booking);
  const [cancelling, setCancelling] = useState<MyBookingRow | null>(null);
  const [series, setSeries] = useState(false);
  const shown = rows.filter((b) => toCome(b) === (show === 'coming'));
  const cols: TableColumn<MyBookingRow>[] = [
    { key: 'asset', header: 'Asset', value: (b) => b.asset, render: (b) => <span>{b.asset}<Text as="div" size="sm" tone="secondary">{b.tag}</Text></span>, width: 240 },
    { key: 'dates', header: 'Dates', value: (b) => b.startsOn, render: (b) => rangeText(b.startsOn, b.endsOn), width: 220 },
    { key: 'status', header: 'Status', value: (b) => b.status, render: (b) => <span><BookingBadge b={b} />{b.reason && <Text as="div" size="sm" tone="secondary">{b.reason}</Text>}</span>, width: 220 },
    { key: 'purpose', header: 'Purpose', value: (b) => b.purpose ?? '—', width: 200, optional: true },
  ];
  return (
    <LivePage
      title="Asset bookings"
      description={`Book a spare laptop, a projector or another bookable asset for up to ${maxDays} ${maxDays === 1 ? 'day' : 'days'}. IT hands it over and takes it back.`}
      actions={<Button variant="primary" icon={CalendarPlus} onClick={() => setOpen(true)}>Book an asset</Button>}
      state={state}
      onRetry={onRetry}
      what="your asset bookings"
    >
      <Card>
        <div className="yx-set-stack">
          <Segment<'coming' | 'past'> label="Show" value={show} onChange={setShow} options={[{ value: 'coming', label: 'To come and with me' }, { value: 'past', label: 'Past' }]} />
          <DataTable
            label="My asset bookings"
            columns={cols}
            rows={shown}
            getRowId={(b) => b.id}
            state="ready"
            rowButtons={(b) => (b.status === 'pending' || b.status === 'booked' ? <Button size="sm" onClick={() => (setSeries(false), setCancelling(b))}>Cancel booking</Button> : null)}
            empty={show === 'coming' ? <EmptyState title="No bookings to come" description="Book a spare laptop or a projector when you need one." action={<Button onClick={() => setOpen(true)}>Book an asset</Button>} /> : <EmptyState title="No past bookings" description="Bookings you returned, cancelled or that were declined show here." />}
          />
        </div>
      </Card>
      {open && <BookDrawer today={today} maxDays={maxDays} approval={approval} onSearch={onSearch} onBook={onBook} onClose={() => setOpen(false)} />}
      {cancelling && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setCancelling(null)}
          title={`Cancel your booking of ${cancelling.asset}?`}
          consequence={`${rangeText(cancelling.startsOn, cancelling.endsOn)}. The days become free for others.`}
          confirmLabel="Cancel booking"
          cancelLabel="Keep it"
          destructive
          onConfirm={async () => {
            await onCancel(cancelling.id, series);
            toast({ tone: 'success', title: `Booking of ${cancelling.asset} cancelled.` });
            setCancelling(null);
          }}
        >
          {cancelling.seriesId && <Checkbox checked={series} onChange={setSeries} label="Also cancel the later repeats" description="The bookings of this repeat after this one." />}
        </ConfirmDialog>
      )}
    </LivePage>
  );
}

function BookDrawer({ today, maxDays, approval, onSearch, onBook, onClose }: { today: string; maxDays: number; approval: boolean; onSearch: LiveMyBookings['onSearch']; onBook: LiveMyBookings['onBook']; onClose: () => void }) {
  const { toast } = useToast();
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [repeat, setRepeat] = useState<BookingRepeat>('none');
  const [until, setUntil] = useState<Date | null>(null);
  const [purpose, setPurpose] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [found, setFound] = useState<FreeAssets | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const f = from ? keyOf(from) : null;
  const t = to ? keyOf(to) : null;
  const problems = {
    from: !f ? 'Choose the first day.' : f < today ? 'Choose today or a later day.' : null,
    to: !t ? 'Choose the last day.' : f && t < f ? 'The last day is on or after the first day.' : f && daysOf(f, t) > maxDays ? `A booking is at most ${maxDays} ${maxDays === 1 ? 'day' : 'days'}.` : null,
    until: repeat === 'none' ? null : !until || !f || keyOf(until) <= f ? 'Choose the day the repeats end, after the first day.' : null,
    repeat: repeat === 'none' || !f || !t ? null : repeat === 'daily' && daysOf(f, t) > 1 ? 'A daily repeat books one day at a time.' : repeat === 'weekly' && daysOf(f, t) > 7 ? 'A weekly repeat books at most 7 days at a time.' : null,
  };
  const shown = (x: keyof typeof problems) => (tried ? problems[x] : null);
  const search = async () => {
    setTried(true);
    if (Object.values(problems).some(Boolean)) return;
    setBusy('search');
    setError(null);
    try {
      setFound(await onSearch(f!, t!));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const book = async (a: FreeAsset) => {
    setBusy(a.id);
    setError(null);
    try {
      const r = await onBook({ assetId: a.id, startsOn: f!, endsOn: t!, repeat, until: repeat === 'none' ? null : keyOf(until!), purpose: purpose.trim() || null });
      const times = r.ids.length > 1 ? ` (${r.ids.length} times)` : '';
      toast({ tone: 'success', title: r.status === 'pending' ? `Sent to IT: ${a.name}${times}. You are told when they decide.` : `Booked: ${a.name}, ${rangeText(f!, t!)}${times}.` });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const rows = (found?.rows ?? []).filter((a) => (!category || a.categoryId === category) && (!location || a.locationId === location));
  const cols: TableColumn<FreeAsset>[] = [
    { key: 'name', header: 'Asset', value: (a) => a.name, render: (a) => <span>{a.name}<Text as="div" size="sm" tone="secondary">{a.tag}</Text></span>, width: 240 },
    { key: 'category', header: 'Category', value: (a) => a.category, width: 130 },
    { key: 'location', header: 'Location', value: (a) => a.location ?? '—', width: 150 },
  ];
  // A changed date or repeat needs a new search.
  const change = <T,>(set: (v: T) => void) => (v: T) => (set(v), setFound(null));
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title="Book an asset" size="lg" dirty={Boolean(from || to)} footer={<Button onClick={onClose}>Close</Button>}>
      <div className="yx-set-stack">
        {approval && <InlineAlert tone="info" title="IT approves each booking.">Your booking waits for IT. You are told when they approve or decline it.</InlineAlert>}
        {error && (
          <InlineAlert tone="danger" title="Not booked">
            {error}
          </InlineAlert>
        )}
        <div className="yx-lif-grid">
          <FormField id="bk-from" label="First day" required error={shown('from')}>
            <DatePicker value={from} onChange={change(setFrom)} min={day(today)} />
          </FormField>
          <FormField id="bk-to" label="Last day" required helper={`At most ${maxDays} ${maxDays === 1 ? 'day' : 'days'}.`} error={shown('to')}>
            <DatePicker value={to} onChange={change(setTo)} min={from ?? day(today)} />
          </FormField>
        </div>
        <FormField id="bk-repeat" label="Repeat" helper="Each repeat is its own booking. If any day is taken, nothing is booked." error={shown('repeat')}>
          <Segment<BookingRepeat> label="Repeat" value={repeat} onChange={change(setRepeat)} options={[{ value: 'none', label: 'Does not repeat' }, { value: 'daily', label: 'Every day' }, { value: 'weekly', label: 'Every week' }]} />
        </FormField>
        <div className="yx-lif-grid">
          {repeat !== 'none' && (
            <FormField id="bk-until" label="Repeat until" required helper="Up to 3 months after the first day." error={shown('until')}>
              <DatePicker value={until} onChange={change(setUntil)} min={from ?? day(today)} />
            </FormField>
          )}
          <FormField id="bk-purpose" label="Purpose" optional helper="For example: client demo in Pune.">
            <TextField value={purpose} onChange={setPurpose} maxLength={200} />
          </FormField>
        </div>
        <div>
          <Button variant={found ? 'secondary' : 'primary'} loading={busy === 'search'} onClick={() => void search()}>
            Find free assets
          </Button>
        </div>
        {found && (
          <>
            <div className="yx-lif-grid">
              <FormField id="bk-category" label="Category" optional>
                <Select aria-label="Category" value={category} onChange={setCategory} options={found.categories} clearable />
              </FormField>
              <FormField id="bk-location" label="Location" optional>
                <Select aria-label="Location" value={location} onChange={setLocation} options={found.locations} clearable />
              </FormField>
            </div>
            <DataTable
              label="Free assets"
              columns={cols}
              rows={rows}
              getRowId={(a) => a.id}
              state="ready"
              rowButtons={(a) => <Button size="sm" variant="primary" loading={busy === a.id} onClick={() => void book(a)}>Book</Button>}
              empty={<EmptyState title="Nothing free for these days" description="Try other days, or clear the category and location." />}
            />
          </>
        )}
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ People › Asset bookings (IT)

type Show = 'waiting' | 'coming' | 'out' | 'past' | 'all';
const SHOW: Record<Show, (b: ItBookingRow) => boolean> = {
  waiting: (b) => b.status === 'pending',
  coming: (b) => b.status === 'booked',
  out: (b) => b.status === 'out',
  past: (b) => !toCome(b),
  all: () => true,
};
type Acting = { kind: 'decline' | 'cancel' | 'hand' | 'back'; b: ItBookingRow };

/** IT's bookings list (and loan report): the designed view (sample data) or, with `live`, the bookings IT sees. */
export function AssetBookingsScreen(props: { rows: ItBookingRow[]; today: string; show?: Show; person?: string; acting?: { kind: Acting['kind']; id: string } } | { live: LiveItBookings }) {
  if ('live' in props) return <ItBookings {...props.live} />;
  const acting = props.acting ? props.rows.find((b) => b.id === props.acting!.id) : undefined;
  return <ItBookings state="ready" onRetry={() => undefined} rows={props.rows} today={props.today} onApprove={ok} onDecline={ok} onCancel={ok} onHandOver={ok} onTakeBack={ok} onOpenAsset={() => undefined} show={props.show} person={props.person} acting={acting ? { kind: props.acting!.kind, b: acting } : undefined} />;
}

function ItBookings({ state, onRetry, today, rows, onApprove, onDecline, onCancel, onHandOver, onTakeBack, onOpenAsset, show: initialShow, person: initialPerson, acting: initialActing }: LiveItBookings & { show?: Show; person?: string; acting?: Acting }) {
  const { toast } = useToast();
  const [person, setPerson] = useState<string | null>(initialPerson ?? null);
  const [show, setShow] = useState<Show>(initialShow ?? (initialPerson ? 'all' : rows.some((b) => b.status === 'pending') ? 'waiting' : 'coming'));
  const [acting, setActing] = useState<Acting | null>(initialActing ?? null);
  const [text, setText] = useState(initialActing?.kind === 'hand' || initialActing?.kind === 'back' ? 'Good' : '');
  const [back, setBack] = useState<TakeBackInput['status']>('in_stock');
  const people = [...new Map(rows.filter((b) => b.employeeId).map((b) => [b.employeeId!, { value: b.employeeId!, label: b.person }])).values()].sort((x, y) => x.label.localeCompare(y.label));
  const mine = person ? rows.filter((b) => b.employeeId === person) : rows;
  const shown = mine.filter(SHOW[show]);
  const count = (s: Show) => mine.filter(SHOW[s]).length;
  const act = (kind: Acting['kind'], b: ItBookingRow) => (setText(kind === 'hand' || kind === 'back' ? 'Good' : ''), setBack('in_stock'), setActing({ kind, b }));
  const cols: TableColumn<ItBookingRow>[] = [
    { key: 'asset', header: 'Asset', value: (b) => b.tag, render: (b) => <span>{onOpenAsset ? <Link href={`#${b.assetId}`} onClick={(e) => (e.preventDefault(), onOpenAsset(b.assetId))}>{b.tag}</Link> : b.tag}<Text as="div" size="sm" tone="secondary">{b.asset}</Text></span>, width: 200 },
    { key: 'person', header: 'Person', value: (b) => b.person, width: 170 },
    { key: 'dates', header: 'Dates', value: (b) => b.startsOn, render: (b) => rangeText(b.startsOn, b.endsOn), width: 210 },
    { key: 'status', header: 'Status', value: (b) => b.status, render: (b) => <span><BookingBadge b={b} />{b.reason && <Text as="div" size="sm" tone="secondary">{b.reason}</Text>}</span>, width: 200 },
    { key: 'purpose', header: 'Purpose', value: (b) => b.purpose ?? '—', width: 180, optional: true },
  ];
  const buttons = (b: ItBookingRow) => {
    if (!b.canManage) return null;
    if (b.status === 'pending')
      return (
        <>
          <Button size="sm" variant="primary" onClick={() => void onApprove(b.id).then(() => toast({ tone: 'success', title: `Approved: ${b.tag} for ${b.person}.` }), (e: Error) => toast({ tone: 'error', title: e.message }))}>Approve</Button>
          <Button size="sm" onClick={() => act('decline', b)}>Decline</Button>
        </>
      );
    if (b.status === 'booked')
      return (
        <>
          {b.startsOn <= today && b.endsOn >= today && <Button size="sm" variant="primary" onClick={() => act('hand', b)}>Hand over</Button>}
          <Button size="sm" onClick={() => act('cancel', b)}>Cancel</Button>
        </>
      );
    if (b.status === 'out') return <Button size="sm" variant="primary" onClick={() => act('back', b)}>Take back</Button>;
    return null;
  };
  const DIALOG: Record<Acting['kind'], { title: (b: ItBookingRow) => string; consequence: string; confirm: string; label: string; helper: string; run: (b: ItBookingRow) => Promise<unknown>; done: (b: ItBookingRow) => string }> = {
    decline: { title: (b) => `Decline ${b.person}'s booking of ${b.tag}?`, consequence: 'They are told with your reason. A repeat is declined as a whole.', confirm: 'Decline', label: 'Reason', helper: 'They see it.', run: (b) => onDecline(b.id, text.trim()), done: (b) => `Declined: ${b.tag} for ${b.person}.` },
    cancel: { title: (b) => `Cancel ${b.person}'s booking of ${b.tag}?`, consequence: 'They are told with your reason. The days become free.', confirm: 'Cancel booking', label: 'Reason', helper: 'They see it.', run: (b) => onCancel(b.id, text.trim()), done: (b) => `Cancelled: ${b.tag} for ${b.person}.` },
    hand: { title: (b) => `Hand ${b.tag} over to ${b.person}?`, consequence: 'The register shows it with them until you take it back.', confirm: 'Hand over', label: 'Condition', helper: 'For example: good, with charger.', run: (b) => onHandOver(b.id, text.trim()), done: (b) => `${b.tag} handed over to ${b.person}.` },
    back: { title: (b) => `Take ${b.tag} back from ${b.person}?`, consequence: 'The register records the return and the booking ends.', confirm: 'Take back', label: 'Condition', helper: 'For example: good, or screen cracked.', run: (b) => onTakeBack(b, { condition: text.trim(), status: back }), done: (b) => `${b.tag} taken back from ${b.person}.` },
  };
  const d = acting ? DIALOG[acting.kind] : null;
  const short = acting && (acting.kind === 'hand' || acting.kind === 'back') ? text.trim().length < 2 : !text.trim();
  return (
    <PeopleFrame active="Assets">
      <PageHeader title="Asset bookings" description="Bookings of the bookable assets you look after: approve, hand over, take back. Pick a person for their loan report." />
      {state === 'no-access' ? (
        <NoAccessState what="the asset bookings" grantedBy="your IT or HR admin" />
      ) : state === 'error' ? (
        <ErrorState title="We couldn't load the bookings" description="Check your connection and try again." onRetry={onRetry} />
      ) : (
        <Card>
          <div className="yx-set-stack">
            <div className="yx-lif-grid">
              <FormField id="bk-show" label="Show">
                <Segment<Show> label="Show" value={show} onChange={setShow} options={[{ value: 'waiting', label: `Waiting (${count('waiting')})` }, { value: 'coming', label: `Booked (${count('coming')})` }, { value: 'out', label: `Handed over (${count('out')})` }, { value: 'past', label: 'Past' }, { value: 'all', label: 'All' }]} />
              </FormField>
              <FormField id="bk-person" label="Person" optional helper="Their past, current and future bookings.">
                <Select aria-label="Person" value={person} onChange={(x) => (setPerson(x), x && setShow('all'))} options={people} searchable searchPlaceholder="Search name" clearable />
              </FormField>
            </div>
            <DataTable
              label="Asset bookings"
              columns={cols}
              rows={shown}
              getRowId={(b) => b.id}
              state={state === 'loading' ? 'loading' : 'ready'}
              rowButtons={buttons}
              empty={<EmptyState title="No bookings here" description="Make an asset bookable on its page (Bookings tab); employees book it from Me › Asset bookings." />}
            />
          </div>
        </Card>
      )}
      {acting && d && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setActing(null)}
          title={d.title(acting.b)}
          consequence={`${rangeText(acting.b.startsOn, acting.b.endsOn)}. ${d.consequence}`}
          confirmLabel={d.confirm}
          destructive={acting.kind === 'decline' || acting.kind === 'cancel'}
          confirmDisabled={short}
          onConfirm={async () => {
            await d.run(acting.b);
            toast({ tone: 'success', title: d.done(acting.b) });
            setActing(null);
          }}
        >
          <div className="yx-set-stack">
            <FormField id="bk-text" label={d.label} required helper={d.helper}>
              <TextField value={text} onChange={setText} maxLength={acting.kind === 'hand' || acting.kind === 'back' ? 200 : 300} />
            </FormField>
            {acting.kind === 'back' && (
              <FormField id="bk-back" label="Goes to">
                <Segment<TakeBackInput['status']> label="Goes to" value={back} onChange={setBack} options={[{ value: 'in_stock', label: 'In stock' }, { value: 'in_repair', label: 'In repair' }, { value: 'lost', label: 'Lost' }]} />
              </FormField>
            )}
          </div>
        </ConfirmDialog>
      )}
    </PeopleFrame>
  );
}
