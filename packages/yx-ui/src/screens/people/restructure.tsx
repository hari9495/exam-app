// PPL-09 Bulk transfer and restructure, live; the restructure record (approval and results) and the PPL-10 continuity
// checklist with live items. The API checks every person again; this screen only lays out the plan and the results.
import { useEffect, useMemo, useState } from 'react';
import { ListChecks, Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Card, ObjectHeader, PageHeader } from '../../components/shell';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField } from '../../components/field';
import { MultiSelect, PersonPicker, Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { TextArea } from '../../components/inputs';
import { RadioGroup } from '../../components/choice';
import { ConfirmDialog, Dialog, TypeToConfirmDialog } from '../../components/overlay';
import { DataTable, type TableColumn } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { Stepper } from '../../components/stepper';
import { Text } from '../../components/foundations';
import { formatDate } from '../../lib/format';
import { ListSkeleton, PeopleFrame, StatusBadge, StatusChecklist, type ChecklistRow } from './people-kit';

export type RestructureKind = 'merge' | 'close' | 'demerge' | 'within';
export interface MoveOptions {
  leave: 'carry' | 'lapse';
  service: 'keep' | 'restart';
  code: 'keep' | 'new';
  salary: 'keep' | 'new';
}
export interface RestructureOverride extends Partial<MoveOptions> {
  employeeId: string;
  leaveOut?: boolean;
  reason: string;
}
export interface RestructureInput {
  kind: RestructureKind;
  fromEntityId: string;
  intoEntityId: string | null;
  effectiveDate: string;
  locationIds: string[];
  departmentIds: string[];
  locationMap: Record<string, string>;
  /** Old department, designation, employment type or grade → the one in the new entity. */
  masterMap: Record<string, string>;
  target: { departmentId?: string; locationId?: string; managerEmployeeId?: string | null; costCentreId?: string };
  defaults: MoveOptions;
  overrides: RestructureOverride[];
  reason: string;
}
export interface RestructurePersonResult {
  employeeId: string;
  name: string;
  code: string;
  status: 'ready' | 'moved' | 'failed' | 'left_out' | 'pending';
  reason: string | null;
  from: { entity: string; code: string; location: string; department: string; manager: string | null };
  to: { entity: string; code: string | null; location: string; department: string; manager: string | null } | null;
  service: { from: string; kept: boolean } | null;
  leave: { name: string; days: number; action: 'carried' | 'lapsed' }[];
  pay: 'kept' | 'set_later' | 'none' | null;
}
export interface RestructureCheck {
  id: string;
  title: string;
  status: 'Ready' | 'Blocked' | 'Done';
  note?: string;
}
export interface RestructurePreview {
  people: RestructurePersonResult[];
  checks: RestructureCheck[];
  counts: { ready: number; failed: number; leftOut: number };
}
export interface RestructureSummary {
  id: string;
  kind: RestructureKind;
  title: string;
  effectiveDate: string;
  status: 'pending' | 'scheduled' | 'done' | 'rejected' | 'cancelled';
  /** People who move (left-out people not counted). */
  count: number;
  moved: number;
  failed: number;
  requestedBy: string | null;
  mine: boolean;
}
export interface SetupMaster {
  kind: 'department' | 'designation' | 'employmentType' | 'grade';
  id: string;
  name: string;
  byEntity: Record<string, number>;
  openTo: string[] | null;
}
export interface RestructureSetup {
  today: string;
  entities: { id: string; name: string; shortName: string; people: number }[];
  locations: { id: string; name: string; legalEntityId: string; people: number }[];
  /** openTo: the entities a master is open to (null: every entity); byEntity: people in it per entity today. */
  departments: SetupMaster[];
  masters: SetupMaster[];
  costCentres: { id: string; code: string; name: string; legalEntityId: string }[];
  open: RestructureSummary[];
}
export interface LiveRestructure {
  state: 'loading' | 'ready' | 'error';
  onRetry: () => void;
  setup: RestructureSetup | null;
  /** Current employees, for the new manager. */
  people: { id: string; name: string; role?: string }[];
  /** The dry run through the API (nothing kept). */
  onPreview: (input: RestructureInput) => Promise<RestructurePreview>;
  onSend: (input: RestructureInput, title: string) => Promise<void>;
  onOpen: (id: string) => void;
}

const day = (iso: string) => new Date(`${iso}T00:00:00`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const lower = (s: string) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;
const MONTH = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const OPTION_TEXT: Record<keyof MoveOptions, Record<string, string>> = {
  leave: { carry: 'Carry over', lapse: 'Lapse' },
  service: { keep: 'Continue from original joining date', restart: 'Restart' },
  code: { keep: 'Keep', new: 'New code in the target series' },
  salary: { keep: 'Keep', new: 'Assign new' },
};
const OPTION_LABEL: Record<keyof MoveOptions, string> = { leave: 'Leave balance', service: 'Service continuity', code: 'Employee code', salary: 'Salary structure' };
const KEYS = Object.keys(OPTION_LABEL) as (keyof MoveOptions)[];
const MASTER_TEXT: Record<SetupMaster['kind'], string> = { department: 'Department', designation: 'Designation', employmentType: 'Employment type', grade: 'Grade' };
const DEFAULTS: MoveOptions = { leave: 'carry', service: 'keep', code: 'keep', salary: 'keep' };

/** The reason in a few plain words for the step-1 list: its first sentence, never a permission key. */
export const shortReason = (reason: string | null) => lower((reason ?? '').replace(/\s*\([a-z_]+(?:[.:][a-z_]+)+\)/g, '').split(/\.(?:\s|$)/)[0].trim());
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** One line for an override: "Leave balance: lapse" or "Left out of this move". */
const overrideText = (o: RestructureOverride) => (o.leaveOut ? 'Left out of this move' : KEYS.filter((k) => o[k]).map((k) => `${OPTION_LABEL[k]}: ${lower(OPTION_TEXT[k][o[k]!])}`).join(' · '));

/** Add or change one person's own option, with the reason. */
function OverrideDialog({ people, start, onClose, onSave }: { people: { id: string; name: string }[]; start: RestructureOverride | null; onClose: () => void; onSave: (o: RestructureOverride) => void }) {
  const [who, setWho] = useState<string | null>(start?.employeeId ?? null);
  const first = start ? (start.leaveOut ? 'out' : KEYS.filter((k) => start[k]).map((k) => `${k}:${start[k]}`)[0] ?? null) : null;
  const [pick, setPick] = useState<string | null>(first);
  const [reason, setReason] = useState(start?.reason ?? '');
  // "Leave out" from the checks opens a new override with the person and the option chosen.
  const isNew = !start?.reason;
  const choices = [{ value: 'out', label: 'Leave out of this move' }, ...KEYS.flatMap((k) => Object.entries(OPTION_TEXT[k]).map(([v, t]) => ({ value: `${k}:${v}`, label: `${OPTION_LABEL[k]}: ${t}` })))];
  const ok = who && pick && reason.trim().length >= 3;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? 'Add an override' : 'Change the override'}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() => {
              if (!who || !pick) return;
              const [k, v] = pick.split(':');
              onSave({ employeeId: who, reason: reason.trim(), ...(pick === 'out' ? { leaveOut: true } : { [k]: v }) });
            }}
          >
            {isNew ? 'Add override' : 'Save override'}
          </Button>
        </>
      }
    >
      <div className="yx-ppl__form">
        <FormField label="Person" required>
          <PersonPicker people={people} value={who} onChange={setWho} disabled={!!start} />
        </FormField>
        <FormField label="Option" required>
          <Select options={choices} value={pick} onChange={setPick} placeholder="Choose an option" />
        </FormField>
        <FormField label="Reason" required>
          <TextArea rows={2} value={reason} onChange={setReason} maxLength={300} />
        </FormField>
      </div>
    </Dialog>
  );
}

export function LiveRestructureWizard({ live }: { live: LiveRestructure }) {
  const s = live.setup;
  const [kind, setKind] = useState<RestructureKind>('merge');
  const [from, setFrom] = useState<string | null>(null);
  const [into, setInto] = useState<string | null>(null);
  const [effective, setEffective] = useState<Date | null>(null);
  const [locations, setLocations] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [masterMap, setMasterMap] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<RestructureInput['target']>({});
  const [defaults, setDefaults] = useState<MoveOptions>(DEFAULTS);
  const [overrides, setOverrides] = useState<RestructureOverride[]>([]);
  const [editing, setEditing] = useState<RestructureOverride | 'new' | null>(null);
  const [reason, setReason] = useState('');
  const [step, setStepId] = useState('scope');
  // How far the user has gone: a later step's check result shows only once it is reached (before that: "Not started").
  const [reached, setReached] = useState(0);
  const setStep = (id: string) => (setStepId(id), setReached((n) => Math.max(n, id === 'scope' ? 0 : id === 'options' ? 1 : 2)));
  const [preview, setPreview] = useState<RestructurePreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const across = kind !== 'within';
  const closes = kind === 'merge' || kind === 'close';
  const fromE = s?.entities.find((e) => e.id === from);
  const intoE = s?.entities.find((e) => e.id === into);
  const fromLocations = (s?.locations ?? []).filter((l) => l.legalEntityId === from);
  const moving = across ? fromLocations.filter((l) => l.people > 0 && (kind !== 'demerge' || locations.includes(l.id))) : [];
  // Departments, designations, types and grades only for the old entity: people take another one in the new entity.
  const allMasters = [...(s?.departments ?? []), ...(s?.masters ?? [])];
  const closedMasters = across && from && into ? allMasters.filter((m) => m.byEntity[from] && m.openTo && !m.openTo.includes(into)) : [];
  // A place in the new entity is never guessed: only an exact same-name match starts chosen; the rest start empty.
  const intoLocations = (s?.locations ?? []).filter((x) => x.legalEntityId === into);
  const openInto = (x: SetupMaster) => !x.openTo || (!!into && x.openTo.includes(into));
  const locOf = (l: { id: string; name: string }) => map[l.id] ?? intoLocations.find((x) => same(x.name, l.name))?.id;
  const masterOf = (m: SetupMaster) => masterMap[m.id] ?? allMasters.find((x) => x.kind === m.kind && x.id !== m.id && openInto(x) && same(x.name, m.name))?.id;
  const unmapped = across && from && into ? moving.filter((l) => !locOf(l)).length + closedMasters.filter((m) => !masterOf(m)).length : 0;
  const date = effective ? formatDate(effective) : 'the effective date';
  const heading = !fromE
    ? 'Restructure'
    : kind === 'merge'
      ? `Merge ${fromE.name} into ${intoE?.name ?? 'another entity'}`
      : kind === 'close'
        ? `Close ${fromE.name}`
        : kind === 'demerge'
          ? `Move part of ${fromE.name} to ${intoE?.name ?? 'another entity'}`
          : `Move people inside ${fromE.name}`;
  const input = useMemo((): RestructureInput | null => {
    if (!from || !effective || (across && !into) || reason.trim().length < 3) return null;
    if (kind === 'demerge' && !locations.length) return null;
    if (kind === 'within' && ((!locations.length && !departments.length) || (!target.departmentId && !target.locationId && target.managerEmployeeId === undefined && !target.costCentreId))) return null;
    if (unmapped) return null;
    return {
      kind,
      fromEntityId: from,
      intoEntityId: across ? into : null,
      effectiveDate: iso(effective),
      locationIds: kind === 'demerge' || kind === 'within' ? locations : [],
      departmentIds: kind === 'within' ? departments : [],
      locationMap: across ? Object.fromEntries(moving.map((l) => [l.id, locOf(l)!])) : {},
      masterMap: across ? Object.fromEntries(closedMasters.map((m) => [m.id, masterOf(m)!])) : {},
      target: kind === 'within' ? target : {},
      defaults,
      overrides,
      reason: reason.trim(),
    };
  }, [kind, from, into, effective, locations, departments, map, masterMap, target, defaults, overrides, reason, across, moving, closedMasters, unmapped]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every edit is checked again (a dry run through the API) half a second after the last one.
  const key = JSON.stringify(input);
  useEffect(() => {
    if (!input) {
      setPreview(null);
      return;
    }
    let gone = false;
    const t = setTimeout(() => {
      setChecking(true);
      live
        .onPreview(input)
        .then((r) => !gone && (setPreview(r), setFailed(null)))
        .catch((e) => !gone && (setPreview(null), setFailed(e instanceof Error ? e.message : 'The plan could not be checked. Try again.')))
        .finally(() => !gone && setChecking(false));
    }, 500);
    return () => {
      gone = true;
      clearTimeout(t);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (live.state === 'error') return <PeopleFrame active="Restructure"><ErrorState title="We couldn't load the legal entities" description="Check your connection and try again." onRetry={live.onRetry} /></PeopleFrame>;
  if (!s) return <PeopleFrame active="Restructure"><PageHeader title="Restructure" /><ListSkeleton label="Loading the legal entities" /></PeopleFrame>;

  const people = preview?.people ?? [];
  const cannot = people.filter((p) => p.status === 'failed');
  const ready = people.filter((p) => p.status === 'ready');
  const blockedCheck = preview?.checks.find((c) => c.status === 'Blocked');
  // The employments in the plan (left-out people not counted): from the check, or before it from today's head counts.
  const moveCount = preview ? people.filter((p) => p.status !== 'left_out').length : across && from ? moving.reduce((n, l) => n + l.people, 0) : null;
  const mapBlocked = unmapped ? `Choose a place in ${intoE?.name ?? 'the new entity'} for every row first` : undefined;
  const entityOptions = s.entities.map((e) => ({ value: e.id, label: `${e.name} · ${e.people} people` }));
  const finishBlocked = mapBlocked
    ? mapBlocked
    : !input
    ? 'Fill in what moves first'
    : checking || !preview
      ? 'Checking the plan'
      : cannot.length
        ? `Leave out or fix ${cannot.length} ${cannot.length === 1 ? 'person' : 'people'} first`
        : blockedCheck
          ? (blockedCheck.note ?? blockedCheck.title)
          : !ready.length
            ? 'No one moves with these choices'
            : undefined;
  const objectName = fromE && effective ? `${kind === 'within' ? 'MOVE' : kind.toUpperCase()} ${fromE.shortName.toUpperCase()} ${MONTH[effective.getMonth()]} ${effective.getFullYear()}` : 'RESTRUCTURE';
  const leaveOut = (p: RestructurePersonResult) => setEditing({ employeeId: p.employeeId, leaveOut: true, reason: '' });

  const beforeRows: ChecklistRow[] = [
    { id: 'b1', title: `${ready.length} ${ready.length === 1 ? 'employment' : 'employments'} ready to move`, status: ready.length ? 'Ready' : 'Pending' },
    ...cannot.map((p): ChecklistRow => ({ id: `f${p.employeeId}`, title: `${p.name} can't move`, note: p.reason ?? undefined, status: 'Fix needed', action: <Button size="sm" onClick={() => leaveOut(p)}>Leave out</Button> })),
    ...(preview?.checks ?? []).map((c): ChecklistRow => ({ id: c.id, title: c.title, status: c.status, note: c.note })),
  ];
  const afterRows: ChecklistRow[] = [
    { id: 'a1', title: across ? `Employments move to ${intoE?.name ?? 'the new entity'} on ${date}` : `Changes take effect on ${date}`, owner: 'Automatic', status: 'On approval' },
    ...(across
      ? [
          { id: 'a2', title: 'Leave balances, service and pay follow the transfer options', owner: 'Automatic', status: 'On approval' },
          { id: 'a3', title: 'A continuity checklist for each person (PF, ESI, tax, pay), shown in payroll checks', owner: 'Payroll', status: 'On approval' },
        ]
      : []),
    ...(closes ? [{ id: 'a4', title: `Final PF, ESI, professional tax and TDS returns of ${fromE?.name ?? 'the old entity'}, then archive it in Settings › Legal entities`, owner: 'Payroll and HR', status: 'You do this' }] : []),
  ];
  const cols: TableColumn<RestructurePersonResult>[] = [
    { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.code }), width: 200 },
    { key: 'to', header: 'After the move', value: (r) => (r.to ? `${r.to.location}` : ''), render: (r) => (r.to ? <span className="yx-ppl__type"><span>{across ? `${r.to.entity} · ${r.to.code}` : r.to.department}</span><span className="yx-ppl__sub">{across ? r.to.location : `${r.to.location}${r.to.manager ? ` · manager ${r.to.manager}` : ''}`}</span></span> : <span className="yx-ppl__sub">{r.reason}</span>), width: 260 },
    ...(across
      ? [
          { key: 'service', header: 'Service from', value: (r: RestructurePersonResult) => (r.service ? formatDate(day(r.service.from)) : ''), width: 130 },
          { key: 'leave', header: 'Leave', value: (r: RestructurePersonResult) => (r.leave.length ? r.leave.map((l) => `${l.name} ${l.days} ${l.action}`).join(', ') : r.to ? 'No balance' : ''), width: 180 },
        ]
      : []),
    { key: 'status', header: 'Status', type: 'status', value: (r) => (r.status === 'ready' ? 'Ready' : r.status === 'left_out' ? 'Left out' : "Can't move"), statusTone: (v) => (v === 'Ready' ? 'success' : v === 'Left out' ? 'neutral' : 'danger'), width: 120 },
  ];

  return (
    <PeopleFrame active="Restructure">
      <PageHeader title={heading} description={`Moves ${moveCount ?? 'the'} ${moveCount === 1 ? 'employment' : 'employments'} with one preview and one approval${closes ? ', then the old entity can be closed' : ''}.`} />
      {s.open.length > 0 && (
        <InlineAlert tone="info" title={`${s.open.length} ${s.open.length === 1 ? 'restructure is' : 'restructures are'} open`}>
          <ul className="yx-ppl__stack" aria-label="Open restructures">
            {s.open.map((o) => (
              <li key={o.id} className="yx-ppl__row yx-ppl__row--between">
                <span>
                  {o.title} · {o.status === 'pending' ? (o.mine ? 'waiting for another HR person to approve' : 'waiting for your approval') : `moves on ${formatDate(day(o.effectiveDate))}`}
                </span>
                <Button size="sm" onClick={() => live.onOpen(o.id)}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
        </InlineAlert>
      )}
      <Stepper
        title="Restructure"
        current={step}
        onCurrentChange={setStep}
        continueBlocked={step === 'options' ? mapBlocked : undefined}
        finishLabel="Send for approval"
        finishBlocked={finishBlocked}
        onFinish={() => setConfirm(true)}
        review={{ description: closes ? 'The old entity closes only when nothing is left open.' : 'Check who moves before you send this for approval.' }}
        steps={[
          {
            id: 'scope',
            title: 'What moves',
            summary: preview ? `${ready.length} people · ${across ? `into ${intoE?.name ?? ''}` : 'inside the entity'} · ${date}` : 'Not filled in yet',
            content: (
              <div className="yx-ppl__form">
                <FormField label="Action" required>
                  <RadioGroup
                    value={kind}
                    onChange={(v) => setKind(v as RestructureKind)}
                    options={[
                      { value: 'merge', label: 'Merge into another entity' },
                      { value: 'close', label: 'Close the entity (transfers)' },
                      { value: 'demerge', label: 'Move part of the entity to another one' },
                      { value: 'within', label: 'Move people inside the entity (department, location, manager, cost centre)' },
                    ]}
                  />
                </FormField>
                <FormField label={kind === 'within' ? 'Legal entity' : 'From entity'} required>
                  <Select options={entityOptions} value={from} onChange={(v) => (setFrom(v), setLocations([]), setDepartments([]), setMap({}), setMasterMap({}), setTarget({}))} placeholder="Choose a legal entity" />
                </FormField>
                {across && (
                  <FormField label={kind === 'close' ? 'Transfer people to' : 'Into entity'} required>
                    <Select options={entityOptions.filter((e) => e.value !== from)} value={into} onChange={(v) => (setInto(v), setMap({}), setMasterMap({}))} placeholder="Choose a legal entity" />
                  </FormField>
                )}
                {(kind === 'demerge' || kind === 'within') && from && (
                  <FormField label="Who moves" required={kind === 'demerge'} helper={kind === 'demerge' ? 'Everyone at the chosen locations moves.' : 'Everyone at the chosen locations and departments moves.'}>
                    <MultiSelect aria-label="Locations" placeholder="Locations" options={fromLocations.map((l) => ({ value: l.id, label: `${l.name} · ${l.people} people` }))} value={locations} onChange={setLocations} />
                  </FormField>
                )}
                {kind === 'within' && from && (
                  <>
                    <FormField label="Departments">
                      <MultiSelect aria-label="Departments" placeholder="Departments" options={s.departments.filter((d) => d.byEntity[from]).map((d) => ({ value: d.id, label: `${d.name} · ${d.byEntity[from]} people` }))} value={departments} onChange={setDepartments} />
                    </FormField>
                    <Card title="Move to">
                      <div className="yx-ppl__form">
                        <FormField label="Department">
                          <Select options={s.departments.map((d) => ({ value: d.id, label: d.name }))} value={target.departmentId ?? null} onChange={(v) => setTarget({ ...target, departmentId: v ?? undefined })} placeholder="No change" />
                        </FormField>
                        <FormField label="Location">
                          <Select options={fromLocations.map((l) => ({ value: l.id, label: l.name }))} value={target.locationId ?? null} onChange={(v) => setTarget({ ...target, locationId: v ?? undefined })} placeholder="No change" />
                        </FormField>
                        <FormField label="Manager">
                          <PersonPicker people={live.people} value={target.managerEmployeeId ?? null} onChange={(v) => setTarget({ ...target, managerEmployeeId: v ?? undefined })} placeholder="No change" />
                        </FormField>
                        <FormField label="Cost centre">
                          <Select options={s.costCentres.filter((c) => c.legalEntityId === from).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))} value={target.costCentreId ?? null} onChange={(v) => setTarget({ ...target, costCentreId: v ?? undefined })} placeholder="No change" />
                        </FormField>
                      </div>
                    </Card>
                  </>
                )}
                <FormField label="Effective date" required>
                  <DatePicker value={effective} onChange={setEffective} />
                </FormField>
                <FormField label="Reason" required helper="Shown on every person's job history.">
                  <TextArea rows={2} value={reason} onChange={setReason} maxLength={500} />
                </FormField>
                {across && kind !== 'demerge' && from && (
                  <Card title={`Who moves (${moveCount ?? 0})`}>
                    {moving.length ? (
                      <dl className="yx-ppl__dl">
                        {moving.map((l) => (
                          <div key={l.id} className="yx-ppl__dl-row"><dt>{l.name}</dt><dd>{l.people} people</dd></div>
                        ))}
                        {s.departments.filter((dp) => dp.byEntity[from]).map((dp) => (
                          <div key={dp.id} className="yx-ppl__dl-row"><dt>{dp.name}</dt><dd>{dp.byEntity[from]} people</dd></div>
                        ))}
                      </dl>
                    ) : (
                      <Text size="sm" tone="secondary" as="p">No one works here today.</Text>
                    )}
                  </Card>
                )}
                {failed && <InlineAlert tone="danger" title="The plan was not checked">{failed}</InlineAlert>}
                {cannot.length > 0 && (
                  <InlineAlert tone="info" title={`${cannot.length} ${cannot.length === 1 ? 'person needs' : 'people need'} their own decision`} actions={<Button size="sm" onClick={() => setStep('options')}>Review overrides</Button>}>
                    <ul className="yx-ppl__stack" aria-label="People who need their own decision">
                      {cannot.map((p) => (
                        <li key={p.employeeId}>
                          {p.name}: {shortReason(p.reason)}
                        </li>
                      ))}
                    </ul>
                  </InlineAlert>
                )}
              </div>
            ),
          },
          {
            id: 'options',
            title: 'Transfer options',
            summary: across ? `${KEYS.map((k) => `${OPTION_LABEL[k]}: ${lower(OPTION_TEXT[k][defaults[k]])}`).join(' · ')} · ${overrides.length} overrides` : `${overrides.length} overrides`,
            content: (
              <div className="yx-ppl__stack">
                {across && from && into && (
                  <Card title={`Places in ${intoE?.name ?? 'the new entity'}`}>
                    {moving.length ? (
                      <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Locations and their place in the new entity">
                        <table className="yx-ppl__impact">
                          <thead>
                            <tr>
                              <th scope="col">Now at</th>
                              <th scope="col">Location in {intoE?.name}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {moving.map((l) => (
                              <tr key={l.id}>
                                <td>
                                  <span className="yx-ppl__type">
                                    <span>{l.name}</span>
                                    <span className="yx-ppl__sub">{l.people} people</span>
                                  </span>
                                </td>
                                <td>
                                  <Select aria-label={`Location in ${intoE?.name} for ${l.name}`} size="sm" options={intoLocations.map((x) => ({ value: x.id, label: x.name }))} value={locOf(l) ?? null} onChange={(v) => v && setMap({ ...map, [l.id]: v })} placeholder="Choose…" />
                                </td>
                              </tr>
                            ))}
                            {closedMasters.map((m) => (
                              <tr key={m.id}>
                                <td>
                                  <span className="yx-ppl__type">
                                    <span>{m.name}</span>
                                    <span className="yx-ppl__sub">{MASTER_TEXT[m.kind]} only for {fromE?.name} · {m.byEntity[from!]} people</span>
                                  </span>
                                </td>
                                <td>
                                  <Select aria-label={`${MASTER_TEXT[m.kind]} in ${intoE?.name} for ${m.name}`} size="sm" options={allMasters.filter((x) => x.kind === m.kind && openInto(x)).map((x) => ({ value: x.id, label: x.name }))} value={masterOf(m) ?? null} onChange={(v) => v && setMasterMap({ ...masterMap, [m.id]: v })} placeholder="Choose…" />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Text size="sm" tone="secondary" as="p">{kind === 'demerge' ? 'Choose the locations whose people move.' : 'No one works here today.'}</Text>
                    )}
                  </Card>
                )}
                {across ? (
                  <>
                    <Text as="p">Company defaults are selected for everyone. Change a default, or give one person their own option with a reason.</Text>
                    <div className="yx-ppl__form">
                      {KEYS.slice(0, 3).map((k) => (
                        <FormField key={k} label={OPTION_LABEL[k]} helper={k === 'leave' ? 'Encashing at the old entity is part of a full and final settlement: leave the person out and start their exit instead.' : undefined}>
                          <Select options={Object.entries(OPTION_TEXT[k]).map(([value, label]) => ({ value, label: k === 'code' && value === 'new' ? `New code in the ${intoE?.shortName ?? 'target'} series` : label }))} value={defaults[k]} onChange={(v) => v && setDefaults({ ...defaults, [k]: v })} />
                        </FormField>
                      ))}
                      <FormField label="Settlement at old entity" helper="A full and final settlement needs an exit case: leave the person out and start their exit from Exit cases.">
                        <Select options={[{ value: 'none', label: 'None: amounts move over' }]} value="none" onChange={() => {}} />
                      </FormField>
                      <FormField label={OPTION_LABEL.salary} helper={defaults.salary === 'new' ? 'No pay on the new employment until a salary change is approved; payroll leaves them out until then.' : undefined}>
                        <Select options={Object.entries(OPTION_TEXT.salary).map(([value, label]) => ({ value, label }))} value={defaults.salary} onChange={(v) => v && setDefaults({ ...defaults, salary: v as MoveOptions['salary'] })} />
                      </FormField>
                    </div>
                  </>
                ) : (
                  <Text as="p">Pay, leave and service stay as they are: only the place changes. You can leave a person out with a reason.</Text>
                )}
                <Card
                  title={`Per-person overrides (${overrides.length})`}
                  actions={
                    <Button size="sm" icon={Plus} onClick={() => setEditing('new')} disabled={!people.length}>
                      Add override
                    </Button>
                  }
                >
                  {overrides.length ? (
                    <StatusChecklist
                      label="Per-person overrides"
                      rows={overrides.map(
                        (o): ChecklistRow => ({
                          id: o.employeeId,
                          title: people.find((p) => p.employeeId === o.employeeId)?.name ?? 'A person',
                          note: o.reason,
                          status: overrideText(o),
                          action: (
                            <span className="yx-ppl__row">
                              <Button size="sm" onClick={() => setEditing(o)}>
                                Edit
                              </Button>
                              <Button size="sm" onClick={() => setOverrides(overrides.filter((x) => x.employeeId !== o.employeeId))}>
                                Remove
                              </Button>
                            </span>
                          ),
                        }),
                      )}
                    />
                  ) : (
                    <Text size="sm" tone="secondary" as="p">Everyone follows the defaults.</Text>
                  )}
                </Card>
              </div>
            ),
          },
          {
            id: 'close',
            title: closes ? 'Close the old entity' : 'Checks',
            status: reached >= 2 && (blockedCheck || cannot.length) ? 'error' : undefined,
            statusNote: reached < 2 ? undefined : blockedCheck ? 'Payroll month not ready' : cannot.length ? `${cannot.length} can't move` : undefined,
            summary: !preview ? 'Not checked yet' : blockedCheck ? `Blocked: ${lower(blockedCheck.note ?? blockedCheck.title)}` : cannot.length ? `${cannot.length} people can't move` : 'All checks pass',
            content: !preview ? (
              <ListSkeleton rows={4} label="Checking the plan" />
            ) : (
              <div className="yx-ppl__stack">
                <Card title="Before you send">
                  <StatusChecklist label="Checks before sending" rows={beforeRows} />
                </Card>
                <Card title={`Each person (${people.length})`}>
                  <DataTable label="Each person after the move" columns={cols} rows={people} getRowId={(r) => r.employeeId} empty={<EmptyState title="No one moves" description="Change who moves on the first step." />} />
                </Card>
                <Card title="After approval">
                  <StatusChecklist label="What happens after approval" rows={afterRows} />
                </Card>
              </div>
            ),
          },
          {
            id: 'letters',
            title: 'Letters',
            summary: `${ready.length} transfer letters · issue from Letters after approval`,
            content: (
              <div className="yx-ppl__form">
                <Text as="p">After approval, issue the transfer letters to the {ready.length} people from People › Letters. The restructure page links there with the people chosen.</Text>
              </div>
            ),
          },
        ]}
      />
      <TypeToConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Send “${heading}” for approval?`}
        consequence={`Once approved, ${ready.length} ${ready.length === 1 ? 'employment moves' : 'employments move'} on ${date}${across ? '. A move between entities can only be undone person by person' : ''}; later fixes are individual changes.`}
        confirmLabel="Send for approval"
        objectName={objectName}
        onConfirm={async () => {
          if (input) await live.onSend(input, heading);
        }}
      />
      {editing && (
        <OverrideDialog
          people={people.map((p) => ({ id: p.employeeId, name: p.name }))}
          start={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(o) => {
            setOverrides([...overrides.filter((x) => x.employeeId !== o.employeeId), o]);
            setEditing(null);
          }}
        />
      )}
    </PeopleFrame>
  );
}

/* ------------------------------------------------------------------ the restructure record */

export interface RestructureRecordData extends RestructureSummary {
  /** Everyone named in the plan, with what happened to each. */
  reason: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  canDecide: boolean;
  canCancel: boolean;
  people: { employeeId: string; name: string; status: 'pending' | 'moved' | 'failed' | 'left_out'; reason: string | null; result: RestructurePersonResult | null; openItems: number }[];
}
export interface ContinuityItemData {
  id: string;
  key: string;
  title: string;
  owner: string;
  dueOn: string | null;
  status: 'open' | 'done';
  note: string | null;
  version: number;
}
export interface RestructureRecordProps {
  /** forbidden: not HR (founder decision 21 Oct 2026: payroll does no HR work). */
  state: 'loading' | 'ready' | 'error' | 'forbidden';
  onRetry: () => void;
  data: RestructureRecordData | null;
  today: Date;
  onApprove?: () => Promise<void>;
  onReject?: (reason: string) => Promise<void>;
  onCancel?: (reason: string) => Promise<void>;
  /** The continuity checklist of one person (moves between entities). */
  onItems?: (employeeId: string) => Promise<ContinuityItemData[]>;
  onItem?: (item: ContinuityItemData, done: boolean) => Promise<void>;
  onLetters?: (employeeIds: string[]) => void;
  /** Stories: the checklist drawer starts open for this person. */
  defaultChecklistFor?: string;
}

const STATUS_TEXT: Record<RestructureSummary['status'], string> = { pending: 'Waiting for approval', scheduled: 'Scheduled', done: 'Done', rejected: 'Rejected', cancelled: 'Cancelled' };
const PERSON_TEXT: Record<RestructureRecordData['people'][number]['status'], string> = { pending: 'Waiting', moved: 'Moved', failed: "Couldn't move", left_out: 'Left out' };

/** PPL-10: the continuity checklist of one person after a move between legal entities. */
export function ContinuityChecklistDrawer({ open, onOpenChange, title, subtitle, items, today, onItem }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; subtitle?: string; items: ContinuityItemData[] | null; today: Date; onItem?: (item: ContinuityItemData, done: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const openCount = (items ?? []).filter((i) => i.status === 'open').length;
  const rows = (items ?? []).map(
    (i): ChecklistRow => ({
      id: i.id,
      title: i.title,
      owner: i.owner,
      ...(i.dueOn ? { due: day(i.dueOn) } : {}),
      status: i.status === 'done' ? 'Done' : 'Pending',
      note: i.note ?? undefined,
      action: onItem ? (
        <Button size="sm" loading={busy === i.id} onClick={async () => {
          setBusy(i.id);
          try {
            await onItem(i, i.status !== 'done');
          } finally {
            setBusy(null);
          }
        }}>
          {i.status === 'done' ? 'Reopen' : 'Mark done'}
        </Button>
      ) : undefined,
    }),
  );
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={title} subtitle={items ? (openCount ? `${openCount} items open · shown in payroll checks` : 'All items done') : subtitle} footer={<Button onClick={() => onOpenChange(false)}>Close</Button>}>
      <div className="yx-ppl__stack">
        {!items ? (
          <ListSkeleton rows={4} label="Loading the checklist" />
        ) : (
          <>
            {openCount > 0 && <InlineAlert tone="warning">Open items show in payroll checks for the new entity until they are done.</InlineAlert>}
            <StatusChecklist label="Continuity items" rows={rows} today={today} />
          </>
        )}
      </div>
    </Drawer>
  );
}

export function RestructureRecord({ state, onRetry, data: d, today, onApprove, onReject, onCancel, onItems, onItem, onLetters, defaultChecklistFor }: RestructureRecordProps) {
  const [ask, setAsk] = useState<'approve' | 'reject' | 'cancel' | null>(null);
  const [why, setWhy] = useState('');
  const [listFor, setListFor] = useState<string | null>(defaultChecklistFor ?? null);
  const [items, setItems] = useState<ContinuityItemData[] | null>(null);
  useEffect(() => {
    if (!listFor || !onItems) return;
    setItems(null);
    let gone = false;
    void onItems(listFor).then((x) => !gone && setItems(x));
    return () => {
      gone = true;
    };
  }, [listFor]); // eslint-disable-line react-hooks/exhaustive-deps
  if (state === 'error') return <PeopleFrame active="Restructure"><ErrorState title="We couldn't load this restructure" description="Check your connection and try again." onRetry={onRetry} /></PeopleFrame>;
  if (state === 'forbidden')
    return (
      <PeopleFrame active="Restructure">
        <PageHeader title="Restructure" />
        <NoAccessState what="restructures" grantedBy="your HR admin" />
        <Text size="sm" tone="secondary" as="p">HR plans and approves restructures. Payroll keeps its continuity items in the payroll checks.</Text>
      </PeopleFrame>
    );
  if (!d) return <PeopleFrame active="Restructure"><ListSkeleton label="Loading the restructure" /></PeopleFrame>;
  const across = d.kind !== 'within';
  type Row = RestructureRecordData['people'][number];
  const moved = d.people.filter((p) => p.status === 'moved');
  const cols: TableColumn<Row>[] = [
    { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.result?.code ?? '' }), width: 210 },
    { key: 'to', header: 'After the move', value: (r) => r.result?.to?.location ?? '', render: (r) => (r.result?.to ? <span className="yx-ppl__type"><span>{across ? `${r.result.to.entity} · ${r.result.to.code}` : r.result.to.department}</span><span className="yx-ppl__sub">{r.result.to.location}</span></span> : <span className="yx-ppl__sub">{r.status === 'pending' ? 'Not moved yet' : '—'}</span>), width: 240 },
    { key: 'reason', header: 'Reason', value: (r) => r.reason ?? '', width: 280 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => PERSON_TEXT[r.status], statusTone: (v) => (v === 'Moved' ? 'success' : v === "Couldn't move" ? 'danger' : v === 'Waiting' ? 'warning' : 'neutral'), width: 130 },
  ];
  const who = d.people.find((p) => p.employeeId === listFor);
  const decide = async () => {
    if (ask === 'approve') await onApprove?.();
    else if (ask === 'reject') await onReject?.(why.trim());
    else if (ask === 'cancel') await onCancel?.(why.trim());
    setAsk(null);
    setWhy('');
  };
  const count = d.count;
  return (
    <PeopleFrame active="Restructure">
      <ObjectHeader
        name={d.title}
        icon={ListChecks}
        secondary={`Effective ${formatDate(day(d.effectiveDate))} · ${count} ${count === 1 ? 'person' : 'people'} · sent by ${d.requestedBy ?? 'someone'}`}
        status={<StatusBadge status={STATUS_TEXT[d.status]} />}
        actions={
          <span className="yx-ppl__row">
            {d.canCancel && onCancel && <Button onClick={() => setAsk('cancel')}>Cancel restructure</Button>}
            {d.canDecide && onReject && <Button onClick={() => setAsk('reject')}>Reject</Button>}
            {d.canDecide && onApprove && <Button variant="approve" onClick={() => setAsk('approve')}>Approve and move {count} people</Button>}
            {d.status === 'done' && moved.length > 0 && onLetters && <Button onClick={() => onLetters(moved.map((p) => p.employeeId))}>Issue transfer letters</Button>}
          </span>
        }
      />
      {d.status === 'done' && (
        <InlineAlert tone={d.failed ? 'warning' : 'success'} title={d.failed ? `${d.moved} moved · ${d.failed} couldn't move` : `All ${d.moved} moved`}>
          {d.failed ? 'Each person who could not move stayed where they were. Fix the reason and move them in a new restructure.' : across ? 'Open each person’s continuity checklist for what payroll still has to do.' : 'The changes are in each person’s job history.'}
        </InlineAlert>
      )}
      {d.status === 'scheduled' && <InlineAlert tone="info" title={`Approved by ${d.decidedBy ?? 'the approver'}`}>The people move on {formatDate(day(d.effectiveDate))}. Each one is checked again on that day.</InlineAlert>}
      {(d.status === 'rejected' || d.status === 'cancelled') && <InlineAlert tone="info" title={`${STATUS_TEXT[d.status]} by ${d.decidedBy ?? 'someone'}`}>{d.decisionNote}</InlineAlert>}
      <Text size="sm" tone="secondary" as="p">Reason: {d.reason}</Text>
      <DataTable
        label="People in this restructure"
        columns={cols}
        rows={d.people}
        getRowId={(r) => r.employeeId}
        rowButtons={(r) => (across && r.status === 'moved' && onItems ? <Button size="sm" onClick={() => setListFor(r.employeeId)}>Continuity checklist{r.openItems ? ` (${r.openItems})` : ''}</Button> : null)}
        empty={<EmptyState title="No one in this restructure" description="Everyone was left out." />}
      />
      <ContinuityChecklistDrawer
        open={!!listFor}
        onOpenChange={(o) => !o && setListFor(null)}
        title={`Continuity checklist · ${who?.name ?? ''}`}
        items={items}
        today={today}
        onItem={
          onItem
            ? async (i, done) => {
                await onItem(i, done);
                if (listFor && onItems) setItems(await onItems(listFor));
              }
            : undefined
        }
      />
      {ask === 'approve' ? (
        <ConfirmDialog open onOpenChange={(o) => !o && setAsk(null)} title={`Approve “${d.title}”?`} consequence={`${count} ${count === 1 ? 'person moves' : 'people move'} on ${formatDate(day(d.effectiveDate))}. Each person moves on their own; anyone who can't move stays where they are, with the reason.`} confirmLabel={`Approve and move ${count} people`} confirmVariant="approve" onConfirm={decide} />
      ) : ask ? (
        <ConfirmDialog open onOpenChange={(o) => !o && setAsk(null)} title={ask === 'reject' ? `Reject “${d.title}”?` : `Cancel “${d.title}”?`} consequence="No one moves." confirmLabel={ask === 'reject' ? 'Reject' : 'Cancel restructure'} cancelLabel="Keep it" destructive confirmDisabled={why.trim().length < 3} onConfirm={decide}>
          <FormField label="Reason" required>
            <TextArea rows={2} value={why} onChange={setWhy} maxLength={500} />
          </FormField>
        </ConfirmDialog>
      ) : null}
    </PeopleFrame>
  );
}
