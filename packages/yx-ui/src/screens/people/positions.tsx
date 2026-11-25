// Enterprise E1 positions (Oracle O1-O6, O8, O9; founder answers 2340, 2341, 2641-2643):
//   POS-01 Positions list      seats with headcount, filled and vacant; filters; new seat, mass update
//   POS-02 Position record     details, people in the seat, seats under it, dated history, requisitions, changes
//   POS-03 Switch positions on one seat per group of identical jobs, sent by one HR person and approved by another
//   POS-04 Seat change drawer  new seat, copy, change, freeze / activate / eliminate, and the mass update (preview first)
// Every change waits for approval by someone else; the screens only lay out what the API checks again.
import { useMemo, useState } from 'react';
import { Copy, Plus, Users } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Card, ObjectHeader, PageHeader } from '../../components/shell';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { MultiSelect, Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { Segment } from '../../components/segment';
import { Drawer } from '../../components/drawer';
import { MenuItem } from '../../components/menu';
import { PlainTable } from '../../components/plain-table';
import { DataTable, type TableColumn } from '../../components/table';
import { useToastIfAny } from '../../components/notify';
import { formatDate, formatINR } from '../../lib/format';
import { ListSkeleton, PeopleFrame } from './people-kit';

export type SeatStatus = 'proposed' | 'active' | 'frozen' | 'eliminated';
export interface Named {
  id: string;
  name: string;
}
export interface SeatRow {
  id: string;
  code: string;
  title: string;
  status: SeatStatus;
  legalEntity: Named | null;
  department: Named | null;
  location: Named | null;
  designation: Named | null;
  grades: Named[];
  fte: number;
  headcount: number;
  filled: number;
  vacant: number;
  supervisor: { id: string; code: string; title: string } | null;
  costCentre: Named | null;
  pendingChange: boolean;
  /** Only with pay.range.view. */
  entrySalary?: number | null;
  /** Only with ats.headcount.manage: the approved plan budget for the seat this financial year. */
  budget?: number | null;
}
export interface SeatList {
  asOf: string;
  enabled: boolean;
  canManage: boolean;
  totals: { seats: number; headcount: number; filled: number; vacant: number };
  rows: SeatRow[];
}
export interface SeatValues {
  title: string;
  departmentId: string;
  locationId: string;
  designationId: string;
  gradeIds: string[];
  defaultGradeId: string | null;
  fte: number;
  headcount: number;
  supervisorPositionId: string | null;
  costCentreId: string | null;
  entrySalary: number | null;
}
export type SeatChangeKind = 'create' | 'change' | 'freeze' | 'activate' | 'eliminate';
export interface SeatChangeInput {
  kind: SeatChangeKind;
  positionId?: string;
  legalEntityId?: string;
  effectiveOn: string;
  values?: Partial<SeatValues> & { status?: 'proposed' | 'active' };
}
export interface SeatVersion {
  validFrom: string;
  status: SeatStatus;
  title: string;
  department: Named | null;
  location: Named | null;
  designation: Named | null;
  grades: Named[];
  fte: number;
  headcount: number;
  costCentre: Named | null;
  entrySalary?: number | null;
}
export interface SeatRecord {
  id: string;
  code: string;
  legalEntity: Named | null;
  asOf: string;
  current: SeatVersion & { values: SeatValues };
  supervisor: { id: string; code: string; title: string } | null;
  reports: { id: string; code: string; title: string }[];
  filled: number;
  vacant: number;
  incumbents: { employeeId: string; name: string; code: string; since: string }[];
  history: SeatVersion[];
  requisitions: { id: string; title: string; status: string; headcount: number | null }[];
  changes: { id: string; batchId: string; kind: string; effectiveOn: string; status: string; reason: string; createdAt: string; mine: boolean }[];
  canManage: boolean;
}
type Option = { value: string; label: string };
/** The choices a seat form needs (the app loads them from the org masters and the seat list). */
export interface SeatOptions {
  entities: Option[];
  departments: Option[];
  locations: (Option & { entityId: string })[];
  designations: Option[];
  grades: Option[];
  costCentres: (Option & { entityId: string })[];
  seats: Option[];
}
export interface SwitchOnData {
  enabled: boolean;
  date: string;
  people: number;
  seats: { key: string; title: string; department: string | null; location: string | null; headcount: number; people: string[]; supervisorKey: string | null }[];
  plan: { batchId: string; effectiveOn: string; reason: string; mine: boolean; sentAt: string } | null;
  result: { seats: number; linked: number; failed: { employeeId: string; name: string; reason: string }[] } | null;
  canSend: boolean;
  canApprove: boolean;
}
type LoadState = 'loading' | 'ready' | 'error' | 'forbidden';

const STATUS: Record<SeatStatus, [string, BadgeTone]> = { proposed: ['Proposed', 'info'], active: ['Active', 'success'], frozen: ['Frozen', 'warning'], eliminated: ['Eliminated', 'neutral'] };
const KIND_WORD: Record<string, string> = { create: 'New seat', change: 'Change', freeze: 'Freeze', activate: 'Activate', eliminate: 'Eliminate', switch_on: 'Switch on' };
const CHANGE_STATUS: Record<string, [string, BadgeTone]> = { submitted: ['Waiting for approval', 'warning'], approved: ['Approved', 'success'], rejected: ['Turned down', 'danger'], withdrawn: ['Withdrawn', 'neutral'] };
export const seatStatusBadge = (s: SeatStatus) => <Badge tone={STATUS[s][1]}>{STATUS[s][0]}</Badge>;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** An ISO day (or timestamp) as "25 Nov 2026". */
const day = (s: string) => formatDate(new Date(`${s.slice(0, 10)}T00:00:00`));
const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

/* ------------------------------------------------------------------ POS-04 seat change drawer */

export interface SeatDrawerProps {
  open: boolean;
  onClose: () => void;
  /** create (also "copy" with a seat to start from), change, freeze, activate or eliminate. */
  kind: SeatChangeKind;
  seat?: { id: string; code: string; title: string; legalEntityId: string | null; values: SeatValues } | null;
  options: SeatOptions;
  today: Date;
  onSend: (items: SeatChangeInput[], reason: string) => Promise<void>;
}

const EMPTY: SeatValues = { title: '', departmentId: '', locationId: '', designationId: '', gradeIds: [], defaultGradeId: null, fte: 1, headcount: 1, supervisorPositionId: null, costCentreId: null, entrySalary: null };

/** POS-04: one seat's change. Everything waits for another person's approval; the reason goes with it. */
export function SeatChangeDrawer({ open, onClose, kind, seat, options, today, onSend }: SeatDrawerProps) {
  const [v, setV] = useState<SeatValues>(seat?.values ?? EMPTY);
  const [entity, setEntity] = useState<string | null>(seat?.legalEntityId ?? options.entities[0]?.value ?? null);
  const [status, setStatus] = useState<'active' | 'proposed'>('active');
  const [from, setFrom] = useState<Date | null>(today);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const toast = useToastIfAny();
  const form = kind === 'create' || kind === 'change';
  const set = <K extends keyof SeatValues>(k: K, x: SeatValues[K]) => setV((o) => ({ ...o, [k]: x }));
  const errors = {
    title: form && (v.title.trim().length < 2 ? 'Give the seat a title (2 characters or more).' : null),
    department: form && !v.departmentId ? 'Choose the department.' : null,
    location: form && !v.locationId ? 'Choose the location.' : null,
    designation: form && !v.designationId ? 'Choose the designation.' : null,
    entity: kind === 'create' && !entity ? 'Choose the legal entity.' : null,
    from: !from ? 'Choose the day it starts.' : iso(from) < iso(today) ? 'Choose today or a later day.' : null,
    reason: reason.trim().length < 10 ? 'Say why, in 10 characters or more.' : null,
  };
  const blocked = Object.values(errors).some(Boolean);
  const title = kind === 'create' ? (seat ? `Copy ${seat.code}` : 'New seat') : `${KIND_WORD[kind]} ${seat?.code ?? ''}`;
  const send = async () => {
    setTried(true);
    if (blocked) return;
    setBusy(true);
    setFailed(null);
    try {
      const item: SeatChangeInput =
        kind === 'create'
          ? { kind, legalEntityId: entity!, effectiveOn: iso(from!), values: { ...v, title: v.title.trim(), status } }
          : form
            ? { kind, positionId: seat!.id, effectiveOn: iso(from!), values: { ...v, title: v.title.trim() } }
            : { kind, positionId: seat!.id, effectiveOn: iso(from!) };
      await onSend([item], reason.trim());
      toast?.toast({ title: 'Sent for approval', description: 'Someone else approves it before it counts.' });
      onClose();
    } catch (e) {
      setFailed((e as Error).message || 'It could not be sent. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const err = (k: keyof typeof errors) => (tried && errors[k]) || undefined;
  const locations = options.locations.filter((l) => !entity || l.entityId === entity);
  const ccs = options.costCentres.filter((c) => !entity || c.entityId === entity);
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      subtitle={seat && kind !== 'create' ? seat.title : 'Approved by someone else before it counts'}
      size={form ? 'lg' : 'md'}
      dirty={reason.length > 0}
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void send()}>
            Send for approval
          </Button>
        </>
      }
    >
      {kind === 'eliminate' && <InlineAlert tone="warning" title="An eliminated seat cannot come back. Move everyone out of it first." />}
      {kind === 'freeze' && <InlineAlert tone="info" title="A frozen seat keeps its people, but takes no new hires or requisitions until it is activated again." />}
      {kind === 'create' && (
        <FieldRow>
          <FormField label="Legal entity" required error={err('entity')}>
            <Select options={options.entities} value={entity} onChange={(x) => setEntity(x)} />
          </FormField>
          <FormField label="Starts as">
            <Segment label="Starts as" options={[{ value: 'active', label: 'Active' }, { value: 'proposed', label: 'Proposed' }]} value={status} onChange={(x) => setStatus(x as 'active' | 'proposed')} />
          </FormField>
        </FieldRow>
      )}
      {form && (
        <>
          <FormField label="Seat title" required error={err('title')}>
            <TextField value={v.title} onChange={(x) => set('title', x)} />
          </FormField>
          <FieldRow>
            <FormField label="Department" required error={err('department')}>
              <Select searchable options={options.departments} value={v.departmentId || null} onChange={(x) => set('departmentId', x ?? '')} />
            </FormField>
            <FormField label="Location" required error={err('location')}>
              <Select searchable options={locations} value={v.locationId || null} onChange={(x) => set('locationId', x ?? '')} />
            </FormField>
          </FieldRow>
          <FieldRow>
            <FormField label="Designation" required error={err('designation')}>
              <Select searchable options={options.designations} value={v.designationId || null} onChange={(x) => set('designationId', x ?? '')} />
            </FormField>
            <FormField label="Valid grades" optional helper="The person in the seat must have one of these.">
              <MultiSelect options={options.grades} value={v.gradeIds} onChange={(x) => setV((o) => ({ ...o, gradeIds: x, defaultGradeId: o.defaultGradeId && x.includes(o.defaultGradeId) ? o.defaultGradeId : (x[0] ?? null) }))} />
            </FormField>
          </FieldRow>
          <FieldRow>
            <FormField label="Headcount" required helper="How many people this seat holds.">
              <NumberField value={v.headcount} min={1} max={10000} onChange={(x) => set('headcount', x ?? 1)} />
            </FormField>
            <FormField label="FTE" required helper="1 is full-time.">
              <NumberField decimals value={v.fte} min={0.01} max={1} onChange={(x) => set('fte', x ?? 1)} />
            </FormField>
          </FieldRow>
          <FieldRow>
            <FormField label="Reports to (seat)" optional>
              <Select searchable clearable options={options.seats.filter((s) => s.value !== seat?.id)} value={v.supervisorPositionId} onChange={(x) => set('supervisorPositionId', x)} />
            </FormField>
            <FormField label="Cost centre" optional>
              <Select clearable options={ccs} value={v.costCentreId} onChange={(x) => set('costCentreId', x)} />
            </FormField>
          </FieldRow>
          <FormField label="Proposed entry salary (yearly)" optional helper="Checked against the pay range; only people with pay-range access see it.">
            <NumberField value={v.entrySalary} min={1} onChange={(x) => set('entrySalary', x)} />
          </FormField>
        </>
      )}
      <FormField label="From" required error={err('from')}>
        <DatePicker value={from} min={today} onChange={setFrom} />
      </FormField>
      <FormField label="Reason" required error={err('reason')} helper="The approver sees this.">
        <TextArea value={reason} onChange={setReason} rows={3} />
      </FormField>
    </Drawer>
  );
}

/** POS-04 mass update: one change for several seats (department, cost centre or reports-to), previewed before it is sent. */
export function MassUpdateDrawer({ open, onClose, seats, options, today, onSend }: { open: boolean; onClose: () => void; seats: (SeatRow & { values: SeatValues })[]; options: SeatOptions; today: Date; onSend: SeatDrawerProps['onSend'] }) {
  const [field, setField] = useState<'departmentId' | 'costCentreId' | 'supervisorPositionId'>('departmentId');
  const [to, setTo] = useState<string | null>(null);
  const [from, setFrom] = useState<Date | null>(today);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const toast = useToastIfAny();
  const choices = field === 'departmentId' ? options.departments : field === 'costCentreId' ? options.costCentres : options.seats;
  const label = (id: string | null) => choices.find((c) => c.value === id)?.label ?? 'None';
  const now = (s: SeatRow & { values: SeatValues }) => (field === 'departmentId' ? s.department?.name : field === 'costCentreId' ? s.costCentre?.name : s.supervisor?.title) ?? 'None';
  const errors = { to: field === 'departmentId' && !to ? 'Choose the new value.' : null, from: !from || iso(from) < iso(today) ? 'Choose today or a later day.' : null, reason: reason.trim().length < 10 ? 'Say why, in 10 characters or more.' : null };
  const send = async () => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setFailed(null);
    try {
      await onSend(
        seats.map((s) => ({ kind: 'change', positionId: s.id, effectiveOn: iso(from!), values: { ...s.values, [field]: to } })),
        reason.trim(),
      );
      toast?.toast({ title: `${seats.length} seat changes sent for approval` });
      onClose();
    } catch (e) {
      setFailed((e as Error).message || 'It could not be sent. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Mass update · ${seats.length} seats`}
      subtitle="One request: approved by someone else"
      size="lg"
      dirty={reason.length > 0}
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void send()}>
            Send for approval
          </Button>
        </>
      }
    >
      <FormField label="What changes">
        <Segment
          label="What changes"
          options={[
            { value: 'departmentId', label: 'Department' },
            { value: 'costCentreId', label: 'Cost centre' },
            { value: 'supervisorPositionId', label: 'Reports to' },
          ]}
          value={field}
          onChange={(x) => {
            setField(x as typeof field);
            setTo(null);
          }}
        />
      </FormField>
      <FieldRow>
        <FormField label="New value" required={field === 'departmentId'} optional={field !== 'departmentId'} error={(tried && errors.to) || undefined}>
          <Select searchable clearable={field !== 'departmentId'} options={choices} value={to} onChange={setTo} />
        </FormField>
        <FormField label="From" required error={(tried && errors.from) || undefined}>
          <DatePicker value={from} min={today} onChange={setFrom} />
        </FormField>
      </FieldRow>
      <PlainTable
        label="Preview of the change"
        caption="Preview"
        columns={[
          { key: 'seat', header: 'Seat', rowHeader: true, cell: (r) => r.seat },
          { key: 'now', header: 'Now', cell: (r) => r.now },
          { key: 'next', header: 'After', cell: (r) => r.next, changed: (r) => r.now !== r.next },
        ]}
        rows={seats.map((s) => ({ id: s.id, seat: `${s.code} · ${s.title}`, now: now(s), next: label(to) }))}
        getRowId={(r) => r.id}
      />
      <FormField label="Reason" required error={(tried && errors.reason) || undefined}>
        <TextArea value={reason} onChange={setReason} rows={3} />
      </FormField>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ POS-01 positions list */

export interface PositionsScreenProps {
  state: LoadState;
  onRetry: () => void;
  data: SeatList | null;
  options: SeatOptions;
  today: Date;
  onOpen: (id: string) => void;
  onSwitchOn: () => void;
  /** The seat's current values (for change, copy and mass update). */
  valuesOf: (id: string) => Promise<SeatValues>;
  onSend: SeatDrawerProps['onSend'];
}

type Open = { kind: SeatChangeKind; seat: SeatDrawerProps['seat'] } | null;

export function PositionsScreen({ state, onRetry, data, options, today, onOpen, onSwitchOn, valuesOf, onSend }: PositionsScreenProps) {
  const [status, setStatus] = useState<'all' | SeatStatus>('active');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<Open>(null);
  const [mass, setMass] = useState<(SeatRow & { values: SeatValues })[] | null>(null);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => (status === 'all' || r.status === status) && (!t || `${r.code} ${r.title} ${r.department?.name ?? ''} ${r.location?.name ?? ''}`.toLowerCase().includes(t)));
  }, [data, status, q]);
  const money = Boolean(data?.rows.some((r) => 'entrySalary' in r));
  const budget = Boolean(data?.rows.some((r) => 'budget' in r));
  const act = async (kind: SeatChangeKind, r: SeatRow) => setDrawer({ kind, seat: { id: r.id, code: r.code, title: r.title, legalEntityId: r.legalEntity?.id ?? null, values: await valuesOf(r.id) } });
  const columns: TableColumn<SeatRow>[] = [
    { key: 'code', header: 'Seat', type: 'id', value: (r) => r.code, render: (r) => <span>{r.code}</span>, width: 110 },
    { key: 'title', header: 'Title', value: (r) => r.title, render: (r) => <span>{r.title}{r.pendingChange ? <> <Badge tone="warning">Change waiting</Badge></> : null}</span>, width: 220 },
    { key: 'department', header: 'Department', value: (r) => r.department?.name ?? '', optional: true },
    { key: 'location', header: 'Location', value: (r) => r.location?.name ?? '', optional: true },
    { key: 'headcount', header: 'Headcount', type: 'number', value: (r) => r.headcount, total: 'sum' },
    { key: 'filled', header: 'Filled', type: 'number', value: (r) => r.filled, total: 'sum' },
    { key: 'vacant', header: 'Vacant', type: 'number', value: (r) => r.vacant, total: 'sum' },
    { key: 'status', header: 'Status', value: (r) => r.status, render: (r) => seatStatusBadge(r.status) },
    { key: 'supervisor', header: 'Reports to', value: (r) => r.supervisor?.title ?? '', optional: true },
    ...(budget ? [{ key: 'budget', header: 'Budget (plan)', type: 'money' as const, value: (r: SeatRow) => r.budget ?? null, optional: true }] : []),
    ...(money ? [{ key: 'entry', header: 'Entry salary', type: 'money' as const, value: (r: SeatRow) => r.entrySalary ?? null, optional: true }] : []),
  ];
  const manage = Boolean(data?.canManage);
  return (
    <PeopleFrame active="Positions">
      <PageHeader
        title="Positions"
        description="Each seat has a headcount. An empty seat is a vacancy; hires and requisitions are made against a seat."
        facts={data?.enabled ? `${data.totals.seats} seats · ${data.totals.headcount} headcount · ${data.totals.filled} filled · ${data.totals.vacant} vacant` : undefined}
        actions={
          manage && data?.enabled ? (
            <Button variant="primary" icon={Plus} onClick={() => setDrawer({ kind: 'create', seat: null })}>
              New seat
            </Button>
          ) : undefined
        }
      />
      {state === 'error' ? (
        <ErrorState title="We couldn't load the positions" description="Check your connection and try again." onRetry={onRetry} />
      ) : state === 'forbidden' ? (
        <NoAccessState what="positions" grantedBy="your HR admin" />
      ) : state === 'loading' || !data ? (
        <ListSkeleton label="Loading positions" />
      ) : !data.enabled ? (
        <EmptyState
          icon={<Users aria-hidden />}
          title="Your company does not use positions yet"
          description="With positions on, every person sits in a seat with a headcount, vacancies show on the org chart, and requisitions are raised against a seat. Small companies usually leave it off."
          action={manage ? <Button variant="primary" onClick={onSwitchOn}>Plan the switch-on</Button> : undefined}
        />
      ) : (
        <DataTable
          label="Positions"
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          onRowClick={(r) => onOpen(r.id)}
          filtered={status !== 'active' || q !== ''}
          onClearFilters={() => {
            setStatus('active');
            setQ('');
          }}
          empty={<EmptyState title="No seats yet" description="Add the first seat, or plan the switch-on to build seats from today's jobs." />}
          rowNoun={['seat', 'seats']}
          selectable={manage}
          isSelectable={(r) => (r.status === 'eliminated' ? 'An eliminated seat cannot change' : r.pendingChange ? 'A change is already waiting for approval' : true)}
          selectedIds={picked}
          onSelectedChange={setPicked}
          bulkActions={(ids) => (
            <Button
              onClick={async () => {
                const list = (data.rows ?? []).filter((r) => ids.includes(r.id));
                setMass(await Promise.all(list.map(async (r) => ({ ...r, values: await valuesOf(r.id) }))));
              }}
            >
              Mass update
            </Button>
          )}
          rowActions={
            manage
              ? (r) =>
                  r.status === 'eliminated' || r.pendingChange ? null : (
                    <>
                      <MenuItem onSelect={() => void act('change', r)}>Change</MenuItem>
                      <MenuItem icon={Copy} onSelect={() => void valuesOf(r.id).then((values) => setDrawer({ kind: 'create', seat: { id: r.id, code: r.code, title: r.title, legalEntityId: r.legalEntity?.id ?? null, values: { ...values, title: `${values.title} (copy)` } } }))}>
                        Copy
                      </MenuItem>
                      {r.status === 'active' && <MenuItem onSelect={() => void act('freeze', r)}>Freeze</MenuItem>}
                      {(r.status === 'proposed' || r.status === 'frozen') && <MenuItem onSelect={() => void act('activate', r)}>Activate</MenuItem>}
                      <MenuItem onSelect={() => void act('eliminate', r)}>Eliminate</MenuItem>
                    </>
                  )
              : undefined
          }
          toolbar={
            <div className="yx-pos-toolbar">
              <Segment
                label="Status"
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'proposed', label: 'Proposed' },
                  { value: 'frozen', label: 'Frozen' },
                  { value: 'eliminated', label: 'Eliminated' },
                  { value: 'all', label: 'All' },
                ]}
                value={status}
                onChange={(x) => setStatus(x as typeof status)}
              />
              <TextField aria-label="Search seats" placeholder="Search code, title, department" value={q} onChange={setQ} />
            </div>
          }
        />
      )}
      {drawer && <SeatChangeDrawer key={`${drawer.kind}-${drawer.seat?.id ?? 'new'}`} open kind={drawer.kind} seat={drawer.seat} options={options} today={today} onSend={onSend} onClose={() => setDrawer(null)} />}
      {mass && (
        <MassUpdateDrawer
          open
          seats={mass}
          options={options}
          today={today}
          onSend={onSend}
          onClose={() => {
            setMass(null);
            setPicked([]);
          }}
        />
      )}
    </PeopleFrame>
  );
}

/* ------------------------------------------------------------------ POS-02 position record */

export interface PositionRecordProps {
  state: LoadState;
  onRetry: () => void;
  data: SeatRecord | null;
  options: SeatOptions;
  today: Date;
  onBack: () => void;
  /** Links to a person's record and to another seat. */
  hrefs: { person: (employeeId: string) => string; seat: (id: string) => string };
  onSend: SeatDrawerProps['onSend'];
  onWithdraw: (batchId: string) => Promise<void>;
}

export function PositionRecordScreen({ state, onRetry, data, options, today, onBack, hrefs, onSend, onWithdraw }: PositionRecordProps) {
  const [drawer, setDrawer] = useState<Open>(null);
  const toast = useToastIfAny();
  if (state === 'error') return <PeopleFrame active="Positions"><ErrorState title="We couldn't load this seat" description="Check your connection and try again." onRetry={onRetry} /></PeopleFrame>;
  if (state === 'forbidden') return <PeopleFrame active="Positions"><NoAccessState what="positions" grantedBy="your HR admin" /></PeopleFrame>;
  if (state === 'loading' || !data) return <PeopleFrame active="Positions"><ListSkeleton label="Loading positions" /></PeopleFrame>;
  const c = data.current;
  const waiting = data.changes.some((x) => x.status === 'submitted');
  const live = c.status !== 'eliminated' && !waiting && data.canManage;
  const seat = { id: data.id, code: data.code, title: c.title, legalEntityId: data.legalEntity?.id ?? null, values: c.values };
  return (
    <PeopleFrame active="Positions">
      <ObjectHeader
        name={`${data.code} · ${c.title}`}
        secondary={[c.designation?.name, c.department?.name, c.location?.name].filter(Boolean).join(' · ')}
        icon={Users}
        status={seatStatusBadge(c.status)}
        facts={[
          { label: 'Headcount', value: String(c.headcount) },
          { label: 'Filled', value: String(data.filled) },
          { label: 'Vacant', value: String(data.vacant) },
          { label: 'FTE', value: String(c.fte) },
        ]}
        actions={
          <>
            <Button onClick={onBack}>All positions</Button>
            {live && (
              <Button variant="primary" onClick={() => setDrawer({ kind: 'change', seat })}>
                Change
              </Button>
            )}
          </>
        }
        menu={
          live ? (
            <>
              <MenuItem icon={Copy} onSelect={() => setDrawer({ kind: 'create', seat: { ...seat, values: { ...c.values, title: `${c.title} (copy)` } } })}>Copy</MenuItem>
              {c.status === 'active' && <MenuItem onSelect={() => setDrawer({ kind: 'freeze', seat })}>Freeze</MenuItem>}
              {(c.status === 'proposed' || c.status === 'frozen') && <MenuItem onSelect={() => setDrawer({ kind: 'activate', seat })}>Activate</MenuItem>}
              <MenuItem onSelect={() => setDrawer({ kind: 'eliminate', seat })}>Eliminate</MenuItem>
            </>
          ) : undefined
        }
      />
      {waiting && <InlineAlert tone="info" title="A change to this seat is waiting for approval." />}
      <div className="yx-pos-grid">
        <Card title="Details">
          <PlainTable
            label="Seat details"
            hideHeader
            getRowId={(r) => r.id}
            columns={[
              { key: 'k', header: 'Field', rowHeader: true, cell: (r) => r.k },
              { key: 'v', header: 'Value', cell: (r) => r.v },
            ]}
            rows={[
              { id: 'e', k: 'Legal entity', v: data.legalEntity?.name ?? '—' },
              { id: 'g', k: 'Valid grades', v: c.grades.map((g) => g.name).join(', ') || 'Any' },
              { id: 'r', k: 'Reports to', v: data.supervisor ? `${data.supervisor.code} · ${data.supervisor.title}` : 'No seat above' },
              { id: 'c', k: 'Cost centre', v: c.costCentre?.name ?? '—' },
              ...('entrySalary' in c ? [{ id: 's', k: 'Proposed entry salary', v: c.entrySalary ? formatINR(c.entrySalary) : '—' }] : []),
            ]}
          />
        </Card>
        <Card title={`People in the seat · ${data.filled}`}>
          {data.incumbents.length ? (
            <PlainTable
              label="People in the seat"
              getRowId={(r) => r.employeeId}
              columns={[
                { key: 'name', header: 'Name', rowHeader: true, cell: (r) => <Link href={hrefs.person(r.employeeId)}>{r.name}</Link> },
                { key: 'code', header: 'Code', cell: (r) => r.code },
                { key: 'since', header: 'Since', date: true, cell: (r) => day(r.since) },
              ]}
              rows={data.incumbents}
            />
          ) : (
            <p className="yx-pos-muted">Nobody is in this seat. {c.status === 'active' ? 'It is a vacancy.' : ''}</p>
          )}
        </Card>
      </div>
      {data.reports.length > 0 && (
        <Card title={`Seats under it · ${data.reports.length}`}>
          <PlainTable label="Seats under it" getRowId={(r) => r.id} columns={[{ key: 'code', header: 'Seat', rowHeader: true, cell: (r) => <Link href={hrefs.seat(r.id)}>{r.code}</Link> }, { key: 'title', header: 'Title', cell: (r) => r.title }]} rows={data.reports} />
        </Card>
      )}
      <Card title="History">
        <PlainTable
          label="Seat history"
          getRowId={(r) => r.validFrom}
          columns={[
            { key: 'from', header: 'From', rowHeader: true, date: true, cell: (r) => day(r.validFrom) },
            { key: 'status', header: 'Status', cell: (r) => seatStatusBadge(r.status) },
            { key: 'title', header: 'Title', cell: (r) => r.title },
            { key: 'where', header: 'Department · location', cell: (r) => [r.department?.name, r.location?.name].filter(Boolean).join(' · ') },
            { key: 'headcount', header: 'Headcount', num: true, cell: (r) => r.headcount },
          ]}
          rows={data.history}
        />
      </Card>
      {(data.requisitions.length > 0 || data.changes.length > 0) && (
        <div className="yx-pos-grid">
          {data.requisitions.length > 0 && (
            <Card title="Requisitions">
              <PlainTable label="Requisitions" getRowId={(r) => r.id} columns={[{ key: 'title', header: 'Job', rowHeader: true, cell: (r) => r.title }, { key: 'status', header: 'Status', cell: (r) => r.status }, { key: 'n', header: 'Openings', num: true, cell: (r) => r.headcount ?? 1 }]} rows={data.requisitions} />
            </Card>
          )}
          {data.changes.length > 0 && (
            <Card title="Changes">
              <PlainTable
                label="Changes"
                getRowId={(r) => r.id}
                columns={[
                  { key: 'kind', header: 'Change', rowHeader: true, cell: (r) => KIND_WORD[r.kind] ?? r.kind },
                  { key: 'from', header: 'From', date: true, cell: (r) => day(r.effectiveOn) },
                  { key: 'status', header: 'Status', cell: (r) => <Badge tone={(CHANGE_STATUS[r.status] ?? ['', 'neutral'])[1]}>{(CHANGE_STATUS[r.status] ?? [r.status])[0]}</Badge> },
                  {
                    key: 'act',
                    header: 'Action',
                    cell: (r) =>
                      r.mine && r.status === 'submitted' ? (
                        <Button
                          size="sm"
                          onClick={async () => {
                            await onWithdraw(r.batchId);
                            toast?.toast({ title: 'Change withdrawn' });
                          }}
                        >
                          Withdraw
                        </Button>
                      ) : null,
                  },
                ]}
                rows={data.changes}
              />
            </Card>
          )}
        </div>
      )}
      {drawer && <SeatChangeDrawer key={drawer.kind} open kind={drawer.kind} seat={drawer.seat} options={options} today={today} onSend={onSend} onClose={() => setDrawer(null)} />}
    </PeopleFrame>
  );
}

/* ------------------------------------------------------------------ POS-03 switch positions on */

export interface SwitchOnProps {
  state: LoadState;
  onRetry: () => void;
  data: SwitchOnData | null;
  onBack: () => void;
  onSend: (reason: string) => Promise<void>;
  onApprove: (batchId: string) => Promise<void>;
  onDecline: (batchId: string, reason: string) => Promise<void>;
}

export function PositionsSwitchOnScreen({ state, onRetry, data, onBack, onSend, onApprove, onDecline }: SwitchOnProps) {
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const toast = useToastIfAny();
  const short = reason.trim().length < 10;
  const run = async (what: string, fn: () => Promise<void>, done: string) => {
    setTried(true);
    if (short && what !== 'approve') return;
    setBusy(what);
    setFailed(null);
    try {
      await fn();
      toast?.toast({ title: done });
      setReason('');
      setTried(false);
    } catch (e) {
      setFailed((e as Error).message || 'That did not work. Try again.');
    } finally {
      setBusy(null);
    }
  };
  const header = <PageHeader title="Switch positions on" description="Each group of people with the same job (legal entity, department, location, designation and grade) becomes one seat. One HR person sends the plan; another approves it." actions={<Button onClick={onBack}>All positions</Button>} />;
  if (state === 'error') return <PeopleFrame active="Positions">{header}<ErrorState title="We couldn't load the plan" description="Check your connection and try again." onRetry={onRetry} /></PeopleFrame>;
  if (state === 'forbidden') return <PeopleFrame active="Positions">{header}<NoAccessState what="the positions switch-on" grantedBy="your HR admin" /></PeopleFrame>;
  if (state === 'loading' || !data) return <PeopleFrame active="Positions">{header}<ListSkeleton label="Loading positions" /></PeopleFrame>;
  const r = data.result;
  return (
    <PeopleFrame active="Positions">
      {header}
      {failed && <InlineAlert tone="danger" title={failed} />}
      {data.enabled ? (
        <InlineAlert tone="success" title="Positions are on.">
          {r ? `${r.seats} seats made; ${people(r.linked)} given a seat${r.failed.length ? `; ${people(r.failed.length)} could not be given one (listed below)` : ''}.` : null}
        </InlineAlert>
      ) : data.plan ? (
        <InlineAlert tone="warning" title={`A plan was sent on ${day(data.plan.sentAt)} and is waiting for approval.`}>
          Reason: {data.plan.reason}
        </InlineAlert>
      ) : (
        <InlineAlert tone="info" title={`${people(data.people)} in ${data.seats.length} seats, from ${day(data.date)}.`}>
          Everyone is linked to their seat with a dated correction. Nothing changes until another HR person approves.
        </InlineAlert>
      )}
      {r && r.failed.length > 0 && (
        <Card title="Could not be given a seat">
          <PlainTable label="Could not be given a seat" getRowId={(x) => x.employeeId} columns={[{ key: 'name', header: 'Person', rowHeader: true, cell: (x) => x.name }, { key: 'reason', header: 'Why', cell: (x) => x.reason }]} rows={r.failed} />
        </Card>
      )}
      {!data.enabled && (
        <Card title="Seats the plan makes">
          <PlainTable
            label="Seats the plan makes"
            getRowId={(x) => x.key}
            columns={[
              { key: 'title', header: 'Seat', rowHeader: true, cell: (x) => x.title },
              { key: 'department', header: 'Department', cell: (x) => x.department ?? '—' },
              { key: 'location', header: 'Location', cell: (x) => x.location ?? '—' },
              { key: 'headcount', header: 'Headcount', num: true, cell: (x) => x.headcount },
              { key: 'who', header: 'People', cell: (x) => `${x.people.join(', ')}${x.headcount > x.people.length ? ` and ${x.headcount - x.people.length} more` : ''}` },
            ]}
            rows={data.seats}
          />
        </Card>
      )}
      {!data.enabled && (data.plan ? data.plan.mine || data.canApprove : data.canSend) && (
        <Card
          title={data.plan ? (data.plan.mine ? 'Withdraw the plan' : 'Decide') : 'Send the plan'}
          footer={
            data.plan ? (
              <>
                <Button loading={busy === 'decline'} onClick={() => void run('decline', () => onDecline(data.plan!.batchId, reason.trim()), data.plan!.mine ? 'Plan withdrawn' : 'Plan turned down')}>
                  {data.plan.mine ? 'Withdraw' : 'Turn down'}
                </Button>
                {!data.plan.mine && (
                  <Button variant="primary" loading={busy === 'approve'} onClick={() => void run('approve', () => onApprove(data.plan!.batchId), 'Positions are on')}>
                    Approve and switch on
                  </Button>
                )}
              </>
            ) : (
              <Button variant="primary" loading={busy === 'send'} onClick={() => void run('send', () => onSend(reason.trim()), 'Plan sent for approval')}>
                Send for approval
              </Button>
            )
          }
        >
          <FormField label={data.plan && !data.plan.mine ? 'Reason (to turn it down)' : 'Reason'} required={!data.plan || data.plan.mine} error={tried && short && busy !== 'approve' ? 'Say why, in 10 characters or more.' : undefined}>
            <TextArea value={reason} onChange={setReason} rows={3} />
          </FormField>
        </Card>
      )}
    </PeopleFrame>
  );
}

/* ------------------------------------------------------------------ sample data (stories, tests) */

export const SEAT_OPTIONS: SeatOptions = {
  entities: [{ value: 'kfpl', label: 'Kaveri Foods Pvt Ltd' }],
  departments: [
    { value: 'stores', label: 'Stores' },
    { value: 'finance', label: 'Finance' },
  ],
  locations: [{ value: 'blr', label: 'Bengaluru head office', entityId: 'kfpl' }],
  designations: [
    { value: 'cashier', label: 'Cashier' },
    { value: 'lead', label: 'Store lead' },
  ],
  grades: [
    { value: 'g3', label: 'G3' },
    { value: 'g4', label: 'G4' },
  ],
  costCentres: [{ value: 'cc-stores', label: 'Stores BLR', entityId: 'kfpl' }],
  seats: [
    { value: 'p1', label: 'POS-00001 · Store lead' },
    { value: 'p2', label: 'POS-00002 · Cashier' },
  ],
};
const n = (id: string, name: string): Named => ({ id, name });
export const SEAT_ROWS: SeatRow[] = [
  { id: 'p1', code: 'POS-00001', title: 'Store lead', status: 'active', legalEntity: n('kfpl', 'Kaveri Foods Pvt Ltd'), department: n('stores', 'Stores'), location: n('blr', 'Bengaluru head office'), designation: n('lead', 'Store lead'), grades: [n('g4', 'G4')], fte: 1, headcount: 1, filled: 1, vacant: 0, supervisor: null, costCentre: n('cc-stores', 'Stores BLR'), pendingChange: false, entrySalary: 720000, budget: 780000 },
  { id: 'p2', code: 'POS-00002', title: 'Cashier', status: 'active', legalEntity: n('kfpl', 'Kaveri Foods Pvt Ltd'), department: n('stores', 'Stores'), location: n('blr', 'Bengaluru head office'), designation: n('cashier', 'Cashier'), grades: [n('g3', 'G3')], fte: 1, headcount: 3, filled: 2, vacant: 1, supervisor: { id: 'p1', code: 'POS-00001', title: 'Store lead' }, costCentre: n('cc-stores', 'Stores BLR'), pendingChange: false, entrySalary: 360000, budget: 1080000 },
  { id: 'p3', code: 'POS-00003', title: 'Senior cashier', status: 'proposed', legalEntity: n('kfpl', 'Kaveri Foods Pvt Ltd'), department: n('stores', 'Stores'), location: n('blr', 'Bengaluru head office'), designation: n('cashier', 'Cashier'), grades: [n('g3', 'G3'), n('g4', 'G4')], fte: 1, headcount: 1, filled: 0, vacant: 0, supervisor: { id: 'p1', code: 'POS-00001', title: 'Store lead' }, costCentre: null, pendingChange: true, entrySalary: 480000, budget: null },
  { id: 'p4', code: 'POS-00004', title: 'Night cashier', status: 'frozen', legalEntity: n('kfpl', 'Kaveri Foods Pvt Ltd'), department: n('stores', 'Stores'), location: n('blr', 'Bengaluru head office'), designation: n('cashier', 'Cashier'), grades: [], fte: 0.5, headcount: 1, filled: 0, vacant: 0, supervisor: { id: 'p1', code: 'POS-00001', title: 'Store lead' }, costCentre: null, pendingChange: false, entrySalary: null, budget: null },
];
export const SEAT_LIST: SeatList = { asOf: '2026-11-25', enabled: true, canManage: true, totals: { seats: 4, headcount: 5, filled: 3, vacant: 1 }, rows: SEAT_ROWS };
export const seatValues = (r: SeatRow): SeatValues => ({ title: r.title, departmentId: r.department?.id ?? '', locationId: r.location?.id ?? '', designationId: r.designation?.id ?? '', gradeIds: r.grades.map((g) => g.id), defaultGradeId: r.grades[0]?.id ?? null, fte: r.fte, headcount: r.headcount, supervisorPositionId: r.supervisor?.id ?? null, costCentreId: r.costCentre?.id ?? null, entrySalary: r.entrySalary ?? null });
const cashier = SEAT_ROWS[1];
export const SEAT_RECORD: SeatRecord = {
  id: cashier.id,
  code: cashier.code,
  legalEntity: cashier.legalEntity,
  asOf: '2026-11-25',
  current: { validFrom: '2026-11-25', status: 'active', title: 'Cashier', department: cashier.department, location: cashier.location, designation: cashier.designation, grades: cashier.grades, fte: 1, headcount: 3, costCentre: cashier.costCentre, entrySalary: 360000, values: seatValues(cashier) },
  supervisor: { id: 'p1', code: 'POS-00001', title: 'Store lead' },
  reports: [],
  filled: 2,
  vacant: 1,
  incumbents: [
    { employeeId: 'e1', name: 'Ravi Kumar', code: 'KF-0102', since: '2026-11-01' },
    { employeeId: 'e2', name: 'Meera Nair', code: 'KF-0141', since: '2026-11-01' },
  ],
  history: [
    { validFrom: '2026-11-25', status: 'active', title: 'Cashier', department: cashier.department, location: cashier.location, designation: cashier.designation, grades: cashier.grades, fte: 1, headcount: 3, costCentre: cashier.costCentre },
    { validFrom: '2026-11-01', status: 'active', title: 'Cashier', department: cashier.department, location: cashier.location, designation: cashier.designation, grades: cashier.grades, fte: 1, headcount: 2, costCentre: cashier.costCentre },
  ],
  requisitions: [{ id: 'j1', title: 'Cashier, Bengaluru', status: 'open', headcount: 1 }],
  changes: [{ id: 'c1', batchId: 'b1', kind: 'change', effectiveOn: '2026-11-25', status: 'approved', reason: 'A new counter opens at the store', createdAt: '2026-11-20T10:00:00Z', mine: true }],
  canManage: true,
};
export const SWITCH_ON: SwitchOnData = {
  enabled: false,
  date: '2026-11-25',
  people: 46,
  seats: [
    { key: 'a', title: 'Store lead', department: 'Stores', location: 'Bengaluru head office', headcount: 1, people: ['Lakshmi Rao'], supervisorKey: null },
    { key: 'b', title: 'Cashier', department: 'Stores', location: 'Bengaluru head office', headcount: 6, people: ['Ravi Kumar', 'Meera Nair', 'Asha Pillai', 'Imran Shaikh', 'Kiran Das'], supervisorKey: 'a' },
    { key: 'c', title: 'Accountant', department: 'Finance', location: 'Bengaluru head office', headcount: 3, people: ['Divya Raghunathan', 'Suresh Iyer', 'Anil Menon'], supervisorKey: null },
  ],
  plan: null,
  result: null,
  canSend: true,
  canApprove: true,
};
