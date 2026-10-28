// PPL-01 Employee directory · PPL-02 Org chart · PPL-08 Team page (M01 §3.2, §3.10; P02 Q4 directory fields; P01 YX-ORG-26).
import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, Download, Mail, Phone, Plus, Upload, UserPlus } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button } from '../../components/button';
import { Card, PageHeader } from '../../components/shell';
import { DataTable, type ColumnState, type TableColumn } from '../../components/table';
import { FilterBar, SavedViewMenu, type FilterFieldDef } from '../../components/filters';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, NoticeBar, Skeleton } from '../../components/feedback';
import { Avatar, Badge } from '../../components/display';
import { TextField } from '../../components/inputs';
import { DatePicker } from '../../components/date';
import { NeedsActionList, type ActionItem } from '../../components/dashboard';
import { OrgChart, type OrgPerson, type OrgView } from '../../components/orgchart';
import { exportOrgChart } from '../../components/orgchart-export';
import { dayKey } from '../../lib/dates';
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

/**
 * The Department filter's values for a row: its department and every one above it, so Operations finds Quality.
 * shortcut: a label names only the nearest parent (Operations › Quality); show the full path if trees get deeper.
 */
const departmentsOf = (r: WorkforceRow) => {
  const p = r.departmentPath ?? (r.department ? [r.department] : []);
  return p.map((n, i) => (i ? `${p[i - 1]} › ${n}` : n));
};

/** Filter choices from the rows on screen (the live app's departments and sites, not the sample ones). */
function fieldsFor(rows: WorkforceRow[]): FilterFieldDef[] {
  const of = (f: (r: WorkforceRow) => string | string[]) => opt([...new Set(rows.flatMap(f).filter(Boolean))].sort());
  return FIELDS.map((x) => (x.key === 'department' ? { ...x, options: of(departmentsOf) } : x.key === 'location' ? { ...x, options: of((r) => r.location) } : x.key === 'status' ? { ...x, options: of((r) => r.status) } : x));
}

function directoryColumns(persona: Persona, filter: WorkforceFilter): TableColumn<WorkforceRow>[] {
  const base: TableColumn<WorkforceRow>[] = [
    { key: 'name', header: 'Name', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.role }), width: 260 },
    { key: 'department', header: 'Department', value: (r) => r.department, groupable: true, width: 140 },
    // Founder 28 Oct 2026: the legal entity under the place, so the code's prefix (KF-, KFT-) has its entity beside it.
    {
      key: 'location',
      header: 'Location',
      value: (r) => r.location,
      render: (r) =>
        r.entity ? (
          <span className="yx-ppl__cell-two">
            <span>{r.location}</span>
            <span className="yx-ppl__sub">{r.entity}</span>
          </span>
        ) : (
          r.location
        ),
      groupable: true,
      width: 190,
    },
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
  state?: 'ready' | 'loading' | 'error' | 'no-access';
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
        filters.every((f) => matchesFilter(f.key === 'department' ? departmentsOf(r) : (r as unknown as Record<string, unknown>)[f.key], f)),
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
      {state === 'no-access' ? (
        <NoAccessState what="the directory" grantedBy="your HR admin" />
      ) : state === 'error' ? (
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
        {row.entity && <div className="yx-ppl__dl-row"><dt>Legal entity</dt><dd>{row.entity}</dd></div>}
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
  /** The live app's chart (design audit step 3). Stories leave it out. */
  live?: LiveOrgChart;
}

export interface LiveOrgChart {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  companyName: string;
  /** Company-wide HR may look at another date; others see today. */
  onAsOn?: (d: Date) => void;
  meId?: string;
  truncated: boolean;
  onOpenPerson?: (id: string) => void;
  onExportCsv?: () => void;
  /** Offer the Position view (open job openings shown as vacant positions). */
  positions?: boolean;
  /** Said in the Position view when nothing is open today, e.g. "No open positions for Kaveri Foods Pvt Ltd". */
  noPositionsText?: string;
  /** The latest date "View as on" may show (today for everyone but HR, founder 20 Oct 2026). */
  maxAsOn?: Date;
}

// PPL-02
export function OrgChartScreen({ people, asOn: asOnProp, today, defaultView = 'reporting', persona = 'hr', defaultSelected, live }: OrgChartScreenProps) {
  const [ownAsOn, setOwnAsOn] = useState<Date | null>(asOnProp);
  const asOn = live ? asOnProp : ownAsOn;
  const setAsOn = (d: Date | null) => (live ? live.onAsOn?.(d ?? today) : setOwnAsOn(d));
  const past = asOn && daysBetween(asOn, today) > 0;
  const future = asOn && daysBetween(today, asOn) > 0;
  return (
    <PeopleFrame active="Org chart" persona={persona}>
      <PageHeader
        title="Org chart"
        description="Built from current assignments. Dotted lines show secondary managers; they are not in approval chains."
        actions={
          !live || live.onAsOn ? (
            <div className="yx-ppl__asof">
              <label className="yx-ppl__sub" htmlFor="org-asof">
                View as on
              </label>
              <DatePicker id="org-asof" aria-label="View as on" value={asOn} onChange={setAsOn} max={live?.maxAsOn ?? new Date(today.getFullYear() + 1, 11, 31)} />
            </div>
          ) : undefined
        }
      />
      {/* One line, so the chart keeps its room at 1278 x 635 (founder 21 Oct 2026). */}
      {past && asOn && (
        <NoticeBar tone="info" action={<Button size="sm" onClick={() => setAsOn(today)}>Back to today</Button>}>
          {`Showing the org as on ${formatDate(asOn)}. People who joined later and roles opened later are not shown.`}
        </NoticeBar>
      )}
      {future && asOn && (
        <NoticeBar tone="info" action={live ? <Button size="sm" onClick={() => setAsOn(today)}>Back to today</Button> : undefined}>
          {`Showing the org as it will be on ${formatDate(asOn)}. ${live ? 'Approved changes up to that date are applied.' : `Scheduled changes are applied, for example ${ORG_PROMOTED.name}'s promotion on 1 Oct 2026.`}`}
        </NoticeBar>
      )}
      {live?.truncated && <InlineAlert tone="warning" title="Only the first 5,000 people are shown.">Use the directory to find anyone else.</InlineAlert>}
      {live?.state === 'loading' ? (
        <Skeleton height={320} />
      ) : live?.state === 'error' ? (
        <ErrorState title="We couldn't load the org chart" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : live ? (
        <OrgChart
          people={people}
          defaultView={defaultView}
          views={live.positions ? ['reporting', 'department', 'position'] : ['reporting', 'department']}
          noPositionsText={past || future ? 'No open positions on this date. Openings show on today’s chart.' : (live.noPositionsText ?? 'No open positions')}
          {...(live.onExportCsv ? { onExport: (f: 'png' | 'pdf' | 'csv') => (f === 'csv' ? live.onExportCsv!() : void exportOrgChart(people.filter((x) => !x.vacant), f, live.companyName, `org-chart-${dayKey(asOn ?? today)}`)), exportFormats: ['png' as const, 'pdf' as const, 'csv' as const] } : {})}
          rootLabel={live.companyName}
          meId={live.meId}
          openOnMe={persona !== 'hr' && Boolean(live.meId)}
          onOpenPerson={live.onOpenPerson ? (p) => live.onOpenPerson!(p.id) : undefined}
        />
      ) : (
        <OrgChart
          people={people}
          defaultView={defaultView}
          onExport={() => {}}
          rootLabel="Kaveri Foods Pvt Ltd"
          noPositionsText={past || future ? 'No open positions on this date. Openings show on today’s chart.' : 'No open positions'}
          defaultSelected={defaultSelected}
          meId={ME.id}
          openOnMe={persona !== 'hr'}
          onRequestHire={persona === 'hr' ? () => {} : undefined}
        />
      )}
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
  /** Already reminded to check in today (Nudge shows "Reminded"). */
  reminded?: boolean;
}

/** The live app's team (design audit step 3). Stories leave it out. */
export interface LiveTeam {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  /** "as of 20 Oct 2026, 9:42 am"; null when there is no attendance to count. */
  asOf: string | null;
  onOpenMember?: (id: string) => void;
  onStartChange?: () => void;
  approvalsHref: string;
  onReview: () => void;
  /** Quick approve of a request that may be decided here (the API checks it again). */
  onApprove?: (item: ActionItem) => void;
  /** Remind someone who has not checked in today (once a day; the API checks the reach). */
  onNudge?: (id: string) => void;
  /** ats.requisition.raise: "Request a hire" opens the requisition sheet. */
  onRequestHire?: () => void;
  onOpenTask: (id: string) => void;
}

const todayTone = (t: string) => (t.startsWith('Present') ? 'success' : t.startsWith('Late') || t.startsWith('Not checked in') ? 'warning' : t.startsWith('On leave') || t.startsWith('Weekly off') || t.startsWith('Holiday') ? 'neutral' : 'info');

// PPL-08
export function TeamPage({ members, approvals, tasks, today, state: ownState = 'ready', live }: { members: TeamMember[]; approvals: ActionItem[]; tasks: { id: string; title: string; due: Date; kind: string }[]; today: Date; state?: 'ready' | 'loading'; live?: LiveTeam }) {
  const state = live ? live.state : ownState;
  const present = members.filter((m) => m.today.startsWith('Present')).length;
  const away = members.filter((m) => m.today.startsWith('On leave')).length;
  const late = members.filter((m) => m.today.startsWith('Late')).length;
  const cols: TableColumn<TeamMember>[] = [
    { key: 'name', header: 'Member', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.role }), width: 260 },
    {
      key: 'today',
      header: 'Today',
      value: (r) => r.today,
      render: (r) => (r.today ? <Badge tone={todayTone(r.today)}>{r.today}</Badge> : '—'),
      width: 220,
      optional: true,
    },
    { key: 'upcoming', header: 'Upcoming', value: (r) => r.upcoming, width: 240, optional: true },
  ];
  const description = live
    ? `${members.length} ${members.length === 1 ? 'person' : 'people'}${live.asOf ? ` · ${present} present, ${away} on leave, ${late} late as of ${live.asOf}` : ''}`
    : `${members.length} people · ${present} present, ${away} on leave, ${late} late as of ${formatDate(today)}, 9:42 am`;
  return (
    <PeopleFrame active="My team" persona="mgr">
      <PageHeader
        title="My team"
        description={description}
        actions={
          live ? (
            <>
              {live.onRequestHire && (
                <Button icon={UserPlus} onClick={live.onRequestHire}>
                  Request a hire
                </Button>
              )}
              {live.onStartChange && members.length > 0 && (
                <Button variant="primary" onClick={live.onStartChange}>
                  Start a change
                </Button>
              )}
            </>
          ) : (
            <>
              <Button icon={UserPlus}>Request a hire</Button>
              <Button variant="primary">Start a change</Button>
            </>
          )
        }
      />
      {state === 'error' && live ? (
        <ErrorState title="We couldn't load your team" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : members.length === 0 && state === 'ready' ? (
        <EmptyState title="No one reports to you yet" description="When HR assigns people to you, you'll see their day, requests and tasks here." help={live ? undefined : <a href="#help">How reporting lines are set</a>} />
      ) : (
        <div className="yx-ppl__split">
          <div className="yx-ppl__main">
            <DataTable
              label="Team members"
              columns={cols}
              rows={members}
              getRowId={(r) => r.id}
              state={state === 'loading' ? 'loading' : 'ready'}
              {...(live?.onOpenMember ? { onRowClick: (r: TeamMember) => live.onOpenMember!(r.id) } : {})}
              rowButtons={
                live
                  ? (r: TeamMember) =>
                      live.onNudge && r.today.startsWith('Not checked in') ? (
                        // Once reminded today it says so and stays done, after a reload too (founder, 22 Oct 2026).
                        <Button size="sm" icon={r.reminded ? Check : undefined} disabled={r.reminded} aria-label={r.reminded ? `Reminded ${r.name}` : `Nudge ${r.name}`} onClick={() => live.onNudge!(r.id)}>
                          {r.reminded ? 'Reminded' : 'Nudge'}
                        </Button>
                      ) : null
                  : () => <Button size="sm">Nudge</Button>
              }
            />
            {(!live || tasks.length > 0) && (
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
                      <Button size="sm" onClick={live ? () => live.onOpenTask(t.id) : undefined}>
                        Open
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
          <div className="yx-ppl__stack">
            <NeedsActionList items={approvals} viewAllHref={live?.approvalsHref ?? '#approvals'} today={today} loading={state === 'loading'} title="Waiting for you" onApprove={live ? live.onApprove : () => {}} onReview={live ? live.onReview : () => {}} />
          </div>
        </div>
      )}
    </PeopleFrame>
  );
}
