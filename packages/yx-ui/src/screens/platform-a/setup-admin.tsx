// Set-up hub, tenant wizard, roles & access, approval policy editor, notification settings (PLT-08, 09, 11, 12, 13).
import { LiveTenantWizardScreen, type LiveTenantWizard } from './tenant-wizard-live';
import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Copy, Plus, ShieldCheck, Trash2, UserCog, Workflow } from 'lucide-react';
import { PageHeader, ObjectHeader, Card, Tabs, TabsContent, TabsList, TabsTrigger, DescriptionList } from '../../components/shell';
import { Button, IconButton, Link } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { ErrorState, InlineAlert, Meter, NoAccessState, Skeleton } from '../../components/feedback';
import { Stepper, SetupChecklist, type ChecklistSection } from '../../components/stepper';
import { FormField, FieldRow, FormSection } from '../../components/field';
import { TextField, CurrencyField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Checkbox, RadioGroup } from '../../components/choice';
import { ConditionBuilder } from '../../components/condition';
import { DataTable, type TableColumn } from '../../components/table';
import { Timeline } from '../../components/timeline';
import { MenuItem } from '../../components/menu';
import { emptyGroup, type Rule, type RuleSchema } from '../../lib/rules';
import { formatDate, formatINR } from '../../lib/format';
import { DesktopFrame } from '../_kit/frames';
import { ENTITIES, LOCATIONS, TODAY } from '../_kit/data';
import { ListPage, Tile, Workspace, readiness, settingsPanel, simulatePolicy, sodConflicts, type PolicyDef, type ReadinessCheck } from './platform-kit';
import { LivePolicyEditorScreen, type LivePolicyEditor } from './policy-editor-live';
import { PEOPLE, at, d } from './platform-data';

/* ================================================================ PLT-08 Set-up hub */

export interface ModuleCard {
  id: string;
  name: string;
  owner: string;
  checks: (ReadinessCheck & { label: string; starter?: boolean })[];
  signedOff?: string;
}

/**
 * Answer 952: the live hub. Each area's checks come from what the area already knows; nothing new is asked, so there
 * is no sign-off or go-live here (the design's buttons stay in the stories only). Start on a check opens its set-up page.
 */
export interface LiveSetupHub {
  state: 'loading' | 'error' | 'no-access' | 'ready';
  onRetry: () => void;
  onStart: (moduleId: string, checkId: string) => void;
}

export interface SetupHubProps {
  modules: ModuleCard[];
  openModule?: string;
  live?: LiveSetupHub;
}

// PLT-08 · Set-up hub / go-live readiness (completeness card per module). data-tour marks what the HR / System Admin
// first-run tour (6.1 TourAdmin) points at: the hub, the area cards and the starter defaults.
export function SetupHubScreen({ modules, openModule, live }: SetupHubProps) {
  const [picked, setPicked] = useState<string | undefined>(openModule);
  const all = modules.flatMap((m) => m.checks);
  const overall = readiness(all);
  const open = modules.find((m) => m.id === picked);
  const sections: ChecklistSection[] = open
    ? [{ id: open.id, title: open.name, tasks: open.checks.map((c) => ({ id: c.id, title: c.label, status: c.done ? 'done' : c.blocking ? 'todo' : 'in-progress', optional: !c.blocking, description: c.starter ? (live ? 'YukthiX starter — review it for your company' : 'YukthiX starter — review before go-live') : undefined })) }]
    : [];
  const frame = (body: ReactNode) => (
    <DesktopFrame area="settings" panelTitle="Settings" panel={settingsPanel('1.6 Set-up hub')}>
      {body}
    </DesktopFrame>
  );
  const header = (
    <PageHeader
      title="Set-up hub"
      description={live ? 'How much of each area is set up. Open an area to see what is left.' : "Every module's set-up in one place. Go live when all blocking checks are done and each owner has signed off."}
      status={live?.state === 'ready' || !live ? <Badge tone={overall.ready ? 'success' : 'warning'}>{overall.ready ? (live ? 'Set-up complete' : 'Ready for go-live') : `${overall.blockingOpen} blocking checks open`}</Badge> : undefined}
      actions={live ? undefined : <Button variant="primary" disabled={!overall.ready}>Go live on 1 Oct 2026</Button>}
    />
  );
  if (live && live.state !== 'ready')
    return frame(
      <>
        {header}
        {live.state === 'loading' && <Skeleton height={240} />}
        {live.state === 'error' && <ErrorState title="We couldn't load the set-up hub." description="Check your connection and try again." onRetry={live.onRetry} />}
        {live.state === 'no-access' && <NoAccessState what="the set-up hub" grantedBy="your System Admin" />}
      </>,
    );
  return frame(
    <div className="yx-plt-stack" data-tour="setup-hub">
      {header}
      <div className="yx-plt-grid" data-cols="3">
        <Tile title="Readiness score">
          <span className="yx-plt-score">{overall.score}%</span>
          <Meter value={overall.score} max={100} label="Readiness" warnAt={101} dangerAt={101} valueText={`${all.filter((c) => c.done).length} of ${all.length} checks done`} />
        </Tile>
        <Tile title="Blocking checks">
          <span className="yx-plt-score">{overall.blockingOpen}</span>
          <p className="yx-plt-muted">{live ? 'Must be done first; the rest can wait.' : 'Must be done before go-live. Advisory checks can wait.'}</p>
        </Tile>
        <div data-tour="setup-starter">
          <Tile title="Starter templates to review">
            <span className="yx-plt-score">{all.filter((c) => c.starter && !c.done).length}</span>
            <p className="yx-plt-muted">{live ? 'Still the YukthiX starter.' : 'Labelled “YukthiX starter — edit for your company”.'}</p>
          </Tile>
        </div>
      </div>
      <div className="yx-plt-grid" data-cols="3" data-tour="setup-modules">
        {modules.map((m) => {
          const r = readiness(m.checks);
          return (
            <Tile
              key={m.id}
              title={m.name}
              tone={r.blockingOpen ? 'warning' : 'success'}
              selected={m.id === picked}
              badge={<Badge tone={m.signedOff || (live && r.score === 100) ? 'success' : r.ready ? 'info' : 'warning'}>{m.signedOff ? 'Signed off' : r.ready ? (live ? (r.score === 100 ? 'Done' : `Nothing blocking · ${r.score}%`) : 'Ready to sign off') : `${r.blockingOpen} blocking`}</Badge>}
              actions={
                live ? undefined : (
                  <>
                    <Button size="sm" aria-pressed={m.id === picked} onClick={() => setPicked(m.id === picked ? undefined : m.id)}>
                      Open
                    </Button>
                    {r.ready && !m.signedOff && <Button size="sm">Sign off</Button>}
                  </>
                )
              }
            >
              <Meter value={r.score} max={100} label={`${m.name} complete`} warnAt={101} dangerAt={101} />
              {live ? (
                // 1033: owner and Open share one line, so both rows of cards fit 1278 x 635 without a page scroll.
                <div className="yx-plt-row" data-justify="between">
                  <p className="yx-plt-muted">Owner: {m.owner}</p>
                  <Button size="sm" aria-pressed={m.id === picked} onClick={() => setPicked(m.id === picked ? undefined : m.id)}>
                    {`Open ${m.name}`}
                  </Button>
                </div>
              ) : (
                <p className="yx-plt-muted">Owner: {m.owner}{m.signedOff ? ` · signed off ${m.signedOff}` : ''}</p>
              )}
            </Tile>
          );
        })}
      </div>
      {open && <SetupChecklist title={`${open.name}: checks`} sections={sections} onStart={(id) => live?.onStart(open.id, id)} onSkip={live ? undefined : () => {}} defaultShowDone />}
    </div>,
  );
}

/* ================================================================ PLT-09 Tenant set-up wizard */

export interface ImportPreviewRow {
  row: number;
  code: string;
  name: string;
  department: string;
  result: 'Create' | 'Error' | 'Warning';
  message?: string;
}

export function TenantWizardScreen({ current = 'company', errorStep, preview = [], live }: { current?: string; errorStep?: string; preview?: ImportPreviewRow[]; /** The YukthiX console's New company (C-5, answer 1053). */ live?: LiveTenantWizard }) {
  if (live) return <LiveTenantWizardScreen live={live} />;
  const [company, setCompany] = useState('Kaveri Foods Pvt Ltd');
  const [pan, setPan] = useState(errorStep === 'entities' ? 'AAECK1234' : 'AAECK1234F');
  const [deptMode, setDeptMode] = useState('template');
  const cols: TableColumn<ImportPreviewRow>[] = [
    { key: 'row', header: 'Row', type: 'number', value: (r) => r.row, width: 64 },
    { key: 'code', header: 'Code', type: 'id', value: (r) => r.code },
    { key: 'name', header: 'Name', value: (r) => r.name },
    { key: 'department', header: 'Department', value: (r) => r.department },
    { key: 'result', header: 'Result', type: 'status', value: (r) => r.result, statusTone: (v) => (v === 'Error' ? 'danger' : v === 'Warning' ? 'warning' : 'success') },
    { key: 'message', header: 'What to fix', value: (r) => r.message ?? '', width: 320 },
  ];
  const errors = preview.filter((p) => p.result === 'Error').length;
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={settingsPanel('1.6 Set-up hub')}>
      <PageHeader title="Set up your company" description="Six steps. You can save and come back; nothing is live until go-live." />
      <Stepper
        title="Set up your company"
        defaultCurrent={current}
        finishLabel="Finish set-up"
        onSaveAndExit={() => {}}
        review={{ title: 'Review', description: 'Check everything before you finish.' }}
        steps={[
          {
            id: 'company',
            title: 'Company details',
            description: 'Name, brand and language',
            content: (
              <FormSection title="Company details">
                <FormField label="Company name" required>
                  <TextField value={company} onChange={setCompany} />
                </FormField>
                <FieldRow>
                  <FormField label="Default language">
                    <Select options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'Hindi' }, { value: 'ta', label: 'Tamil' }, { value: 'te', label: 'Telugu' }]} value="en" onChange={() => {}} />
                  </FormField>
                  <FormField label="Data region" helper="Fixed after sign-up.">
                    <TextField value="India (IN)" readOnly />
                  </FormField>
                </FieldRow>
              </FormSection>
            ),
            summary: <DescriptionList items={[{ label: 'Company', value: company }, { label: 'Region', value: 'India (IN)' }]} />,
          },
          {
            id: 'entities',
            title: 'Legal entities',
            description: 'Statutory IDs per entity',
            status: errorStep === 'entities' ? 'error' : undefined,
            statusNote: errorStep === 'entities' ? 'Fix the PAN' : undefined,
            content: (
              <FormSection title="Legal entities" description="Add each company that employs people. One is the default.">
                {ENTITIES.map((e, i) => (
                  <Card key={e.id} title={e.name} actions={i === 0 ? <Badge tone="info">Default</Badge> : undefined}>
                    <FieldRow>
                      <FormField label="PAN" required error={i === 0 && pan.length !== 10 ? 'Enter a 10-character PAN like ABCDE1234F.' : null}>
                        <TextField value={i === 0 ? pan : 'AAECK1234F'} onChange={i === 0 ? setPan : undefined} />
                      </FormField>
                      <FormField label="GSTIN">
                        <TextField value={e.gstin} readOnly />
                      </FormField>
                      <FormField label="State">
                        <TextField value={e.state} readOnly />
                      </FormField>
                    </FieldRow>
                  </Card>
                ))}
                <Button icon={Plus}>Add legal entity</Button>
              </FormSection>
            ),
            summary: <p className="yx-plt-p">{ENTITIES.length} entities · default {ENTITIES[0].name}</p>,
          },
          {
            id: 'locations',
            title: 'Locations',
            description: 'State, timezone, holidays',
            content: (
              <FormSection title="Locations">
                <ul className="yx-plt-list">
                  {LOCATIONS.map((l) => (
                    <li key={l.id}>
                      <div className="yx-plt-list__main">
                        <strong>{l.name}</strong>
                        <span className="yx-plt-muted">
                          {l.state} · Asia/Kolkata · {l.state} holidays 2026 · geofence {l.radiusM} m
                        </span>
                      </div>
                      <Button size="sm">Edit</Button>
                    </li>
                  ))}
                </ul>
                <Button icon={Plus}>Add location</Button>
              </FormSection>
            ),
            summary: <p className="yx-plt-p">{LOCATIONS.length} locations</p>,
          },
          {
            id: 'departments',
            title: 'Departments',
            description: 'Template or import',
            content: (
              <FormSection title="Departments">
                <RadioGroup
                  aria-label="How to add departments"
                  value={deptMode}
                  onChange={setDeptMode}
                  options={[
                    { value: 'template', label: 'Start from the manufacturing template', description: 'YukthiX starter — edit for your company: Operations, Quality, Engineering, Sales, Finance, People' },
                    { value: 'import', label: 'Import from Excel' },
                    { value: 'blank', label: 'Add them one by one' },
                  ]}
                />
              </FormSection>
            ),
            summary: <p className="yx-plt-p">Manufacturing template · 6 departments</p>,
          },
          {
            id: 'grades',
            title: 'Designations & grades',
            content: (
              <FormSection title="Designations and grades">
                <FieldRow>
                  <FormField label="Grades">
                    <TextField value="G1 to G8" readOnly />
                  </FormField>
                  <FormField label="Designations">
                    <TextField value="42 from template" readOnly />
                  </FormField>
                </FieldRow>
              </FormSection>
            ),
            summary: <p className="yx-plt-p">8 grades · 42 designations</p>,
          },
          {
            id: 'import',
            title: 'Import employees',
            description: 'Excel with validation preview',
            status: errors ? 'error' : undefined,
            statusNote: errors ? `${errors} rows need fixing` : undefined,
            content: (
              <FormSection title="Import employees" description="Download the template, fill it and upload. Nothing is saved until you confirm the preview.">
                <div className="yx-plt-row">
                  <Button>Download template</Button>
                  <Button>Upload file</Button>
                </div>
                {preview.length > 0 && (
                  <>
                    <InlineAlert tone={errors ? 'danger' : 'success'} title={`employees.xlsx · ${preview.length} rows checked`}>
                      {preview.filter((p) => p.result === 'Create').length} will be created, {preview.filter((p) => p.result === 'Warning').length} need acknowledgement, {errors} blocked until fixed.
                    </InlineAlert>
                    <DataTable label="Import preview" columns={cols} rows={preview} getRowId={(r) => String(r.row)} />
                  </>
                )}
              </FormSection>
            ),
            summary: <p className="yx-plt-p">{preview.length ? `${preview.length} rows · ${errors} errors` : 'Not started'}</p>,
          },
        ]}
      />
    </DesktopFrame>
  );
}

/* ================================================================ PLT-11 Roles & access */

export interface RoleRow {
  id: string;
  name: string;
  kind: 'Template' | 'Custom';
  scope: string;
  holders: number;
  updated: Date;
}

const FIELD_CLASSES = ['Public', 'Internal', 'Personal', 'Confidential', 'Special'] as const;
const ACCESS = ['Hidden', 'Masked', 'Read', 'Edit'] as const;
type Access = (typeof ACCESS)[number];

export const PERMISSION_GROUPS: { module: string; perms: { key: string; label: string }[] }[] = [
  { module: 'People', perms: [{ key: 'employee.view', label: 'View employee records' }, { key: 'employee.edit', label: 'Edit employee records' }, { key: 'employee.bank.edit', label: 'Change bank details' }] },
  { module: 'Time', perms: [{ key: 'leave.approve', label: 'Approve leave' }, { key: 'attendance.lock', label: 'Lock attendance periods' }, { key: 'attendance.lock.approve', label: 'Approve attendance lock' }, { key: 'leave.liability.view', label: 'View leave liability' }] },
  { module: 'Pay', perms: [{ key: 'payroll.run.prepare', label: 'Prepare payroll run' }, { key: 'payroll.run.approve', label: 'Approve payroll run' }, { key: 'bank.file.create', label: 'Create bank file' }, { key: 'bank.file.release', label: 'Release bank file' }] },
  { module: 'Administration', perms: [{ key: 'role.manage', label: 'Manage roles' }, { key: 'request.raise_on_behalf', label: 'Raise requests on behalf of others' }] },
];

export interface RolesAccessProps {
  roles: RoleRow[];
  view: 'list' | 'role' | 'user';
  tab?: 'permissions' | 'fields' | 'risk' | 'holders' | 'preview';
  granted?: string[];
}

function RoleWorkspace({ role, tab = 'permissions', granted: initial = [] }: { role: RoleRow; tab?: string; granted?: string[] }) {
  const [granted, setGranted] = useState<string[]>(initial);
  const [classes, setClasses] = useState<Record<string, Access>>({ Public: 'Read', Internal: 'Read', Personal: 'Read', Confidential: 'Masked', Special: 'Hidden' });
  const conflicts = sodConflicts(granted);
  return (
    <>
      <ObjectHeader
        name={role.name}
        icon={ShieldCheck}
        secondary={`${role.kind} role · scope ${role.scope}`}
        status={<Badge tone={conflicts.length ? 'warning' : 'success'}>{conflicts.length ? `${conflicts.length} risk${conflicts.length > 1 ? 's' : ''}` : 'No risks'}</Badge>}
        facts={[
          { label: 'People with this role', value: role.holders },
          { label: 'Permissions', value: granted.length },
          { label: 'Last changed', value: formatDate(role.updated) },
        ]}
        actions={
          <>
            <Button icon={Copy}>Clone role</Button>
            <Button variant="primary">Save role</Button>
          </>
        }
      />
      <Workspace
        aside={
          <>
            <h2 className="yx-plt-h">Changes</h2>
            <Timeline
              today={TODAY}
              items={[
                { id: 't1', actor: { name: 'Lakshmi Venkatesan' }, action: 'added Approve leave', at: at(22, 14, 5) },
                { id: 't2', actor: { name: 'Lakshmi Venkatesan' }, action: 'cloned from HR Admin template', at: at(2, 10, 0) },
              ]}
            />
          </>
        }
      >
        <Tabs defaultValue={tab}>
          <TabsList aria-label="Role sections">
            <TabsTrigger value="permissions" count={granted.length}>Permissions</TabsTrigger>
            <TabsTrigger value="fields">Field classes</TabsTrigger>
            <TabsTrigger value="risk" count={conflicts.length || undefined}>Risk check</TabsTrigger>
            <TabsTrigger value="holders" count={role.holders}>Who has this role</TabsTrigger>
          </TabsList>
          <TabsContent value="permissions">
            <div className="yx-plt-stack">
              {PERMISSION_GROUPS.map((g) => (
                <FormSection key={g.module} title={g.module}>
                  {g.perms.map((p) => (
                    <Checkbox key={p.key} label={p.label} description={p.key} checked={granted.includes(p.key)} onChange={(c) => setGranted((xs) => (c ? [...xs, p.key] : xs.filter((x) => x !== p.key)))} />
                  ))}
                </FormSection>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="fields">
            <div className="yx-plt-scroll" tabIndex={0} role="region" aria-label={`Field class access for ${role.name}`}>
              <table className="yx-plt-matrix">
                <caption className="yx-visually-hidden">Field class access for {role.name}</caption>
                <thead>
                  <tr>
                    <th scope="col">Field class</th>
                    {ACCESS.map((a) => (
                      <th key={a} scope="col">{a}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FIELD_CLASSES.map((c) => (
                    <tr key={c}>
                      <th scope="row">
                        {c}
                        {c === 'Special' && <span className="yx-plt-muted"> · health, Aadhaar, POSH</span>}
                      </th>
                      {ACCESS.map((a) => (
                        <td key={a}>
                          <input
                            type="radio"
                            name={`class-${c}`}
                            aria-label={`${c}: ${a}`}
                            checked={classes[c] === a}
                            onChange={() => setClasses((x) => ({ ...x, [c]: a }))}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="yx-plt-muted">Masked values show the last 4 characters. Revealing one is audited.</p>
          </TabsContent>
          <TabsContent value="risk">
            {conflicts.length ? (
              <div className="yx-plt-stack">
                {conflicts.map((c) => (
                  <InlineAlert key={c} tone="warning" title="Separation of duties">
                    One person could {c.toLowerCase()}. Split these permissions across two roles, or keep them and record why.
                  </InlineAlert>
                ))}
              </div>
            ) : (
              <InlineAlert tone="success" title="No conflicting permissions">
                This role can't both prepare and approve the same work.
              </InlineAlert>
            )}
          </TabsContent>
          <TabsContent value="holders">
            <ul className="yx-plt-list">
              {PEOPLE.slice(0, 4).map((p, i) => (
                <li key={p.id}>
                  <PersonLabel name={p.name} secondary={`${p.role} · scope ${i === 0 ? 'Chennai office' : 'Kaveri Foods Pvt Ltd'} · until ${i === 2 ? '31 Oct 2026' : 'no end date'}`} />
                  <Button size="sm">Remove</Button>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>
      </Workspace>
    </>
  );
}

function UserAccess() {
  const grants = [
    { id: 'g1', role: 'Line manager', scope: 'Direct and indirect reports (14 people)', from: d(1, 0), to: null as Date | null },
    { id: 'g2', role: 'Employee', scope: 'Self', from: d(12, 0), to: null },
    { id: 'g3', role: 'Auditor', scope: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', from: d(1), to: d(31, 9) },
  ];
  return (
    <>
      <ObjectHeader name="Vikram Rao" person secondary="Plant Supervisor · Operations · Hosur plant" facts={[{ label: 'Roles', value: 3 }, { label: 'Signed in', value: '29 Sep 2026, 8:02 am' }, { label: 'MFA', value: 'Passkey' }]} actions={<Button variant="primary" icon={Plus}>Add grant</Button>} />
      <Card title="Effective access preview">
        <p className="yx-plt-p">Vikram can approve leave for 14 people, view salary for 0 people, and read the audit log of Kaveri Foods Pvt Ltd (Tamil Nadu) until 31 Oct 2026.</p>
      </Card>
      <DataTable
        label="Grants"
        columns={[
          { key: 'role', header: 'Role', value: (r) => r.role },
          { key: 'scope', header: 'Scope', value: (r) => r.scope, width: 320 },
          { key: 'from', header: 'From', type: 'date', value: (r) => r.from },
          { key: 'to', header: 'Until', type: 'date', value: (r) => r.to, render: (r) => (r.to ? formatDate(r.to) : 'No end date') },
        ]}
        rows={grants}
        getRowId={(r) => r.id}
        rowActions={() => (
          <>
            <MenuItem>Change dates</MenuItem>
            <MenuItem destructive icon={Trash2}>End grant</MenuItem>
          </>
        )}
      />
    </>
  );
}

// PLT-11 · Roles & access.
export function RolesAccessScreen({ roles, view, tab, granted }: RolesAccessProps) {
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={settingsPanel('2.1 Roles & access')}>
      {view === 'list' && (
        <ListPage
          title="Roles & access"
          description="Roles give permissions over a scope. Start from a template and clone it to change it."
          actions={<Button variant="primary" icon={Plus}>New role</Button>}
          label="Roles"
          columns={[
            { key: 'name', header: 'Role', value: (r: RoleRow) => r.name, render: (r) => <Link href="#">{r.name}</Link> },
            { key: 'kind', header: 'Type', type: 'status', value: (r) => r.kind, statusTone: (v) => (v === 'Template' ? 'neutral' : 'info') },
            { key: 'scope', header: 'Default scope', value: (r) => r.scope },
            { key: 'holders', header: 'People', type: 'number', value: (r) => r.holders },
            { key: 'updated', header: 'Last changed', type: 'date', value: (r) => r.updated },
          ]}
          rows={roles}
          getRowId={(r) => r.id}
          filters={[{ key: 'kind', label: 'Type', type: 'multi', options: [{ value: 'Template', label: 'Template' }, { value: 'Custom', label: 'Custom' }] }]}
          searchPlaceholder="Search roles"
          rowActions={() => (
            <>
              <MenuItem icon={Copy}>Clone role</MenuItem>
              <MenuItem icon={UserCog}>Who has this role</MenuItem>
            </>
          )}
        />
      )}
      {view === 'role' && <RoleWorkspace role={roles[2]} tab={tab} granted={granted} />}
      {view === 'user' && <UserAccess />}
    </DesktopFrame>
  );
}

/* ================================================================ PLT-12 Approval policy editor */

export const EXPENSE_SCHEMA: RuleSchema = {
  triggers: [{ value: 'expense.submitted', label: 'Expense claim submitted' }],
  fields: [
    { key: 'amount', label: 'Amount', type: 'money' },
    { key: 'category', label: 'Category', type: 'choice', options: [{ value: 'Travel', label: 'Travel' }, { value: 'Meals', label: 'Meals' }, { value: 'Internet', label: 'Internet' }] },
    { key: 'grade', label: 'Grade', type: 'choice', options: ['G3', 'G4', 'G5', 'G6'].map((g) => ({ value: g, label: g })) },
    { key: 'entity', label: 'Legal entity', type: 'choice', options: ENTITIES.map((e) => ({ value: e.id, label: e.name })) },
    { key: 'project_billable', label: 'Project billable (custom)', type: 'choice', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
  ],
  recipients: [{ value: 'manager', label: 'Reporting manager' }, { value: 'finance', label: 'Finance team' }],
};

export const EXPENSE_POLICIES: (PolicyDef & { steps: string[]; version: number })[] = [
  { id: 'p1', name: 'Travel above ₹10,000', priority: 1, when: [{ field: 'amount', op: 'gt', value: 10000 }, { field: 'category', op: 'eq', value: 'Travel' }], steps: ['Reporting manager', 'Department head', 'Finance team'], version: 3 },
  { id: 'p2', name: 'Senior grades', priority: 2, when: [{ field: 'grade', op: 'in', value: ['G6'] }], steps: ['Skip-level manager', 'Finance team'], version: 1 },
  { id: 'p3', name: 'Default (catch-all)', priority: 99, isDefault: true, when: [], steps: ['Reporting manager', 'Finance team (skip if ≤ ₹5,000)'], version: 2 },
];

const POLICY_RULE: Rule = {
  trigger: 'expense.submitted',
  conditions: { ...emptyGroup(), join: 'and', items: [{ id: 'c1', field: 'amount', operator: 'gt', value: 10000 }, { id: 'c2', field: 'category', operator: 'is', value: 'Travel' }] },
  actions: [],
};

export function PolicyEditorScreen({ simulated: simProp = false, saveTried = false, live }: { simulated?: boolean; saveTried?: boolean; /** Settings S-6 (answer 1330): the company's approval steps per request type. */ live?: LivePolicyEditor }) {
  if (live) return <LivePolicyEditorScreen live={live} />;
  const [policies, setPolicies] = useState(EXPENSE_POLICIES);
  const [amount, setAmount] = useState<number | null>(12400);
  const [cat, setCat] = useState<string | null>('Travel');
  const [grade, setGrade] = useState<string | null>('G5');
  const [simulated, setSimulated] = useState(simProp);
  const [tried, setTried] = useState(saveTried);
  const match = simulatePolicy(policies, { amount: amount ?? 0, category: cat ?? '', grade: grade ?? '' });
  const move = (id: string, delta: number) =>
    setPolicies((xs) => {
      const movable = xs.filter((p) => !p.isDefault);
      const i = movable.findIndex((p) => p.id === id);
      const j = i + delta;
      if (j < 0 || j >= movable.length) return xs;
      [movable[i], movable[j]] = [movable[j], movable[i]];
      return [...movable.map((p, k) => ({ ...p, priority: k + 1 })), ...xs.filter((p) => p.isDefault)];
    });
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={settingsPanel('2.3 Approvals')}>
      <ObjectHeader
        name="Expense claim approvals"
        icon={Workflow}
        secondary="Request type: Expense claim · first matching policy wins · catch-all required"
        status={<Badge tone="info">Draft of version 4</Badge>}
        facts={[{ label: 'Policies', value: policies.length }, { label: 'Applies to', value: 'All entities' }, { label: 'Changes affect', value: 'New requests only' }]}
        actions={
          <>
            <Button>Discard</Button>
            <Button variant="primary" onClick={() => setTried(true)}>
              Save as version 4
            </Button>
          </>
        }
      />
      {tried && !simulated && (
        <InlineAlert tone="danger" title="Run Simulate before saving">
          Saving a policy needs a Simulate run so you can see who would approve. Use the Simulate panel on the right.
        </InlineAlert>
      )}
      <Workspace
        asideLabel="Simulate"
        aside={
          <>
            <h2 className="yx-plt-h">Simulate</h2>
            <p className="yx-plt-muted">Try a sample request to see which policy matches and who would approve.</p>
            <FormField label="Amount">
              <CurrencyField value={amount} onChange={setAmount} />
            </FormField>
            <FormField label="Category">
              <Select options={EXPENSE_SCHEMA.fields[1].options!} value={cat} onChange={setCat} />
            </FormField>
            <FormField label="Grade">
              <Select options={EXPENSE_SCHEMA.fields[2].options!} value={grade} onChange={setGrade} />
            </FormField>
            <Button onClick={() => setSimulated(true)}>Simulate</Button>
            {simulated && match && (
              <InlineAlert tone="info" title={`Matches: ${match.name}`}>
                {EXPENSE_POLICIES.find((p) => p.id === match.id)?.steps.join(' → ')}. Pooja Nair's request of {formatINR(amount ?? 0)} would go to Rajesh Menon, then Suresh Pillai.
              </InlineAlert>
            )}
          </>
        }
      >
        {policies.map((p, i) => (
          <Card
            key={p.id}
            title={`${p.isDefault ? 'Default' : `Priority ${p.priority}`} · ${p.name}`}
            actions={
              !p.isDefault && (
                <>
                  <IconButton icon={ArrowUp} label={`Move ${p.name} up`} disabled={i === 0} onClick={() => move(p.id, -1)} />
                  <IconButton icon={ArrowDown} label={`Move ${p.name} down`} disabled={i >= policies.length - 2} onClick={() => move(p.id, 1)} />
                </>
              )
            }
          >
            <div className="yx-plt-stack">
              {p.id === 'p1' ? (
                <ConditionBuilder schema={EXPENSE_SCHEMA} defaultValue={POLICY_RULE} parts={['if']} />
              ) : (
                <p className="yx-plt-muted">{p.isDefault ? 'Matches every request no other policy matches. It can’t be deleted.' : 'If grade is one of G6'}</p>
              )}
              <div className="yx-plt-grid">
                {p.steps.map((s, k) => (
                  <Tile key={s} title={`Step ${k + 1}`} badge={<Badge>{k === 0 ? 'Any one' : 'All'}</Badge>}>
                    <span>{s}</span>
                    <span className="yx-plt-muted">SLA 2 working days · escalate to their manager · fallback HR Admin of the entity</span>
                  </Tile>
                ))}
                <Button icon={Plus}>Add step</Button>
              </div>
            </div>
          </Card>
        ))}
      </Workspace>
    </DesktopFrame>
  );
}
