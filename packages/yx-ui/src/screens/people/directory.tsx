// PPL-01 Employee directory · PPL-02 Org chart · PPL-08 Team page (M01 §3.2, §3.10; P02 Q4 directory fields; P01 YX-ORG-26).
import { useMemo, useState } from 'react';
import { CalendarClock, Download, Mail, Phone, Plus, Upload, UserPlus } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button } from '../../components/button';
import { Card, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
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
import { formatDate } from '../../lib/format';
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
const quickMatch = (r: WorkforceRow, q: Quick | null) =>
  !q || (q === 'team' ? r.manager === ME.manager || r.manager === ME.name : q === 'department' ? r.department === ME.department : r.location === ME.location);

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
}

// PPL-01
export function DirectoryScreen({ persona, rows, defaultFilter = 'Employee', state = 'ready', defaultQuery = '', defaultFilters = [], defaultOpenId }: DirectoryScreenProps) {
  const [kind, setKind] = useState<WorkforceFilter>(persona === 'hr' ? defaultFilter : 'Employee');
  const [filters, setFilters] = useState<FilterValue[]>(defaultFilters);
  const [q, setQ] = useState(defaultQuery);
  const [view, setView] = useState('all');
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null);
  const [quick, setQuick] = useState<Quick | null>(null);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (kind === 'All persons' || r.kind === kind) &&
        quickMatch(r, quick) &&
        (!s || [r.name, r.code, r.email, r.phone].some((x) => x.toLowerCase().includes(s))) &&
        filters.every((f) => matchesFilter((r as unknown as Record<string, unknown>)[f.key], f)),
    );
  }, [rows, kind, filters, q, quick]);
  const countOf = (f: WorkforceFilter) => (f === 'All persons' ? (rows.length ? DISTINCT_PERSONS : 0) : rows.filter((r) => r.kind === f).length);
  const open = rows.find((r) => r.id === openId) ?? null;
  const filtered = filters.length > 0 || q !== '' || quick !== null;
  const cols = directoryColumns(persona, kind);

  return (
    <PeopleFrame active="Directory" persona={persona}>
      <PageHeader
        title="Directory"
        description={persona === 'hr' ? 'Everyone who works with Kaveri Foods. The total counts distinct persons, so a person with two roles is counted once.' : 'Find colleagues by name, team or location. Colleagues see only the fields your company shows in the directory.'}
        actions={
          persona === 'hr' ? (
            <>
              <Button icon={Upload}>Import</Button>
              <Button variant="primary" icon={Plus}>
                {ADD_LABEL[kind]}
              </Button>
            </>
          ) : undefined
        }
      />
      {/* The number cards are the switch (founder review 1 Oct 2026): one row, no separate radio buttons. */}
      {persona === 'hr' && (
        <div className="yx-ppl__wf-tabs" role="tablist" aria-label="Workforce">
          {FILTERS.map((f) => {
            const delta = SINCE_AUGUST[f];
            return (
              <button key={f} type="button" role="tab" aria-selected={kind === f} className="yx-ppl__wf-tab" onClick={() => setKind(f)}>
                <span className="yx-ppl__wf-label">{f === 'All persons' ? 'All persons' : FILTER_LABEL[f]}</span>
                <span className="yx-ppl__wf-value">{countOf(f)}</span>
                <span className="yx-ppl__wf-delta">{delta === 0 ? 'Same as August' : `${Math.abs(delta)} ${delta > 0 ? 'more' : 'fewer'} than August`}</span>
              </button>
            );
          })}
        </div>
      )}
      {persona === 'hr' && kind === 'All persons' && rows.length > 0 && (
        <p className="yx-ppl__sub">
          {rows.length} roles held by {DISTINCT_PERSONS} people: 2 people hold two roles, so they appear twice.
        </p>
      )}
      {persona !== 'hr' && <QuickChips value={quick} onChange={setQuick} />}
      {state === 'error' ? (
        <ErrorState title="We couldn't load the directory" description="Check your connection and retry. Your filters are kept." onRetry={() => {}} reference="REF-PPL01-7F2A" />
      ) : (
        <DataTable
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
          empty={<EmptyState title="No people yet" description="Add your first employee or import a list from Excel." action={<Button variant="primary">{ADD_LABEL[kind]}</Button>} />}
          defaultColumnState={{ hidden: ['joined'] }}
          selectable={persona === 'hr'}
          bulkActions={
            persona === 'hr'
              ? () => (
                  <>
                    <Button size="sm" icon={Mail}>
                      Issue letter
                    </Button>
                    <Button size="sm" icon={CalendarClock}>
                      Start change
                    </Button>
                    <Button size="sm" icon={Download}>
                      Export selected
                    </Button>
                  </>
                )
              : undefined
          }
          rowActions={
            persona === 'hr'
              ? () => (
                  <>
                    <MenuItem>Open record</MenuItem>
                    <MenuItem>Start change</MenuItem>
                    <MenuItem>Issue letter</MenuItem>
                  </>
                )
              : undefined
          }
          onRowClick={(r) => setOpenId(r.id)}
          activeRowId={openId}
          defaultSort={{ key: 'name', dir: 'asc' }}
          pageSize={25}
          toolbar={<FilterBar fields={FIELDS} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search name, ID, email or phone" />}
          views={
            <SavedViewMenu
              views={[
                { id: 'all', name: 'Everyone' },
                { id: 'hosur', name: 'Hosur plant', shared: true },
                { id: 'new', name: 'Joined this year' },
              ]}
              currentId={view}
              onSelect={setView}
            />
          }
          onExport={persona === 'hr' ? () => {} : undefined}
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
            {persona === 'hr' && open?.kind === 'Employee' && <Button variant="primary">Open record</Button>}
          </>
        }
      >
        {open && <DirectoryCard row={open} persona={persona} />}
      </Drawer>
    </PeopleFrame>
  );
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
        <div className="yx-ppl__dl-row"><dt>Work phone</dt><dd>{row.phone}</dd></div>
        {persona === 'hr' && <div className="yx-ppl__dl-row"><dt>ID</dt><dd className="yx-mono">{row.code}</dd></div>}
        {persona === 'hr' && <div className="yx-ppl__dl-row"><dt>Joined</dt><dd>{formatDate(row.joined)}</dd></div>}
        {persona === 'hr' && row.via && <div className="yx-ppl__dl-row"><dt>Via</dt><dd>{row.via}</dd></div>}
      </dl>
      <div className="yx-ppl__row">
        {row.email && (
          <Button icon={Mail} size="sm">
            Email
          </Button>
        )}
        <Button icon={Phone} size="sm">
          Call
          <span className="yx-visually-hidden"> {row.name}</span>
        </Button>
      </div>
    </div>
  );
}

// PPL-01 · phone
export function DirectoryPhone({ rows, defaultQuery = '', state = 'ready' }: { rows: WorkforceRow[]; defaultQuery?: string; state?: 'ready' | 'loading' }) {
  const [q, setQ] = useState(defaultQuery);
  const [quick, setQuick] = useState<Quick | null>(null);
  const s = q.trim().toLowerCase();
  const all = rows.filter((r) => r.kind === 'Employee' && quickMatch(r, quick) && (!s || r.name.toLowerCase().includes(s) || r.department.toLowerCase().includes(s)));
  const shown = all.slice(0, 12);
  return (
    <PhoneFrame tab="me" title="Directory">
      <TextField type="search" aria-label="Search people" placeholder="Search name or team" value={q} onChange={setQ} />
      <QuickChips value={quick} onChange={setQuick} compact />
      <p className="yx-ppl__sub" aria-live="polite">
        {all.length} {all.length === 1 ? 'person' : 'people'}
      </p>
      {state === 'loading' ? (
        <ListSkeleton label="Loading people" />
      ) : shown.length ? (
        <ul className="yx-ppl__phone-list" aria-label="People">
          {shown.map((r) => (
            <PhoneRow key={r.id} name={r.name} primary={`${r.role} · ${r.location}`} />
          ))}
        </ul>
      ) : (
        <EmptyState compact title={`No one matches "${q}"`} description="Check the spelling or search by team." action={<Button onClick={() => setQ('')}>Clear search</Button>} />
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
