// IT assets part 4 (founder answer 2718): software licences (People › Software licences; Helpdesk › IT licences). A
// licence names the software, version, an optional supplier and place, the seats bought, an expiry date, a cost (money:
// managers of its place and Finance only) and an "allow over quota" switch. Seats go to a person or a device and are
// counted (no install scan). The list shows a full licence in amber and one over quota in red; a licence opens in a
// drawer with its seats, where asset managers give and free seats. A leaver's seat is on their exit clearance list.
import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Badge } from '../../components/display';
import { Card, DescriptionList, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField } from '../../components/field';
import { CurrencyField, NumberField, TextField } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { Text } from '../../components/foundations';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { PeopleFrame, Segment } from './people-kit';

type Choice = { value: string; label: string };

export interface LicenceHolder {
  seatId: string;
  kind: 'person' | 'device';
  /** The person's name, or the device's name. */
  name: string;
  /** The device's tag (null for a person). */
  tag: string | null;
  assetId: string | null;
  givenOn: string;
  /** The person is leaving: the seat is on their exit clearance list. */
  leaving: boolean;
}
export interface LicenceRow {
  id: string;
  software: string;
  softwareVersion: string | null;
  supplierId: string | null;
  supplier: string | null;
  legalEntityId: string | null;
  locationId: string | null;
  /** The location (or legal entity) name; null: company-wide. */
  place: string | null;
  seats: number;
  /** Seats in use (given and not freed), including the ones only counted. */
  used: number;
  /** null: it does not expire. */
  expiresOn: string | null;
  /** Answer 2711: left out for whoever may not see money. */
  cost?: string | null;
  allowOverQuota: boolean;
  /** The seats the viewer sees; seats on devices at other places only as hiddenSeats. */
  holders: LicenceHolder[];
  hiddenSeats: number;
  canManage: boolean;
  version: number;
}
export interface LicenceInput {
  software: string;
  softwareVersion: string | null;
  supplierId: string | null;
  legalEntityId: string | null;
  locationId: string | null;
  seats: number;
  expiresOn: string | null;
  cost: string | null;
  allowOverQuota: boolean;
  version?: number;
}
export type SeatTarget = { employeeId: string } | { assetId: string };
export interface LiveLicences {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  today: string;
  rows: LicenceRow[];
  /** false hides the Cost column and field. */
  money?: boolean;
  /** asset.manage at any scope: Add licence. */
  canAdd: boolean;
  /** The active suppliers, places, current employees and the devices the viewer sees, for the forms. */
  suppliers: Choice[];
  entities: Choice[];
  locations: (Choice & { entityId: string })[];
  people: Choice[];
  devices: Choice[];
  onSave: (id: string | null, input: LicenceInput) => Promise<unknown>;
  onGiveSeat: (licenceId: string, to: SeatTarget) => Promise<unknown>;
  onFreeSeat: (licenceId: string, seatId: string, reason: string | null) => Promise<unknown>;
  onOpenAsset?: (id: string) => void;
  /** A licence to open at once (from an alert or an asset page). */
  open?: string | null;
}
type Show = 'current' | 'expired';

const day = (s: string) => new Date(`${s}T00:00:00`);
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inr = (s: string) => `₹${Number(s).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const seatsText = (n: number) => `${n} ${n === 1 ? 'seat' : 'seats'}`;
export const licenceName = (l: { software: string; softwareVersion: string | null }) => [l.software, l.softwareVersion].filter(Boolean).join(' ');
const expired = (l: LicenceRow, today: string) => l.expiresOn != null && l.expiresOn < today;
/** Answer 2718: red when more seats are in use than bought, amber when every seat is in use. */
function QuotaBadge({ l }: { l: Pick<LicenceRow, 'seats' | 'used'> }) {
  if (l.used > l.seats) return <Badge tone="danger">{`Over quota by ${l.used - l.seats}`}</Badge>;
  if (l.used === l.seats) return <Badge tone="warning">All in use</Badge>;
  return null;
}

/** The licence list: the designed view (sample data) or, with `live`, the company's licences. */
export function AssetLicencesScreen(props: { rows: LicenceRow[]; today: string; money?: boolean; canAdd?: boolean; show?: Show; open?: string; editing?: 'new' | string; giving?: string } | { live: LiveLicences }) {
  if ('live' in props) return <LicenceList {...props.live} />;
  const ok = () => Promise.resolve();
  return <LicenceList state="ready" onRetry={() => undefined} rows={props.rows} today={props.today} money={props.money} canAdd={props.canAdd ?? true} {...SAMPLE_FORM} onSave={ok} onGiveSeat={ok} onFreeSeat={ok} onOpenAsset={() => undefined} open={props.open} show={props.show} editing={props.editing} giving={props.giving} />;
}

/** The design's form choices (sample data). */
const SAMPLE_FORM = {
  suppliers: [{ value: 's1', label: 'Dell India Pvt Ltd' }, { value: 's2', label: 'Redington Ltd' }],
  entities: [{ value: 'e1', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }],
  locations: [{ value: 'l1', label: 'Hosur plant', entityId: 'e1' }, { value: 'l2', label: 'Chennai office', entityId: 'e1' }],
  people: [{ value: 'p1', label: 'Meera Iyer' }, { value: 'p2', label: 'Arjun Kulkarni' }, { value: 'p3', label: 'Kavya Reddy' }],
  devices: [{ value: 'a1', label: 'LT-0418 · Dell Latitude 5440' }, { value: 'a2', label: 'LT-0419 · Dell Latitude 5440' }],
};

function LicenceList({ state, onRetry, today, rows, money, canAdd, suppliers, entities, locations, people, devices, onSave, onGiveSeat, onFreeSeat, onOpenAsset, open: initialOpen, show: initialShow = 'current', editing: initialEditing, giving: initialGiving }: LiveLicences & { show?: Show; editing?: 'new' | string; giving?: string }) {
  const [show, setShow] = useState<Show>(initialShow);
  const [viewing, setViewing] = useState<string | null>(initialOpen ?? initialGiving ?? null);
  const [editing, setEditing] = useState<'new' | string | null>(initialEditing ?? null);
  const [giving, setGiving] = useState<string | null>(initialGiving ?? null);
  const shown = rows.filter((l) => expired(l, today) === (show === 'expired'));
  const viewed = viewing ? rows.find((l) => l.id === viewing) ?? null : null;
  const edited = editing && editing !== 'new' ? rows.find((l) => l.id === editing) ?? null : null;
  const given = giving ? rows.find((l) => l.id === giving) ?? null : null;
  const cols: TableColumn<LicenceRow>[] = [
    { key: 'software', header: 'Software', value: (l) => licenceName(l), render: (l) => <Link href={`#${l.id}`} onClick={(e) => (e.preventDefault(), setViewing(l.id))}>{licenceName(l)}</Link>, width: 220 },
    { key: 'supplier', header: 'Supplier', value: (l) => l.supplier ?? '—', width: 180 },
    { key: 'place', header: 'Place', value: (l) => l.place ?? 'Company-wide', width: 150 },
    {
      key: 'seats',
      header: 'Seats in use',
      value: (l) => l.used,
      render: (l) => (
        <span>
          {`${l.used} of ${l.seats}`}
          <Text as="div" size="sm"><QuotaBadge l={l} /></Text>
        </span>
      ),
      width: 150,
    },
    {
      key: 'expiresOn',
      header: 'Expires',
      value: (l) => l.expiresOn ?? '',
      render: (l) => (l.expiresOn ? <span>{formatDate(day(l.expiresOn))}{expired(l, today) && <Text as="div" size="sm"><Badge tone="danger">Expired</Badge></Text>}</span> : <Text tone="secondary">Does not expire</Text>),
      width: 150,
    },
    ...(money === false ? [] : [{ key: 'cost', header: 'Cost', type: 'money', value: (l) => (l.cost ? Number(l.cost) : null), width: 130 } as TableColumn<LicenceRow>]),
  ];
  return (
    <PeopleFrame active="Assets">
      <PageHeader
        title="Software licences"
        description="The seats you bought and who or which device has them. Seats are counted here; nothing is scanned on the devices. A leaver's seats join their exit clearance."
        actions={canAdd ? <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add licence</Button> : undefined}
      />
      {state === 'no-access' ? (
        <NoAccessState what="the software licences" grantedBy="your IT or HR admin" />
      ) : state === 'error' ? (
        <ErrorState title="We couldn't load the licences" description="Check your connection and try again." onRetry={onRetry} />
      ) : (
        <Card>
          <div className="yx-set-stack">
            <Segment<Show> label="Show" value={show} onChange={setShow} options={[{ value: 'current', label: 'Current' }, { value: 'expired', label: 'Expired' }]} />
            <DataTable
              label="Software licences"
              columns={cols}
              rows={shown}
              getRowId={(l) => l.id}
              state={state === 'loading' ? 'loading' : 'ready'}
              empty={show === 'expired' ? <EmptyState title="No expired licences" description="A licence past its expiry date shows here." /> : <EmptyState title="No licences yet" description="Add your software licences to count their seats and be told before they expire." action={canAdd ? <Button onClick={() => setEditing('new')}>Add licence</Button> : undefined} />}
            />
          </div>
        </Card>
      )}
      {viewed && !editing && !giving && <LicenceView l={viewed} today={today} onClose={() => setViewing(null)} onEdit={viewed.canManage ? () => setEditing(viewed.id) : undefined} onGive={viewed.canManage ? () => setGiving(viewed.id) : undefined} onFree={viewed.canManage ? (seatId, reason) => onFreeSeat(viewed.id, seatId, reason) : undefined} onOpenAsset={onOpenAsset} />}
      {given && <GiveSeatDrawer key={given.id} l={given} people={people} devices={devices} onClose={() => setGiving(null)} onGive={(to) => onGiveSeat(given.id, to)} />}
      {(editing === 'new' || edited) && <LicenceForm key={editing} l={edited} money={money !== false} suppliers={suppliers} entities={entities} locations={locations} onClose={() => setEditing(null)} onSave={onSave} />}
    </PeopleFrame>
  );
}

function LicenceView({ l, today, onClose, onEdit, onGive, onFree, onOpenAsset }: { l: LicenceRow; today: string; onClose: () => void; onEdit?: () => void; onGive?: () => void; onFree?: (seatId: string, reason: string | null) => Promise<unknown>; onOpenAsset?: (id: string) => void }) {
  const { toast } = useToast();
  const [freeing, setFreeing] = useState<LicenceHolder | null>(null);
  const [reason, setReason] = useState('');
  const cols: TableColumn<LicenceHolder>[] = [
    {
      key: 'name',
      header: 'Given to',
      value: (h) => h.name,
      render: (h) =>
        h.kind === 'device' ? (
          <span>{h.assetId && onOpenAsset ? <Link href={`#${h.assetId}`} onClick={(e) => (e.preventDefault(), onOpenAsset(h.assetId!))}>{h.tag}</Link> : h.tag}<Text as="div" size="sm" tone="secondary">{h.name}</Text></span>
        ) : (
          <span>{h.name}{h.leaving && <Text as="div" size="sm"><Badge tone="warning">Leaving: on their clearance</Badge></Text>}</span>
        ),
      width: 240,
    },
    { key: 'kind', header: 'Kind', value: (h) => (h.kind === 'device' ? 'Device' : 'Person'), width: 100 },
    { key: 'givenOn', header: 'Given on', type: 'date', value: (h) => day(h.givenOn), width: 130 },
  ];
  const over = l.used - l.seats;
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={licenceName(l)}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {onEdit && <Button icon={Pencil} onClick={onEdit}>Edit licence</Button>}
          {onGive && <Button variant="primary" icon={Plus} onClick={onGive}>Give a seat</Button>}
        </>
      }
    >
      <div className="yx-set-stack">
        {over > 0 && <InlineAlert tone="danger" title={`${l.used} seats are in use: ${over} more than the ${l.seats} bought.`}>{l.allowOverQuota ? 'Over quota is allowed on this licence. Buy more seats or free some.' : 'Free some seats or buy more.'}</InlineAlert>}
        {over === 0 && <InlineAlert tone="warning" title={`All ${seatsText(l.seats)} are in use.`}>{l.allowOverQuota ? 'Over quota is allowed: you can still give a seat.' : 'Free a seat, add seats or allow over quota to give another.'}</InlineAlert>}
        {expired(l, today) && <InlineAlert tone="danger" title={`Expired on ${formatDate(day(l.expiresOn!))}.`} />}
        <DescriptionList
          columns={2}
          items={[
            { label: 'Supplier', value: l.supplier ?? '—' },
            { label: 'Place', value: l.place ?? 'Company-wide' },
            { label: 'Seats', value: `${l.used} in use of ${l.seats}` },
            { label: 'Over quota', value: l.allowOverQuota ? 'Allowed' : 'Not allowed' },
            { label: 'Expires', value: l.expiresOn ? formatDate(day(l.expiresOn)) : 'Does not expire' },
            ...(l.cost === undefined ? [] : [{ label: 'Cost', value: l.cost ? inr(l.cost) : '—' }]),
          ]}
        />
        {l.holders.length ? (
          <DataTable
            label="Seats in use"
            columns={cols}
            rows={l.holders}
            getRowId={(h) => h.seatId}
            state="ready"
            rowButtons={onFree ? (h) => <Button size="sm" onClick={() => (setReason(''), setFreeing(h))}>Free seat</Button> : undefined}
          />
        ) : (
          <InlineAlert tone="info" title={l.hiddenSeats ? 'No seats you see are in use.' : 'No seats are in use yet.'} />
        )}
        {l.hiddenSeats > 0 && <InlineAlert tone="info" title={`${l.hiddenSeats} more ${l.hiddenSeats === 1 ? 'seat is' : 'seats are'} on devices at places you do not look after.`} />}
      </div>
      {freeing && onFree && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setFreeing(null)}
          title={`Free the seat ${freeing.kind === 'device' ? `on ${freeing.tag}` : `of ${freeing.name}`}?`}
          consequence={freeing.leaving ? 'The seat goes back to the licence and their clearance item is signed off.' : 'The seat goes back to the licence. You can give it again later.'}
          confirmLabel="Free seat"
          onConfirm={async () => {
            await onFree(freeing.seatId, reason.trim() || null);
            toast({ tone: 'success', title: `Seat freed: ${licenceName(l)}.` });
            setFreeing(null);
          }}
        >
          <FormField id="lc-free-reason" label="Reason" optional helper="For example: laptop wiped, or no longer needed.">
            <TextField value={reason} onChange={setReason} maxLength={200} />
          </FormField>
        </ConfirmDialog>
      )}
    </Drawer>
  );
}

function GiveSeatDrawer({ l, people, devices, onClose, onGive }: { l: LicenceRow; people: Choice[]; devices: Choice[]; onClose: () => void; onGive: (to: SeatTarget) => Promise<unknown> }) {
  const { toast } = useToast();
  const [kind, setKind] = useState<'person' | 'device'>('person');
  const [who, setWho] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Answer 2718: beyond the seats bought, a seat is refused unless the licence allows over quota.
  const full = l.used >= l.seats;
  const blocked = full && !l.allowOverQuota;
  const missing = who ? null : kind === 'person' ? 'Choose the person.' : 'Choose the device.';
  const give = async () => {
    setTried(true);
    if (blocked || missing) return;
    setBusy(true);
    setError(null);
    try {
      await onGive(kind === 'person' ? { employeeId: who! } : { assetId: who! });
      toast({ tone: 'success', title: `Seat of ${licenceName(l)} given.` });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Give a seat of ${licenceName(l)}`}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void give()}>
            Give seat
          </Button>
        </>
      }
    >
      <div className="yx-set-stack">
        {error && (
          <InlineAlert tone="danger" title="Not given">
            {error}
          </InlineAlert>
        )}
        {tried && blocked && <InlineAlert tone="danger" title={`All ${seatsText(l.seats)} are in use.`}>Free a seat, add seats, or allow over quota on the licence.</InlineAlert>}
        {!tried && full && <InlineAlert tone={l.allowOverQuota ? 'warning' : 'info'} title={l.allowOverQuota ? `All ${seatsText(l.seats)} are in use. This seat goes over quota.` : `All ${seatsText(l.seats)} are in use.`} />}
        <Text as="p" tone="secondary">{`${l.used} of ${seatsText(l.seats)} in use.`}</Text>
        <FormField id="lc-kind" label="Give it to">
          <Segment<'person' | 'device'> label="Give it to" value={kind} onChange={(x) => (setKind(x), setWho(null))} options={[{ value: 'person', label: 'A person' }, { value: 'device', label: 'A device' }]} />
        </FormField>
        {kind === 'person' ? (
          <FormField id="lc-person" label="Person" required helper="Current employees. If they are leaving, the seat joins their exit clearance." error={tried ? missing : null}>
            <Select aria-label="Person" value={who} onChange={setWho} options={people} searchable searchPlaceholder="Search name" />
          </FormField>
        ) : (
          <FormField id="lc-device" label="Device" required helper="Assets from the register you see." error={tried ? missing : null}>
            <Select aria-label="Device" value={who} onChange={setWho} options={devices} searchable searchPlaceholder="Search tag or name" />
          </FormField>
        )}
      </div>
    </Drawer>
  );
}

function LicenceForm({ l, money, suppliers, entities, locations, onClose, onSave }: { l: LicenceRow | null; money: boolean; suppliers: Choice[]; entities: Choice[]; locations: (Choice & { entityId: string })[]; onClose: () => void; onSave: LiveLicences['onSave'] }) {
  const { toast } = useToast();
  // A supplier retired since stays choosable for the licence that already names it.
  const supplierChoices = l?.supplierId && !suppliers.some((x) => x.value === l.supplierId) ? [{ value: l.supplierId, label: l.supplier ?? 'Supplier' }, ...suppliers] : suppliers;
  const [software, setSoftware] = useState(l?.software ?? '');
  const [version, setVersion] = useState(l?.softwareVersion ?? '');
  const [supplier, setSupplier] = useState<string | null>(l?.supplierId ?? null);
  const [entity, setEntity] = useState<string | null>(l ? l.legalEntityId : entities.length === 1 ? entities[0].value : null);
  const [location, setLocation] = useState<string | null>(l?.locationId ?? null);
  const [seats, setSeats] = useState<number | null>(l?.seats ?? null);
  const [expires, setExpires] = useState<Date | null>(l?.expiresOn ? day(l.expiresOn) : null);
  const [cost, setCost] = useState<number | null>(l?.cost ? Number(l.cost) : null);
  const [over, setOver] = useState(l?.allowOverQuota ?? false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const used = l?.used ?? 0;
  const problems = {
    software: software.trim() ? null : 'Enter the software.',
    seats: seats != null && Number.isInteger(seats) && seats >= 1 && seats <= 100000 ? (!over && seats < used ? `${used} seats are in use. Keep at least ${used}, or allow over quota.` : null) : 'Enter 1 to 100000 seats.',
  };
  const shown = (x: keyof typeof problems) => (tried ? problems[x] : null);
  const save = async () => {
    setTried(true);
    if (Object.values(problems).some(Boolean)) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(l?.id ?? null, { software: software.trim(), softwareVersion: version.trim() || null, supplierId: supplier, legalEntityId: entity, locationId: location, seats: seats!, expiresOn: expires ? keyOf(expires) : null, cost: money ? (cost == null ? null : cost.toFixed(2)) : (l?.cost ?? null), allowOverQuota: over, ...(l ? { version: l.version } : {}) });
      toast({ tone: 'success', title: `Licence ${[software.trim(), version.trim()].filter(Boolean).join(' ')} saved.` });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={l ? `Edit ${licenceName(l)}` : 'Add licence'}
      size="lg"
      dirty={Boolean(software || seats)}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {l ? 'Save licence' : 'Add licence'}
          </Button>
        </>
      }
    >
      <div className="yx-set-stack">
        {error && (
          <InlineAlert tone="danger" title="Not saved">
            {error}
          </InlineAlert>
        )}
        <div className="yx-lif-grid">
          <FormField id="lc-software" label="Software" required helper="For example Microsoft 365 or AutoCAD." error={shown('software')}>
            <TextField value={software} onChange={setSoftware} maxLength={120} />
          </FormField>
          <FormField id="lc-version" label="Version" optional helper="For example E3 or 2026.">
            <TextField value={version} onChange={setVersion} maxLength={60} />
          </FormField>
          <FormField id="lc-supplier" label="Supplier" optional helper="The list is in People › Asset suppliers.">
            <Select aria-label="Supplier" value={supplier} onChange={setSupplier} options={supplierChoices} clearable />
          </FormField>
          <FormField id="lc-seats" label="Seats" required helper={l ? `${used} in use now.` : 'How many people or devices may use it.'} error={shown('seats')}>
            <NumberField value={seats} onChange={setSeats} min={1} max={100000} suffix="seats" />
          </FormField>
          <FormField id="lc-entity" label="Legal entity" optional helper="Its asset managers are told before it expires. Empty: company-wide.">
            <Select aria-label="Legal entity" value={entity} onChange={(x) => { setEntity(x); setLocation(null); }} options={entities} clearable />
          </FormField>
          <FormField id="lc-location" label="Location" optional>
            <Select aria-label="Location" value={location} onChange={setLocation} options={locations.filter((x) => x.entityId === entity)} disabled={!entity} clearable />
          </FormField>
          <FormField id="lc-expires" label="Expires on" optional helper="Empty: it does not expire.">
            <DatePicker value={expires} onChange={setExpires} />
          </FormField>
          {money && (
            <FormField id="lc-cost" label="Cost" optional>
              <CurrencyField value={cost} onChange={setCost} allowPaise />
            </FormField>
          )}
        </div>
        <Checkbox checked={over} onChange={setOver} label="Allow over quota" description="Seats can still be given when all are in use. The list then shows the licence in red." />
      </div>
    </Drawer>
  );
}
