import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo, useState } from 'react';
import { Archive, Check, Download, Mail, Pencil, Trash2, UserCog, X } from 'lucide-react';
import { Button, Link } from '../components/button';
import { MenuItem, MenuSeparator } from '../components/menu';
import { DataTable, type TableColumn } from '../components/table';
import { FilterBar, SavedViewMenu, type FilterFieldDef } from '../components/filters';
import { Drawer } from '../components/drawer';
import { EmptyState, InlineAlert, Meter } from '../components/feedback';
import { Badge, PersonLabel } from '../components/display';
import { FormField } from '../components/field';
import { TextField } from '../components/inputs';
import { Select } from '../components/select';
import { formatDate, formatINR } from '../lib/format';
import { filtersToQuery, matchesFilter, type FilterValue } from '../lib/table';
import { makeEmployees, PROJECTS, projectTone, statusTone, type Employee, type Project } from './sample-data';
import { Section, Stack } from './story-kit';

const meta: Meta = { title: 'Data/Table and filters', parameters: { layout: 'fullscreen' } };
export default meta;

const EMPLOYEES = makeEmployees(248);
const opt = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));

const EMP_COLS: TableColumn<Employee>[] = [
  {
    key: 'name',
    header: 'Employee',
    type: 'person',
    value: (r) => r.name,
    person: (r) => ({ name: r.name, secondary: r.role }),
    width: 260,
  },
  { key: 'code', header: 'ID', type: 'id', value: (r) => r.code, width: 110 },
  { key: 'department', header: 'Department', value: (r) => r.department, groupable: true, width: 140 },
  { key: 'location', header: 'Location', value: (r) => r.location, groupable: true, editable: 'text', width: 140 },
  { key: 'joined', header: 'Joined', type: 'date', value: (r) => r.joined, width: 130 },
  { key: 'ctc', header: 'Monthly CTC', type: 'money', value: (r) => r.ctc, total: 'sum', editable: 'money', width: 150 },
  { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone, groupable: true, width: 140 },
  { key: 'manager', header: 'Manager', value: (r) => r.manager, width: 170 },
];

const EMP_FIELDS: FilterFieldDef[] = [
  { key: 'department', label: 'Department', type: 'multi', options: opt(['Engineering', 'Operations', 'Finance', 'People', 'Sales', 'Quality']) },
  { key: 'location', label: 'Location', type: 'multi', options: opt(['Bengaluru', 'Chennai', 'Hosur plant']) },
  { key: 'status', label: 'Status', type: 'multi', options: opt(['Active', 'Probation', 'On leave', 'Notice period']) },
  { key: 'joined', label: 'Joined', type: 'date' },
  { key: 'ctc', label: 'Monthly CTC', type: 'number', money: true },
  { key: 'manager', label: 'Manager', type: 'text' },
];

function applyEmployeeFilters(rows: Employee[], filters: FilterValue[], q: string) {
  const s = q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!s || [r.name, r.code, r.role].some((x) => x.toLowerCase().includes(s))) &&
      filters.every((f) => matchesFilter((r as unknown as Record<string, unknown>)[f.key], f)),
  );
}

const VIEWS = [
  { id: 'all', name: 'All employees' },
  { id: 'prob', name: 'On probation' },
  { id: 'chennai', name: 'Chennai engineering', shared: true },
  { id: 'hosur', name: 'Hosur plant', shared: true },
];

function EmployeesPage({ initialFilters = [] as FilterValue[], groupBy = null as string | null }) {
  const [rows, setRows] = useState(EMPLOYEES);
  const [filters, setFilters] = useState<FilterValue[]>(initialFilters);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<Employee | null>(null);
  const [view, setView] = useState('all');
  const [views, setViews] = useState(VIEWS);
  const shown = useMemo(() => applyEmployeeFilters(rows, filters, q), [rows, filters, q]);
  const filtered = filters.length > 0 || q !== '';

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, lineHeight: '28px', fontWeight: 600 }}>Employees</h1>
          <p style={{ margin: '2px 0 0', color: 'var(--yx-color-text-secondary)' }}>
            {shown.length} of {rows.length} shown
            {filtered && (
              <>
                {' · '}
                <span className="yx-mono" style={{ fontSize: 12 }}>
                  ?{filtersToQuery(filters, q)}
                </span>
              </>
            )}
          </p>
        </div>
        <Button>Import</Button>
        <Button variant="primary">Add employee</Button>
      </div>
      <DataTable
        label="Employees"
        columns={EMP_COLS}
        rows={shown}
        getRowId={(r) => r.id}
        filtered={filtered}
        onClearFilters={() => {
          setFilters([]);
          setQ('');
        }}
        selectable
        selectedIds={selected}
        onSelectedChange={setSelected}
        bulkActions={() => (
          <>
            <Button size="sm" icon={Mail}>
              Send letter
            </Button>
            <Button size="sm" icon={UserCog}>
              Change manager
            </Button>
            <Button size="sm" icon={Download}>
              Export selected
            </Button>
          </>
        )}
        rowActions={(r) => (
          <>
            <MenuItem icon={Pencil} onSelect={() => setOpen(r)}>
              Quick edit
            </MenuItem>
            <MenuItem icon={Mail}>Send letter</MenuItem>
            <MenuItem icon={Archive}>Start exit</MenuItem>
            <MenuSeparator />
            <MenuItem icon={Trash2} destructive>
              Delete record
            </MenuItem>
          </>
        )}
        onRowClick={setOpen}
        activeRowId={open?.id}
        defaultSort={{ key: 'name', dir: 'asc' }}
        defaultGroupBy={groupBy}
        pageSize={25}
        onCellEdit={(row, key, value) => setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, [key]: value } : r)))}
        onExport={() => {}}
        toolbar={<FilterBar fields={EMP_FIELDS} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search name, ID or role" />}
        views={
          <SavedViewMenu
            views={views}
            currentId={view}
            onSelect={setView}
            modified={filtered}
            onSave={() => {}}
            onSaveAs={(name, shared) => {
              const id = `v${views.length + 1}`;
              setViews([...views, { id, name, shared }]);
              setView(id);
            }}
          />
        }
      />
      <Drawer
        open={Boolean(open)}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open?.name}
        subtitle={open ? `${open.role} · ${open.department} · ${open.location}` : undefined}
        meta={open && <Badge tone={statusTone(open.status)}>{open.status}</Badge>}
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Close</Button>
            <Button variant="primary">Open profile</Button>
          </>
        }
      >
        {open && (
          <dl className="yx-story-facts">
            <dt>Employee ID</dt>
            <dd className="yx-mono">{open.code}</dd>
            <dt>Manager</dt>
            <dd>{open.manager}</dd>
            <dt>Joined</dt>
            <dd>{formatDate(open.joined)}</dd>
            <dt>Monthly CTC</dt>
            <dd>{formatINR(open.ctc)}</dd>
          </dl>
        )}
      </Drawer>
      <style>{`.yx-story-facts{display:grid;grid-template-columns:140px 1fr;row-gap:8px;margin:0}.yx-story-facts dt{color:var(--yx-color-text-muted)}.yx-story-facts dd{margin:0}`}</style>
    </div>
  );
}

export const EmployeesTable: StoryObj = {
  name: 'Employees · full table',
  render: () => <EmployeesPage />,
};

export const EmployeesFilteredGrouped: StoryObj = {
  name: 'Employees · filtered and grouped',
  render: () => (
    <EmployeesPage
      initialFilters={[
        { key: 'location', type: 'multi', values: ['Chennai', 'Bengaluru'] },
        { key: 'ctc', type: 'number', min: 50000, max: null },
      ]}
      groupBy="department"
    />
  ),
};

export const EmployeesSelected: StoryObj = {
  name: 'Employees · rows selected (bulk bar)',
  render: function Render() {
    const [sel, setSel] = useState(['e1', 'e2', 'e5']);
    return (
      <div style={{ padding: 24 }}>
        <DataTable
          label="Employees"
          columns={EMP_COLS.slice(0, 6)}
          rows={EMPLOYEES.slice(0, 8)}
          getRowId={(r) => r.id}
          selectable
          selectedIds={sel}
          onSelectedChange={setSel}
          bulkActions={() => (
            <>
              <Button size="sm" icon={Mail}>
                Send letter
              </Button>
              <Button size="sm" icon={Download}>
                Export selected
              </Button>
              <Button size="sm" variant="danger" icon={Archive}>
                Start exit
              </Button>
            </>
          )}
          rowActions={() => <MenuItem>Open</MenuItem>}
        />
      </div>
    );
  },
};

// ---------- Projects (M12) ----------

const PROJECT_COLS: TableColumn<Project>[] = [
  {
    key: 'name',
    header: 'Project',
    value: (r) => r.name,
    render: (r) => (
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
        <span className="yx-mono" style={{ fontSize: 12, color: 'var(--yx-color-text-muted)' }}>
          {r.code}
        </span>
      </span>
    ),
    width: 240,
  },
  { key: 'client', header: 'Client', value: (r) => r.client || 'Internal', groupable: true, width: 150 },
  { key: 'pm', header: 'Project manager', type: 'person', value: (r) => r.pm, person: (r) => ({ name: r.pm }), width: 200 },
  { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: projectTone, groupable: true, width: 110 },
  { key: 'billing', header: 'Billing', value: (r) => r.billing, groupable: true, width: 150 },
  {
    key: 'burn',
    header: 'Hours used',
    value: (r) => r.usedHours / r.budgetHours,
    render: (r) => <Meter value={r.usedHours} max={r.budgetHours} label={`${r.name} hours used`} valueText={`${r.usedHours} / ${r.budgetHours} h`} />,
    width: 220,
  },
  { key: 'contract', header: 'Contract value', type: 'money', value: (r) => (r.contract ? r.contract : null), total: 'sum', width: 150 },
  { key: 'end', header: 'Ends', type: 'date', value: (r) => r.end, width: 120 },
];

const PROJECT_FIELDS: FilterFieldDef[] = [
  { key: 'status', label: 'Status', type: 'multi', options: opt(['Active', 'On hold', 'Draft', 'Closed']) },
  { key: 'client', label: 'Client', type: 'multi', options: opt(['Acme Retail', 'Nova Logistics', 'Shri Textiles', 'Gaia Health']) },
  { key: 'billing', label: 'Billing', type: 'multi', options: opt(['Time & material', 'Fixed fee', 'Retainer', 'Non-billable']) },
  { key: 'pm', label: 'Project manager', type: 'text' },
];

export const ProjectsList: StoryObj = {
  name: 'Projects · list (M12)',
  render: function Render() {
    const [filters, setFilters] = useState<FilterValue[]>([{ key: 'status', type: 'multi', values: ['Active', 'On hold', 'Draft'] }]);
    const [q, setQ] = useState('');
    const [sel, setSel] = useState<string[]>([]);
    const rows = PROJECTS.filter(
      (p) =>
        (!q || `${p.name} ${p.code} ${p.client}`.toLowerCase().includes(q.toLowerCase())) &&
        filters.every((f) => matchesFilter((p as unknown as Record<string, unknown>)[f.key], f)),
    );
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: '28px', fontWeight: 600 }}>Projects</h1>
            <p style={{ margin: '2px 0 0', color: 'var(--yx-color-text-secondary)' }}>Hours bar turns amber at 80% of budget and red at 100%.</p>
          </div>
          <Button>Import</Button>
          <Button variant="primary">New project</Button>
        </div>
        <DataTable
          label="Projects"
          columns={PROJECT_COLS}
          rows={rows}
          getRowId={(r) => r.id}
          filtered={filters.length > 0 || q !== ''}
          onClearFilters={() => {
            setFilters([]);
            setQ('');
          }}
          selectable
          selectedIds={sel}
          onSelectedChange={setSel}
          bulkActions={() => (
            <>
              <Button size="sm" icon={UserCog}>
                Change project manager
              </Button>
              <Button size="sm">Put on hold</Button>
              <Button size="sm" variant="danger">
                Close projects
              </Button>
            </>
          )}
          rowActions={(r) => (
            <>
              <MenuItem icon={Pencil}>Edit project</MenuItem>
              <MenuItem>View timesheets</MenuItem>
              <MenuItem>Create invoice</MenuItem>
              <MenuItem>{r.status === 'On hold' ? 'Resume project' : 'Put on hold'}</MenuItem>
              <MenuSeparator />
              <MenuItem destructive>Close project</MenuItem>
            </>
          )}
          onRowClick={() => {}}
          defaultSort={{ key: 'end', dir: 'asc' }}
          onExport={() => {}}
          toolbar={<FilterBar fields={PROJECT_FIELDS} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search project, code or client" />}
        />
      </div>
    );
  },
};

interface Approval {
  id: string;
  person: string;
  project: string;
  week: string;
  hours: number;
  expected: number;
}
const APPROVALS: Approval[] = [
  { id: 'a1', person: 'Priya Nair', project: 'ACME-WEB · Website rebuild', week: '22 – 28 Sep 2026', hours: 42, expected: 40 },
  { id: 'a2', person: 'Karthik Subramanian', project: 'ACME-WEB · Website rebuild', week: '22 – 28 Sep 2026', hours: 38, expected: 40 },
  { id: 'a3', person: 'Neha Joshi', project: 'NOVA-ERP · ERP integration', week: '22 – 28 Sep 2026', hours: 40, expected: 40 },
  { id: 'a4', person: 'Joseph Mathew', project: 'NOVA-ERP · ERP integration', week: '22 – 28 Sep 2026', hours: 51, expected: 40 },
];

export const RowButtons: StoryObj = {
  name: 'Row buttons · timesheet approvals',
  render: function Render() {
    const [done, setDone] = useState<Record<string, 'Approved' | 'Sent back'>>({});
    const [sel, setSel] = useState<string[]>([]);
    const cols: TableColumn<Approval>[] = [
      { key: 'person', header: 'Employee', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person, secondary: r.week }), width: 240 },
      { key: 'project', header: 'Project', value: (r) => r.project, width: 240 },
      {
        key: 'hours',
        header: 'Hours',
        type: 'number',
        value: (r) => r.hours,
        render: (r) => (
          <span style={{ color: r.hours > r.expected ? 'var(--yx-color-warning-text)' : undefined }}>
            {r.hours} / {r.expected} h
          </span>
        ),
        total: 'sum',
        width: 120,
      },
    ];
    return (
      <div style={{ padding: 24 }}>
        <Stack>
          <Section
            title="Inline row buttons: bordered small buttons, verb first (§14, §15)"
            note="Approve from the list without opening each row. Reject asks for a reason. Bulk approve only for rows within allocation."
          >
            <DataTable
              label="Timesheets to approve"
              columns={cols}
              rows={APPROVALS}
              getRowId={(r) => r.id}
              selectable
              selectedIds={sel}
              onSelectedChange={setSel}
              bulkActions={(ids) => (
                <Button
                  size="sm"
                  icon={Check}
                  onClick={() => {
                    setDone({ ...done, ...Object.fromEntries(ids.map((id) => [id, 'Approved' as const])) });
                    setSel([]);
                  }}
                >
                  Approve {ids.length}
                </Button>
              )}
              rowButtons={(r) =>
                done[r.id] ? (
                  <Badge tone={done[r.id] === 'Approved' ? 'success' : 'danger'}>{done[r.id]}</Badge>
                ) : (
                  <>
                    <Button size="sm" icon={X} onClick={() => setDone({ ...done, [r.id]: 'Sent back' })}>
                      Send back
                    </Button>
                    <Button size="sm" icon={Check} onClick={() => setDone({ ...done, [r.id]: 'Approved' })}>
                      Approve
                    </Button>
                  </>
                )
              }
              rowActions={() => (
                <>
                  <MenuItem>Review lines</MenuItem>
                  <MenuItem>Reduce hours…</MenuItem>
                </>
              )}
            />
          </Section>
        </Stack>
      </div>
    );
  },
};

// ---------- States ----------

const small = EMP_COLS.slice(0, 6);

export const StateLoading: StoryObj = {
  name: 'State · loading',
  render: () => (
    <div style={{ padding: 24 }}>
      <DataTable label="Employees" columns={small} rows={[]} getRowId={(r) => r.id} state="loading" selectable selectedIds={[]} rowActions={() => null} />
    </div>
  ),
};

export const StateError: StoryObj = {
  name: 'State · error',
  render: () => (
    <div style={{ padding: 24 }}>
      <DataTable label="Employees" columns={small} rows={[]} getRowId={(r) => r.id} state="error" errorTitle="We couldn't load employees." errorReference="REQ-7F3A-2291" onRetry={() => {}} />
    </div>
  ),
};

export const StateFirstUse: StoryObj = {
  name: 'State · first use (empty)',
  render: () => (
    <div style={{ padding: 24 }}>
      <DataTable
        label="Projects"
        columns={PROJECT_COLS}
        rows={[]}
        getRowId={(r) => r.id}
        empty={
          <EmptyState
            title="No projects yet"
            description="Create a project to let your team log time against it and bill clients from approved hours."
            action={<Button variant="primary">New project</Button>}
            help={<Link href="#">How projects and timesheets work</Link>}
          />
        }
      />
    </div>
  ),
};

export const StateNoResults: StoryObj = {
  name: 'State · no results for filters',
  render: () => (
    <div style={{ padding: 24 }}>
      <DataTable
        label="Employees"
        columns={small}
        rows={[]}
        getRowId={(r) => r.id}
        filtered
        onClearFilters={() => {}}
        toolbar={
          <FilterBar fields={EMP_FIELDS} value={[{ key: 'status', type: 'multi', values: ['Notice period'] }, { key: 'location', type: 'multi', values: ['Hosur plant'] }]} onChange={() => {}} search="zzz" onSearchChange={() => {}} />
        }
      />
    </div>
  ),
};

export const TenThousandRows: StoryObj = {
  name: '10,000 rows · virtual scroll',
  render: () => {
    const rows = makeEmployees(10000, 3);
    return (
      <div style={{ padding: 24 }}>
        <InlineAlert tone="info">Only the rows on screen are drawn. Header and the first column stay frozen while scrolling.</InlineAlert>
        <div style={{ height: 12 }} />
        <DataTable label="All employees" columns={EMP_COLS} rows={rows} getRowId={(r) => r.id} virtual height={520} defaultSort={{ key: 'code', dir: 'asc' }} selectable selectedIds={[]} />
      </div>
    );
  },
};

// ---------- Filters on their own ----------

export const FilterBarAllTypes: StoryObj = {
  name: 'Filter bar · every filter type',
  render: function Render() {
    const [f, setF] = useState<FilterValue[]>([
      { key: 'department', type: 'multi', values: ['Engineering', 'Quality', 'Sales'] },
      { key: 'joined', type: 'date', from: '2024-01-01', to: '2025-12-31' },
      { key: 'ctc', type: 'number', min: 50000, max: 150000 },
      { key: 'manager', type: 'text', contains: 'Bhat' },
      { key: 'location', type: 'multi', values: [] },
    ]);
    const [q, setQ] = useState('Divya');
    return (
      <div style={{ padding: 24 }}>
        <Stack>
          <Section title="Chips show the field and a readable summary. Each chip opens its editor; × removes it (§30)." note="A chip with no value yet reads 'Any'. Clear all removes filters and search.">
            <FilterBar fields={EMP_FIELDS} value={f} onChange={setF} search={q} onSearchChange={setQ} />
          </Section>
          <Section title="Shared URL for this view">
            <code className="yx-mono">?{filtersToQuery(f, q)}</code>
          </Section>
        </Stack>
      </div>
    );
  },
};

export const FilterChipOpen: StoryObj = {
  name: 'Filter bar · chip editor open',
  render: function Render() {
    const [f, setF] = useState<FilterValue[]>([{ key: 'department', type: 'multi', values: ['Engineering', 'Quality'] }]);
    return (
      <div style={{ padding: 24, minHeight: 420 }}>
        <FilterBar fields={EMP_FIELDS} value={f} onChange={setF} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    (canvasElement.querySelector('.yx-filter-chip__main') as HTMLButtonElement).click();
  },
};

// ---------- Drawer ----------

export const DrawerQuickEdit: StoryObj = {
  name: 'Drawer · quick edit with unsaved changes',
  render: function Render() {
    const [open, setOpen] = useState(true);
    const [title, setTitle] = useState('Senior QA Engineer');
    const [loc, setLoc] = useState<string | null>('maa');
    const dirty = title !== 'Senior QA Engineer' || loc !== 'maa';
    return (
      <div style={{ padding: 24 }}>
        <Button onClick={() => setOpen(true)}>Open drawer</Button>
        <Drawer
          open={open}
          onOpenChange={setOpen}
          title="Divya Raghunathan"
          subtitle="Engineering · KF-0142"
          meta={
            <>
              <Badge tone="warning">Probation ends 30 Sep</Badge>
              <Badge>Full time</Badge>
            </>
          }
          dirty={dirty}
          footer={
            <>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" disabled={!dirty}>
                Save changes
              </Button>
            </>
          }
        >
          <Stack gap={20}>
            <PersonLabel name="Divya Raghunathan" secondary="Reports to Rohit Bhat" size={40} />
            <FormField label="Job title" required>
              <TextField value={title} onChange={setTitle} />
            </FormField>
            <FormField label="Work location" required>
              <Select
                value={loc}
                onChange={setLoc}
                options={[
                  { value: 'blr', label: 'Bengaluru' },
                  { value: 'maa', label: 'Chennai' },
                  { value: 'hsr', label: 'Hosur plant' },
                ]}
              />
            </FormField>
            <InlineAlert tone="info">Change the title, then press Esc or Close to see the unsaved-changes check.</InlineAlert>
          </Stack>
        </Drawer>
      </div>
    );
  },
};
