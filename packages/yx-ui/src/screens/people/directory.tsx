// PPL-01 Employee directory · PPL-02 Org chart · PPL-08 Team page (M01 §3.2, §3.10; P02 Q4 directory fields; P01 YX-ORG-26).
import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Download, Mail, Phone, Plus, Upload, UserPlus } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button } from '../../components/button';
import { Card, PageHeader } from '../../components/shell';
import { DataTable, type ColumnState, type TableColumn } from '../../components/table';
import { FilterBar, SavedViewMenu, type FilterFieldDef } from '../../components/filters';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert } from '../../components/feedback';
import { Avatar, Badge } from '../../components/display';
import { TextField } from '../../components/inputs';
import { DatePicker } from '../../components/date';
import { NeedsActionList, type ActionItem } from '../../components/dashboard';
import { OrgChart, type OrgPerson, type OrgView } from '../../components/orgchart';
import { MenuItem } from '../../components/menu';
import { Text } from '../../components/foundations';
import { Select } from '../../components/select';
import { formatDate, formatPhone } from '../../lib/format';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { daysBetween, type Persona } from './people-logic';
import { DISTINCT_PERSONS, ME, ORG_PROMOTED, type WorkforceKind, type WorkforceRow } from './people-data';
import { ListSkeleton, PeopleFrame, PhoneRow, Segment, StatusBadge } from './people-kit';

/* ================================================================== PPL-01 directory */

export type WorkforceFilter = WorkforceKind | 'All persons';
const FILTERS: WorkforceFilter[] = ['Employee', 'Contract worker', 'Consultant', 'Placement', 'All persons'];
const FILTER_LABEL: Record<WorkforceFilter, string> = { Employee: 'Employees', 'Contract worker': 'Contract workers', Consultant: 'Consultants', Placement: 'Placements', 'All persons': 'All persons' };
const opt = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));

const FIELDS: FilterFieldDef[] = [
  { key: 'department', label: 'Department', type: 'multi', options: opt(['Engineering', 'Operations', 'Finance', 'People', 'Sales', 'Quality', 'Staffing']) },
  { key: 'location', label: 'Location', type: 'multi', options: opt(['Bengaluru head office', 'Chennai office', 'Hosur plant', 'Client site']) },
  { key: 'status', label: 'Status', type: 'multi', options: opt(['Active', 'Probation', 'On leave', 'Notice period', 'Deployed', 'Deployment ending', 'Active contract', 'On assignment']) },
  { key: 'joined', label: 'Joined', type: 'date' },
  { key: 'manager', label: 'Manager', type: 'text' },
];

/** Filter choices from the rows on screen (the live app's departments and sites, not the sample ones). */
function fieldsFor(rows: WorkforceRow[]): FilterFieldDef[] {
  const of = (f: (r: WorkforceRow) => string) => opt([...new Set(rows.map(f).filter(Boolean))].sort());
  return FIELDS.map((x) => (x.key === 'department' ? { ...x, options: of((r) => r.department) } : x.key === 'location' ? { ...x, options: of((r) => r.location) } : x.key === 'status' ? { ...x, options: of((r) => r.status) } : x));
}

function directoryColumns(persona: Persona, filter: WorkforceFilter): TableColumn<WorkforceRow>[] {
  const base: TableColumn<WorkforceRow>[] = [
    { key: 'name', header: 'Name', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.role }), width: 260 },
    { key: 'department', header: 'Department', value: (r) => r.department, groupable: true, width: 140 },
    { key: 'location', header: 'Location', value: (r) => r.location, groupable: true, width: 190 },
    { key: 'manager', header: 'Manager', value: (r) => r.manager, width: 170 },
    { key: 'email', header: 'Work email', value: (r) => r.email, width: 240, optional: true },
  ];
  if (persona !== 'hr') return base;
  // Who supplies the person, named for the view (founder review 1 Oct 2026).
  const viaHeader = filter === 'Contract worker' ? 'Contractor' : filter === 'Placement' ? 'Client' : filter === 'Consultant' ? 'Firm' : 'Contractor, firm or client';
  return [
    base[0],
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (['Probation', 'Notice period', 'Deployment ending'].includes(String(v)) ? 'warning' : v === 'On leave' ? 'neutral' : 'success'), groupable: true, width: 150 },
    { key: 'code', header: 'ID', type: 'id', value: (r) => r.code, width: 110, optional: true },
    ...(filter === 'All persons' ? [{ key: 'kind', header: 'Type', value: (r: WorkforceRow) => r.kind, groupable: true, width: 150 } as TableColumn<WorkforceRow>] : []),
    ...(filter !== 'Employee' ? [{ key: 'via', header: viaHeader, value: (r: WorkforceRow) => r.via ?? '', groupable: true, width: 220 } as TableColumn<WorkforceRow>] : []),
    ...base.slice(1, 4),
    { key: 'joined', header: 'Joined', type: 'date', value: (r) => r.joined, width: 130, optional: true },
  ];
}

const ADD_LABEL: Record<WorkforceFilter, string> = { Employee: 'Add employee', 'Contract worker': 'Add contract worker', Consultant: 'Add consultant', Placement: 'Add placement', 'All persons': 'Add person' };
/** Change since August, per group (for the workforce tabs). */
const SINCE_AUGUST: Record<WorkforceFilter, number> = { 'All persons': 6, Employee: 3, 'Contract worker': 4, Consultant: -1, Placement: 0 };
type Quick = 'team' | 'department' | 'location';
const QUICK: { id: Quick; label: string }[] = [
  { id: 'team', label: 'My team' },
  { id: 'department', label: 'My department' },
  { id: 'location', label: 'My location' },
];
/** Who "me" is for the quick chips: names as they appear on the rows. */
export interface DirectoryMe {
  name: string;
  manager: string;
  department: string;
  location: string;
}
const quickMatch = (r: WorkforceRow, q: Quick | null, me: DirectoryMe = ME) =>
  !q || (q === 'team' ? r.manager === me.manager || r.manager === me.name : q === 'department' ? r.department === me.department : r.location === me.location);

/** Everyone · My team · My department · My location: pick one (employee view and phone). */
function QuickChips({ value, onChange, compact = false }: { value: Quick | null; onChange: (q: Quick | null) => void; compact?: boolean }) {
  const options = [{ value: 'all', label: 'Everyone' }, ...QUICK.map((c) => ({ value: c.id, label: c.label }))];
  // Phones: four joined labels don't fit on one line, so the same pick-one choice is a dropdown.
  if (compact) return <Select aria-label="Show" options={options} value={value ?? 'all'} onChange={(v) => onChange(!v || v === 'all' ? null : (v as Quick))} />;
  return (
    <Segment
      label="Show"
      value={value ?? 'all'}
      onChange={(v) => onChange(v === 'all' ? null : (v as Quick))}
      options={options}
    />
  );
}

export interface DirectoryScreenProps {
  persona: Persona;
  rows: WorkforceRow[];
  defaultFilter?: WorkforceFilter;
  state?: 'ready' | 'loading' | 'error';
  defaultQuery?: string;
  defaultFilters?: FilterValue[];
  defaultOpenId?: string;
  /** The live app's data and actions (design audit step 2). Stories leave it out and keep their sample data. */
  live?: LiveDirectory;
}

/** What a saved view keeps: the card, filters, search, quick chip and columns. */
export interface DirectoryViewState {
  kind: WorkforceFilter;
  filters: FilterValue[];
  q: string;
  quick: Quick | null;
  columns?: ColumnState;
}
export interface DirectorySavedView {
  id: string;
  name: string;
  shared: boolean;
  state: DirectoryViewState;
}

export interface LiveDirectory {
  /** Company name for the description. */
  company: string;
  /** The viewer, for My team / My department / My location; null for someone with no employee record. */
  me: DirectoryMe | null;
  /**
   * The cards that exist, with the change since last month (null until two months are saved). A kind left out has no
   * card: Contract workers and Placements appear when their modules pass them.
   */
  cards: Partial<Record<WorkforceFilter, { count: number; delta: number | null }>>;
  /** "August": the month the change is measured from. */
  sinceMonth?: string | null;
  /** All persons: N roles held by M people. */
  persons?: { roles: number; people: number };
  /** Add someone of this kind (left out: no button). */
  onAdd?: (kind: WorkforceFilter) => void;
  /** Import a list (left out until an employee import exists). */
  onImport?: () => void;
  onOpenRecord?: (row: WorkforceRow) => void;
  onStartChange?: (ids: string[]) => void;
  onIssueLetter?: (ids: string[]) => void;
  /** Download what is shown (ids null) or the selected rows, with these columns. */
  onExport?: (ids: string[] | null, columns: string[], format: 'csv' | 'xlsx') => void;
  views?: { list: DirectorySavedView[]; onSave: (name: string, shared: boolean, state: DirectoryViewState) => void };
  onRetry?: () => void;
}

const ALL_VIEW: DirectoryViewState = { kind: 'Employee', filters: [], q: '', quick: null };

// PPL-01
export function DirectoryScreen({ persona, rows, defaultFilter = 'Employee', state = 'ready', defaultQuery = '', defaultFilters = [], defaultOpenId, live }: DirectoryScreenProps) {
  const [kind, setKind] = useState<WorkforceFilter>(persona === 'hr' ? defaultFilter : 'Employee');
  const [filters, setFilters] = useState<FilterValue[]>(defaultFilters);
  const [q, setQ] = useState(defaultQuery);
  const [view, setView] = useState('all');
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null);
  const [quick, setQuick] = useState<Quick | null>(null);
  const [columns, setColumns] = useState<ColumnState | undefined>(undefined);
  const [selected, setSelected] = useState<string[]>([]);
  // Columns kept for one persona never carry over to another (HR adds Status and ID after Name).
  useEffect(() => setColumns(undefined), [persona]);
  // A saved view's columns are applied by remounting the table with them as its starting state.
  const [tableKey, setTableKey] = useState(0);
  const me = live ? live.me ?? undefined : ME;
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (kind === 'All persons' || r.kind === kind) &&
        quickMatch(r, quick, me) &&
        (!s || [r.name, r.code, r.email, r.phone].some((x) => (x ?? '').toLowerCase().includes(s))) &&
        filters.every((f) => matchesFilter((r as unknown as Record<string, unknown>)[f.key], f)),
    );
  }, [rows, kind, filters, q, quick, me]);
  const kinds = live ? FILTERS.filter((f) => live.cards[f]) : FILTERS;
  const countOf = (f: WorkforceFilter) => (live ? live.cards[f]?.count ?? 0 : f === 'All persons' ? (rows.length ? DISTINCT_PERSONS : 0) : rows.filter((r) => r.kind === f).length);
  const deltaOf = (f: WorkforceFilter) => (live ? live.cards[f]?.delta ?? null : SINCE_AUGUST[f]);
  const since = live ? live.sinceMonth : 'August';
  const open = rows.find((r) => r.id === openId) ?? null;
  const filtered = filters.length > 0 || q !== '' || quick !== null;
  const cols = directoryColumns(persona, kind);
  const fields = live ? fieldsFor(rows) : FIELDS;
  const views = live?.views;
  const apply = (v: DirectoryViewState) => {
    setKind(persona === 'hr' ? v.kind : 'Employee');
    setFilters(v.filters);
    setQ(v.q);
    setQuick(v.quick);
    setColumns(v.columns);
    setTableKey((k) => k + 1);
  };
  const addLabel = live ? (live.onAdd ? ADD_LABEL[kind] : null) : ADD_LABEL[kind];
  const add = () => live?.onAdd?.(kind);
  const visibleKeys = () => cols.filter((c) => !(columns?.hidden ?? ['joined']).includes(c.key)).map((c) => c.key);

  return (
    <PeopleFrame active="Directory" persona={persona}>
      <PageHeader
        title="Directory"
        description={persona === 'hr' ? `Everyone who works with ${live?.company ?? 'Kaveri Foods'}. The total counts distinct persons, so a person with two roles is counted once.` : 'Find colleagues by name, team or location. Colleagues see only the fields your company shows in the directory.'}
        actions={
          persona === 'hr' && (!live || live.onImport || addLabel) ? (
            <>
              {(!live || live.onImport) && (
                <Button icon={Upload} onClick={live?.onImport}>
                  Import
                </Button>
              )}
              {addLabel && (
                <Button variant="primary" icon={Plus} onClick={add}>
                  {addLabel}
                </Button>
              )}
            </>
          ) : undefined
        }
      />
      {/* The number cards are the switch (founder review 1 Oct 2026): one row, no separate radio buttons. */}
      {persona === 'hr' && (
        <div className="yx-ppl__wf-tabs" role="tablist" aria-label="Workforce">
          {kinds.map((f) => {
            const delta = deltaOf(f);
            return (
              <button key={f} type="button" role="tab" aria-selected={kind === f} className="yx-ppl__wf-tab" onClick={() => setKind(f)}>
                <span className="yx-ppl__wf-label">{f === 'All persons' ? 'All persons' : FILTER_LABEL[f]}</span>
                <span className="yx-ppl__wf-value">{countOf(f)}</span>
                {/* No change line until last month is on record: never an invented number. */}
                {delta !== null && since && <span className="yx-ppl__wf-delta">{delta === 0 ? `Same as ${since}` : `${Math.abs(delta)} ${delta > 0 ? 'more' : 'fewer'} than ${since}`}</span>}
              </button>
            );
          })}
        </div>
      )}
      {persona === 'hr' && kind === 'All persons' && rows.length > 0 && (
        <p className="yx-ppl__sub">{personsLine(live ? live.persons ?? { roles: rows.length, people: rows.length } : { roles: rows.length, people: DISTINCT_PERSONS })}</p>
      )}
      {persona !== 'hr' && me && <QuickChips value={quick} onChange={setQuick} />}
      {state === 'error' ? (
        <ErrorState title="We couldn't load the directory" description="Check your connection and retry. Your filters are kept." onRetry={live ? live.onRetry : () => {}} reference={live ? undefined : 'REF-PPL01-7F2A'} />
      ) : (
        <DataTable
          // Remount on a saved view (its columns) or a change of persona (HR's columns), never keeping a stale order.
          key={`${tableKey}-${persona}`}
          label={FILTER_LABEL[kind]}
          columns={cols}
          rows={shown}
          getRowId={(r) => r.id}
          state={state}
          filtered={filtered}
          onClearFilters={() => {
            setFilters([]);
            setQ('');
            setQuick(null);
          }}
          empty={<EmptyState title="No people yet" description={live && !live.onImport ? 'Add your first employee.' : 'Add your first employee or import a list from Excel.'} action={addLabel ? <Button variant="primary" onClick={add}>{addLabel}</Button> : undefined} />}
          defaultColumnState={columns ?? { hidden: ['joined'] }}
          onColumnStateChange={setColumns}
          selectable={persona === 'hr'}
          selectedIds={selected}
          onSelectedChange={setSelected}
          bulkActions={
            persona === 'hr'
              ? (ids) => {
                  // Letters and job changes are for employee records (consultants have neither).
                  const staff = ids.filter((id) => rows.find((r) => r.id === id)?.kind === 'Employee');
                  return (
                    <>
                      {(!live || live.onIssueLetter) && (
                        <Button size="sm" icon={Mail} disabled={Boolean(live) && !staff.length} onClick={() => live?.onIssueLetter?.(staff)}>
                          Issue letter
                        </Button>
                      )}
                      {(!live || live.onStartChange) && (
                        <Button size="sm" icon={CalendarClock} disabled={Boolean(live) && !staff.length} onClick={() => live?.onStartChange?.(staff)}>
                          Start change
                        </Button>
                      )}
                      {(!live || live.onExport) && (
                        <Button size="sm" icon={Download} onClick={() => live?.onExport?.(ids, visibleKeys(), 'csv')}>
                          Export selected
                        </Button>
                      )}
                    </>
                  );
                }
              : undefined
          }
          rowActions={
            persona === 'hr'
              ? (r) =>
                  !live ? (
                    <>
                      <MenuItem>Open record</MenuItem>
                      <MenuItem>Start change</MenuItem>
                      <MenuItem>Issue letter</MenuItem>
                    </>
                  ) : r.kind === 'Employee' ? (
                    <>
                      {live.onOpenRecord && <MenuItem onSelect={() => live.onOpenRecord?.(r)}>Open record</MenuItem>}
                      {live.onStartChange && <MenuItem onSelect={() => live.onStartChange?.([r.id])}>Start change</MenuItem>}
                      {live.onIssueLetter && <MenuItem onSelect={() => live.onIssueLetter?.([r.id])}>Issue letter</MenuItem>}
                    </>
                  ) : null
              : undefined
          }
          onRowClick={(r) => setOpenId(r.id)}
          activeRowId={openId}
          defaultSort={{ key: 'name', dir: 'asc' }}
          pageSize={25}
          toolbar={<FilterBar fields={fields} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder={persona === 'hr' || !live ? 'Search name, ID, email or phone' : 'Search name or email'} />}
          views={
            live && !views ? undefined : (
              <SavedViewMenu
                views={
                  views
                    ? [{ id: 'all', name: 'Everyone' }, ...views.list]
                    : [
                        { id: 'all', name: 'Everyone' },
                        { id: 'hosur', name: 'Hosur plant', shared: true },
                        { id: 'new', name: 'Joined this year' },
                      ]
                }
                currentId={view}
                onSelect={(id) => {
                  setView(id);
                  if (views) apply(id === 'all' ? ALL_VIEW : (views.list.find((v) => v.id === id)?.state ?? ALL_VIEW));
                }}
                canShare={persona === 'hr'}
                onSaveAs={views ? (name, shared) => views.onSave(name, shared, { kind, filters, q, quick, ...(columns ? { columns } : {}) }) : undefined}
              />
            )
          }
          onExport={persona === 'hr' && (!live || live.onExport) ? (format, keys) => live?.onExport?.(null, keys, format) : undefined}
        />
      )}
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        title={open?.name ?? ''}
        subtitle={open ? `${open.role} · ${open.department}` : undefined}
        meta={open && persona === 'hr' ? <StatusBadge status={open.kind} /> : undefined}
        footer={
          <>
            <Button onClick={() => setOpenId(null)}>Close</Button>
            {persona === 'hr' && open?.kind === 'Employee' && (!live || live.onOpenRecord) && (
              <Button variant="primary" onClick={() => open && live?.onOpenRecord?.(open)}>
                Open record
              </Button>
            )}
          </>
        }
      >
        {open && <DirectoryCard row={open} persona={persona} />}
      </Drawer>
    </PeopleFrame>
  );
}

/** "12 roles held by 10 people: 2 people hold two roles, so they appear twice." */
function personsLine({ roles, people }: { roles: number; people: number }) {
  const twice = roles - people;
  return `${roles} roles held by ${people} people${twice > 0 ? `: ${twice} ${twice === 1 ? 'person holds' : 'people hold'} two roles, so they appear twice.` : '.'}`;
}

function DirectoryCard({ row, persona }: { row: WorkforceRow; persona: Persona }) {
  return (
    <div className="yx-ppl__stack">
      <Avatar name={row.name} size={64} />
      <dl className="yx-ppl__dl">
        <div className="yx-ppl__dl-row"><dt>Department</dt><dd>{row.department}</dd></div>
        <div className="yx-ppl__dl-row"><dt>Location</dt><dd>{row.location}</dd></div>
        <div className="yx-ppl__dl-row"><dt>Manager</dt><dd>{row.manager}</dd></div>
        {row.email && <div className="yx-ppl__dl-row"><dt>Work email</dt><dd>{row.email}</dd></div>}
        {row.phone && <div className="yx-ppl__dl-row"><dt>Phone</dt><dd>{formatPhone(row.phone)}</dd></div>}
        {persona === 'hr' && row.code && <div className="yx-ppl__dl-row"><dt>ID</dt><dd className="yx-mono">{row.code}</dd></div>}
        {persona === 'hr' && row.joined && <div className="yx-ppl__dl-row"><dt>Joined</dt><dd>{formatDate(row.joined)}</dd></div>}
        {persona === 'hr' && row.via && <div className="yx-ppl__dl-row"><dt>Via</dt><dd>{row.via}</dd></div>}
      </dl>
      <div className="yx-ppl__row">
        {row.email && (
          <Button asChild size="sm">
            <a href={`mailto:${row.email}`}>
              <Mail size={16} aria-hidden="true" />
              <span className="yx-button__label">Email</span>
            </a>
          </Button>
        )}
        {row.phone && (
          <Button asChild size="sm">
            <a href={`tel:${row.phone.replace(/\s/g, '')}`}>
              <Phone size={16} aria-hidden="true" />
              <span className="yx-button__label">
                Call
                <span className="yx-visually-hidden"> {row.name}</span>
              </span>
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

// PPL-01 · phone
export function DirectoryPhone({ rows, defaultQuery = '', state = 'ready', live }: { rows: WorkforceRow[]; defaultQuery?: string; state?: 'ready' | 'loading'; live?: { me: DirectoryMe | null; persona: Persona } }) {
  const [q, setQ] = useState(defaultQuery);
  const [quick, setQuick] = useState<Quick | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const me = live ? live.me ?? undefined : ME;
  const s = q.trim().toLowerCase();
  const all = rows.filter((r) => r.kind === 'Employee' && quickMatch(r, quick, me) && (!s || r.name.toLowerCase().includes(s) || r.department.toLowerCase().includes(s)));
  // shortcut: the first 50 matches on a phone; searching narrows the rest.
  const shown = all.slice(0, live ? 50 : 12);
  const open = rows.find((r) => r.id === openId) ?? null;
  return (
    <PhoneFrame tab="me" title="Directory">
      <TextField type="search" aria-label="Search people" placeholder="Search name or team" value={q} onChange={setQ} />
      {me && <QuickChips value={quick} onChange={setQuick} compact />}
      <p className="yx-ppl__sub" aria-live="polite">
        {all.length} {all.length === 1 ? 'person' : 'people'}
      </p>
      {state === 'loading' ? (
        <ListSkeleton label="Loading people" />
      ) : shown.length ? (
        <ul className="yx-ppl__phone-list" aria-label="People">
          {shown.map((r) => (
            <PhoneRow key={r.id} name={r.name} primary={`${r.role} · ${r.location}`} onOpen={live ? () => setOpenId(r.id) : undefined} />
          ))}
        </ul>
      ) : (
        <EmptyState compact title={`No one matches "${q}"`} description="Check the spelling or search by team." action={<Button onClick={() => setQ('')}>Clear search</Button>} />
      )}
      {live && (
        <Drawer open={!!open} onOpenChange={(o) => !o && setOpenId(null)} title={open?.name ?? ''} subtitle={open ? `${open.role} · ${open.department}` : undefined} footer={<Button onClick={() => setOpenId(null)}>Close</Button>}>
          {open && <DirectoryCard row={open} persona={live.persona} />}
        </Drawer>
      )}
    </PhoneFrame>
  );
}

/* ================================================================== PPL-02 org chart */

export interface OrgChartScreenProps {
  people: OrgPerson[];
  asOn: Date;
  today: Date;
  defaultView?: OrgView;
  persona?: Persona;
  defaultSelected?: string;
}

// PPL-02
export function OrgChartScreen({ people, asOn: asOnProp, today, defaultView = 'reporting', persona = 'hr', defaultSelected }: OrgChartScreenProps) {
  const [asOn, setAsOn] = useState<Date | null>(asOnProp);
  const past = asOn && daysBetween(asOn, today) > 0;
  const future = asOn && daysBetween(today, asOn) > 0;
  return (
    <PeopleFrame active="Org chart" persona={persona}>
      <PageHeader
        title="Org chart"
        description="Built from current assignments. Dotted lines show secondary managers; they are not in approval chains."
        actions={
          <div className="yx-ppl__asof">
            <label className="yx-ppl__sub" htmlFor="org-asof">
              View as on
            </label>
            <DatePicker id="org-asof" aria-label="View as on" value={asOn} onChange={setAsOn} max={new Date(today.getFullYear() + 1, 11, 31)} />
          </div>
        }
      />
      {past && asOn && (
        <InlineAlert tone="info" title={`Showing the org as on ${formatDate(asOn)}`} actions={<Button size="sm" onClick={() => setAsOn(today)}>Back to today</Button>}>
          People who joined later and roles opened later are not shown. Titles are as they were on that date.
        </InlineAlert>
      )}
      {future && asOn && (
        <InlineAlert tone="info" title={`Showing the org as it will be on ${formatDate(asOn)}`}>
          Scheduled changes up to that date are applied, for example {ORG_PROMOTED.name}'s promotion on 1 Oct 2026.
        </InlineAlert>
      )}
      <OrgChart
        people={people}
        defaultView={defaultView}
        onExport={() => {}}
        rootLabel="Kaveri Foods Pvt Ltd"
        defaultSelected={defaultSelected}
        meId={ME.id}
        openOnMe={persona !== 'hr'}
        onRequestHire={persona === 'hr' ? () => {} : undefined}
      />
    </PeopleFrame>
  );
}

/* ================================================================== PPL-08 team page */

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  today: string;
  upcoming: string;
}

// PPL-08
export function TeamPage({ members, approvals, tasks, today, state = 'ready' }: { members: TeamMember[]; approvals: ActionItem[]; tasks: { id: string; title: string; due: Date; kind: string }[]; today: Date; state?: 'ready' | 'loading' }) {
  const present = members.filter((m) => m.today.startsWith('Present')).length;
  const away = members.filter((m) => m.today.startsWith('On leave')).length;
  const late = members.filter((m) => m.today.startsWith('Late')).length;
  const cols: TableColumn<TeamMember>[] = [
    { key: 'name', header: 'Member', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.role }), width: 260 },
    {
      key: 'today',
      header: 'Today',
      value: (r) => r.today,
      render: (r) => <Badge tone={r.today.startsWith('Present') ? 'success' : r.today.startsWith('Late') ? 'warning' : r.today.startsWith('On leave') ? 'neutral' : 'info'}>{r.today}</Badge>,
      width: 220,
    },
    { key: 'upcoming', header: 'Upcoming', value: (r) => r.upcoming, width: 240 },
  ];
  return (
    <PeopleFrame active="My team" persona="mgr">
      <PageHeader
        title="My team"
        description={`${members.length} people · ${present} present, ${away} on leave, ${late} late as of ${formatDate(today)}, 9:42 am`}
        actions={
          <>
            <Button icon={UserPlus}>Request a hire</Button>
            <Button variant="primary">Start a change</Button>
          </>
        }
      />
      {members.length === 0 && state === 'ready' ? (
        <EmptyState title="No one reports to you yet" description="When HR assigns people to you, you'll see their day, requests and tasks here." help={<a href="#help">How reporting lines are set</a>} />
      ) : (
        <div className="yx-ppl__split">
          <div className="yx-ppl__main">
            <DataTable label="Team members" columns={cols} rows={members} getRowId={(r) => r.id} state={state} rowButtons={() => <Button size="sm">Nudge</Button>} />
            <Card title="Onboarding and exit tasks">
              <ul className="yx-ppl__checklist" aria-label="Tasks">
                {tasks.map((t) => (
                  <li key={t.id} className="yx-ppl__check-row">
                    <div className="yx-ppl__check-main">
                      <span className="yx-ppl__check-title">{t.title}</span>
                      <Text size="sm" tone={daysBetween(t.due, today) > 0 ? 'danger' : 'secondary'}>
                        {t.kind} · due {formatDate(t.due)}
                      </Text>
                    </div>
                    <Button size="sm">Open</Button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <div className="yx-ppl__stack">
            <NeedsActionList items={approvals} viewAllHref="#approvals" today={today} loading={state === 'loading'} title="Waiting for you" onApprove={() => {}} onReview={() => {}} />
          </div>
        </div>
      )}
    </PeopleFrame>
  );
}
