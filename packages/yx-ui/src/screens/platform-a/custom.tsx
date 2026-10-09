// Customisation: object builder, layout builder, request-type builder, packages, generated list + record (PLT-22…26).
import { useState, type DragEvent } from 'react';
import { ArrowLeft, Boxes, Download, EyeOff, GripVertical, Lock, Monitor, MoveRight, Plus, Smartphone, Upload } from 'lucide-react';
import { PageHeader, ObjectHeader, Card, Tabs, TabsContent, TabsList, TabsTrigger, DescriptionList } from '../../components/shell';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { Stepper } from '../../components/stepper';
import { FormField, FieldRow } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Checkbox, RadioGroup } from '../../components/choice';
import { DataTable, type TableColumn } from '../../components/table';
import { ConditionBuilder } from '../../components/condition';
import { Timeline } from '../../components/timeline';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '../../components/menu';
import { FileUpload } from '../../components/upload';
import { Icon } from '../../components/foundations';
import { emptyGroup, type Rule, type RuleSchema } from '../../lib/rules';
import { formatDate } from '../../lib/format';
import { DesktopFrame, PhoneFrame } from '../_kit/frames';
import { TODAY } from '../_kit/data';
import { DiffTable, ListPage, Tile, Workspace, settingsPanel, toneFor } from './platform-kit';
import { at } from './platform-data';

const custPanel = () => settingsPanel('1.7 Customisation');

/* ================================================================ PLT-22 Custom object builder */

export type FieldClass = 'Internal' | 'Personal' | 'Confidential' | 'Special';

export interface CustomField {
  api: string;
  label: string;
  type: 'Text' | 'Number' | 'Date' | 'Pick-list' | 'Lookup' | 'File' | 'Currency';
  cls: FieldClass;
  required?: boolean;
  unique?: boolean;
  validation?: string;
}

const SENSITIVE: [RegExp, string][] = [
  [/health|medical|disab/i, 'health or disability'],
  [/aadhaar|aadhar/i, 'Aadhaar'],
  [/caste|religio/i, 'caste or religion'],
  [/biometric|finger/i, 'biometric'],
];
/** P18 §4.1: warn when a label looks sensitive and require Special for recognised categories. */
export function sensitiveCategory(label: string): string | null {
  return SENSITIVE.find(([re]) => re.test(label))?.[1] ?? null;
}
/** API names are lower snake case, start with a letter, max 40 characters. */
export const apiNameFrom = (label: string) =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'f_$1').slice(0, 40);

export const UNIFORM_FIELDS: CustomField[] = [
  { api: 'employee', label: 'Employee', type: 'Lookup', cls: 'Internal', required: true },
  { api: 'item', label: 'Item', type: 'Pick-list', cls: 'Internal', required: true },
  { api: 'size', label: 'Size', type: 'Pick-list', cls: 'Internal' },
  { api: 'issued_on', label: 'Issued on', type: 'Date', cls: 'Internal', required: true },
  { api: 'return_due', label: 'Return due', type: 'Date', cls: 'Internal', validation: 'Return due ≥ Issued on' },
  { api: 'deposit', label: 'Deposit', type: 'Currency', cls: 'Confidential' },
  { api: 'serial_no', label: 'Serial number', type: 'Text', cls: 'Internal', unique: true, validation: 'Pattern KF-PPE-#####' },
  { api: 'site', label: 'Site', type: 'Lookup', cls: 'Internal' },
  { api: 'signed_receipt', label: 'Signed receipt', type: 'File', cls: 'Internal' },
];

function RelationshipDiagram() {
  const boxes = [
    { x: 250, y: 90, label: 'Uniform & PPE issue', sub: 'this object', self: true },
    { x: 10, y: 10, label: 'Employee', sub: 'lookup · many-to-one' },
    { x: 10, y: 170, label: 'Location (Site)', sub: 'lookup · many-to-one' },
    { x: 500, y: 90, label: 'PPE return', sub: 'child · master–detail' },
  ];
  return (
    <svg className="yx-plt-diagram" viewBox="0 0 700 240" role="img" aria-label="Relationships: Uniform & PPE issue looks up Employee and Location, and has child PPE return records">
      <line x1="190" y1="40" x2="250" y2="110" />
      <line x1="190" y1="200" x2="250" y2="130" />
      <line x1="440" y1="120" x2="500" y2="120" />
      {boxes.map((b) => (
        <g key={b.label}>
          <rect x={b.x} y={b.y} width={190} height={60} rx={6} data-self={b.self || undefined} />
          <text x={b.x + 12} y={b.y + 26}>{b.label}</text>
          <text x={b.x + 12} y={b.y + 46} data-muted>
            {b.sub}
          </text>
        </g>
      ))}
    </svg>
  );
}

export interface ObjectBuilderProps {
  tab?: 'fields' | 'relationships' | 'scope' | 'starters';
  fieldSheet?: { label: string; cls: FieldClass; type: CustomField['type'] } | null;
  status?: 'Draft' | 'Active';
}

// PLT-22 · Custom object builder.
export function ObjectBuilderScreen({ tab = 'fields', fieldSheet = null, status = 'Draft' }: ObjectBuilderProps) {
  const [sheet, setSheet] = useState(fieldSheet);
  const [label, setLabel] = useState(fieldSheet?.label ?? '');
  const [cls, setCls] = useState<string | null>(fieldSheet?.cls ?? 'Internal');
  const [regexTest, setRegexTest] = useState('KF-PPE-00412');
  const sensitive = sensitiveCategory(label);
  const needsSpecial = Boolean(sensitive) && cls !== 'Special';
  const columns: TableColumn<CustomField>[] = [
    { key: 'label', header: 'Field', value: (r) => r.label },
    { key: 'api', header: 'API name', type: 'id', value: (r) => r.api },
    { key: 'type', header: 'Type', value: (r) => r.type },
    { key: 'cls', header: 'Class', type: 'status', value: (r) => r.cls, statusTone: (v) => (v === 'Special' ? 'danger' : v === 'Confidential' ? 'warning' : 'neutral') },
    { key: 'rules', header: 'Rules', value: (r) => [r.required && 'Required', r.unique && 'Unique', r.validation].filter(Boolean).join(' · ') },
  ];
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={custPanel()}>
      <ObjectHeader
        name="Uniform & PPE issue"
        icon={Boxes}
        secondary="Custom object · api name uniform_ppe_issue · placed under People › More"
        status={<Badge tone={toneFor(status)}>{status}</Badge>}
        facts={[
          { label: 'Fields', value: `${UNIFORM_FIELDS.length} of 200` },
          { label: 'Scope model', value: 'Follows employee' },
          { label: 'Records', value: status === 'Active' ? '1,210' : 'None yet' },
          { label: 'Started from', value: 'YukthiX starter' },
        ]}
        actions={
          <>
            <Button>Preview layout</Button>
            <Button variant="primary">{status === 'Draft' ? 'Activate in sandbox' : 'Save changes'}</Button>
          </>
        }
      />
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Object builder">
          <TabsTrigger value="fields" count={UNIFORM_FIELDS.length}>Fields</TabsTrigger>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
          <TabsTrigger value="scope">Scope model</TabsTrigger>
          <TabsTrigger value="starters">Starters</TabsTrigger>
        </TabsList>
        <TabsContent value="fields">
          <div className="yx-plt-stack">
            <div className="yx-plt-row">
              <Button icon={Plus} onClick={() => setSheet({ label: '', cls: 'Internal', type: 'Text' })}>
                Add field
              </Button>
            </div>
            <DataTable label="Fields" columns={columns} rows={UNIFORM_FIELDS} getRowId={(r) => r.api} onRowClick={(r) => { setSheet(r); setLabel(r.label); setCls(r.cls); }} />
          </div>
        </TabsContent>
        <TabsContent value="relationships">
          <Card title="Relationships" actions={<Button size="sm" icon={Plus}>Add relationship</Button>}>
            <RelationshipDiagram />
            <p className="yx-plt-muted">Deleting an issue deletes its PPE return records; you see a preview first.</p>
          </Card>
        </TabsContent>
        <TabsContent value="scope">
          <Card title="Who can see records">
            <RadioGroup
              aria-label="Scope model"
              defaultValue="employee"
              options={[
                { value: 'employee', label: 'Follows the employee', description: 'Anyone who can see the employee can see their issues (managers, HR in scope).' },
                { value: 'owner', label: 'Owner and their managers' },
                { value: 'entity', label: 'Everyone in the legal entity' },
                { value: 'restricted', label: 'Named members only' },
              ]}
            />
            <InlineAlert tone="info" title="Changing this later re-checks visibility and search for every record." />
          </Card>
        </TabsContent>
        <TabsContent value="starters">
          <div className="yx-plt-grid" data-cols="3">
            {['Vehicle register', 'Uniform & PPE issue', 'Canteen / transport pass', 'Union membership', 'Site induction'].map((s) => (
              <Tile key={s} title={s} badge={<Badge tone="info">YukthiX starter</Badge>} selected={s === 'Uniform & PPE issue'} actions={<Button size="sm">Use starter</Button>}>
                <p className="yx-plt-muted">Edit for your company after you start.</p>
              </Tile>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      {sheet && (
        <Drawer
          open
          onOpenChange={(o) => !o && setSheet(null)}
          title={sheet.label ? `Field · ${sheet.label}` : 'Add field'}
          size="lg"
          footer={
            <>
              <Button onClick={() => setSheet(null)}>Cancel</Button>
              <Button variant="primary" disabled={needsSpecial}>
                Save field
              </Button>
            </>
          }
        >
          <div className="yx-plt-stack">
            <FieldRow>
              <FormField label="Label" required>
                <TextField value={label} onChange={setLabel} />
              </FormField>
              <FormField label="API name" helper="Fixed once the object is active.">
                <TextField value={apiNameFrom(label)} readOnly />
              </FormField>
            </FieldRow>
            <FieldRow>
              <FormField label="Type">
                <Select options={['Text', 'Number', 'Date', 'Pick-list', 'Lookup', 'File', 'Currency'].map((t) => ({ value: t, label: t }))} value={sheet.type} onChange={() => {}} />
              </FormField>
              <FormField label="Data class" error={needsSpecial ? `This looks like ${sensitive} data. Set the class to Special.` : null}>
                <Select options={['Internal', 'Personal', 'Confidential', 'Special'].map((t) => ({ value: t, label: t }))} value={cls} onChange={setCls} />
              </FormField>
            </FieldRow>
            {sensitive && (
              <InlineAlert tone="warning" title="Sensitive field">
                {sensitive[0].toUpperCase() + sensitive.slice(1)} data is Special: only named roles see it, it is never searchable and every view is audited.
              </InlineAlert>
            )}
            <Checkbox label="Required" />
            <Checkbox label="Unique per legal entity" />
            <FormField label="Pattern" optional helper="Test it with an example before saving.">
              <TextField defaultValue="^KF-PPE-\d{5}$" className="yx-plt-formula" />
            </FormField>
            <FormField label="Test value" helper={/^KF-PPE-\d{5}$/.test(regexTest) ? 'Matches the pattern.' : undefined} error={/^KF-PPE-\d{5}$/.test(regexTest) ? null : 'Doesn’t match: use KF-PPE and 5 digits.'}>
              <TextField value={regexTest} onChange={setRegexTest} />
            </FormField>
          </div>
        </Drawer>
      )}
    </DesktopFrame>
  );
}

/* ================================================================ PLT-23 Form & page-layout builder */

export interface LayoutSection {
  id: string;
  title: string;
  columns: 1 | 2;
  fields: { api: string; label: string; locked?: boolean; hidden?: boolean; deskOnly?: boolean; conditional?: string }[];
}

export const EMPLOYEE_LAYOUT: LayoutSection[] = [
  { id: 's1', title: 'Personal', columns: 2, fields: [{ api: 'full_name', label: 'Full name', locked: true }, { api: 'dob', label: 'Date of birth', locked: true }, { api: 'blood_group', label: 'Blood group' }, { api: 'languages', label: 'Languages spoken', deskOnly: true }] },
  { id: 's2', title: 'Statutory IDs', columns: 2, fields: [{ api: 'pan', label: 'PAN', locked: true }, { api: 'uan', label: 'UAN', locked: true }] },
  { id: 's3', title: 'Plant details', columns: 1, fields: [{ api: 'uniform_size', label: 'Uniform size', conditional: 'Show when Department is Operations' }, { api: 'licence_no', label: 'Licence number', conditional: 'Show when Vehicle type is Two-wheeler' }] },
];
const PALETTE_FIELDS = ['Vehicle type', 'Canteen pass number', 'Shoe size', 'Emergency contact 2'];

/** Move a field between sections (keyboard / menu alternative to drag). */
export function moveField(sections: LayoutSection[], api: string, toSection: string): LayoutSection[] {
  const field = sections.flatMap((s) => s.fields).find((f) => f.api === api);
  if (!field) return sections;
  return sections.map((s) => ({ ...s, fields: s.id === toSection ? [...s.fields.filter((f) => f.api !== api), field] : s.fields.filter((f) => f.api !== api) }));
}

const LAYOUT_SCHEMA: RuleSchema = {
  triggers: [],
  fields: [
    { key: 'department', label: 'Department', type: 'choice', options: ['Operations', 'Quality', 'Sales'].map((v) => ({ value: v, label: v })) },
    { key: 'vehicle_type', label: 'Vehicle type (custom)', type: 'choice', options: [{ value: 'two', label: 'Two-wheeler' }, { value: 'four', label: 'Four-wheeler' }] },
  ],
  recipients: [],
};

export function LayoutBuilderScreen({ preview = 'desk', role = 'hr', ruleOpen, hideLockedTried }: { preview?: 'desk' | 'mobile'; role?: string; ruleOpen?: boolean; hideLockedTried?: boolean }) {
  const [sections, setSections] = useState(EMPLOYEE_LAYOUT);
  const [mode, setMode] = useState(preview);
  const [asRole, setAsRole] = useState<string | null>(role);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [live, setLive] = useState(hideLockedTried ? 'PAN is required by law and can’t be hidden.' : '');
  const [rule, setRule] = useState(Boolean(ruleOpen));
  const onDrop = (e: DragEvent, sectionId: string) => {
    e.preventDefault();
    const api = e.dataTransfer.getData('text/plain');
    setDropTarget(null);
    if (!api) return;
    if (api.startsWith('new:')) {
      const label = api.slice(4);
      setSections((xs) => xs.map((s) => (s.id === sectionId ? { ...s, fields: [...s.fields, { api: label.toLowerCase().replace(/\W+/g, '_'), label }] } : s)));
    } else setSections((xs) => moveField(xs, api, sectionId));
    setLive(`Moved to ${sections.find((s) => s.id === sectionId)?.title}.`);
  };
  const hide = (api: string) => {
    const f = sections.flatMap((s) => s.fields).find((x) => x.api === api);
    if (f?.locked) {
      setLive(`${f.label} is required by law and can’t be hidden.`);
      return;
    }
    setSections((xs) => xs.map((s) => ({ ...s, fields: s.fields.map((x) => (x.api === api ? { ...x, hidden: !x.hidden } : x)) })));
  };
  const visible = (f: LayoutSection['fields'][number]) => !f.hidden && !(mode === 'mobile' && f.deskOnly);
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={custPanel()} panelCollapsed>
      <PageHeader
        title="Employee record layout · Plant staff"
        description="Drag fields from the palette, or use each field's menu to move it. Hiding a field doesn't change who can see it."
        status={<Badge tone="warning">Unsaved changes</Badge>}
        actions={
          <>
            <Button>Discard</Button>
            <Button variant="primary">Save layout</Button>
          </>
        }
      />
      <span className="yx-visually-hidden" aria-live="polite">
        {live}
      </span>
      {live.includes('law') && <InlineAlert tone="danger" title="Can’t hide this field">{live} Statutory and system sections stay on every layout.</InlineAlert>}
      <div className="yx-plt-canvas">
        <Card title="Field palette">
          <div className="yx-plt-stack" data-gap="sm">
            {PALETTE_FIELDS.map((p) => (
              <button key={p} type="button" className="yx-plt-palette-field" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', `new:${p}`)} onClick={() => setSections((xs) => xs.map((s, i) => (i === xs.length - 1 ? { ...s, fields: [...s.fields, { api: p.toLowerCase().replace(/\W+/g, '_'), label: p }] } : s)))} aria-label={`Add ${p} to the last section`}>
                <Icon icon={GripVertical} /> {p}
              </button>
            ))}
            <Button size="sm" icon={Plus}>
              Add section
            </Button>
          </div>
        </Card>
        <div className="yx-plt-stack">
          {sections.map((s) => (
            <section
              key={s.id}
              className="yx-plt-section"
              data-drop={dropTarget === s.id || undefined}
              onDragOver={(e) => {
                e.preventDefault();
                setDropTarget(s.id);
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => onDrop(e, s.id)}
              aria-label={`Section ${s.title}`}
            >
              <div className="yx-plt-row" data-justify="between">
                <h3 className="yx-plt-h">{s.title}</h3>
                <Badge>{s.columns} column{s.columns > 1 ? 's' : ''}</Badge>
              </div>
              <div className="yx-plt-section__fields" style={{ ['--yx-plt-cols' as string]: s.columns }}>
                {s.fields.map((f) => (
                  <div key={f.api} className="yx-plt-placed" draggable={!f.locked} onDragStart={(e) => e.dataTransfer.setData('text/plain', f.api)} data-locked={f.locked || undefined} data-hidden={f.hidden || undefined}>
                    {f.locked ? <Icon icon={Lock} label="Locked" /> : <Icon icon={GripVertical} />}
                    <span className="yx-plt-placed__name">
                      {f.label}
                      {f.conditional && <span className="yx-plt-muted"> · {f.conditional}</span>}
                      {f.deskOnly && <span className="yx-plt-muted"> · desk only</span>}
                      {f.hidden && <span className="yx-plt-muted"> · hidden</span>}
                    </span>
                    <Menu>
                      <MenuTrigger asChild>
                        <IconButton icon={MoveRight} label={`Options for ${f.label}`} size="sm" />
                      </MenuTrigger>
                      <MenuContent align="end">
                        <MenuLabel>Move to</MenuLabel>
                        {sections
                          .filter((x) => x.id !== s.id)
                          .map((x) => (
                            <MenuItem key={x.id} disabled={f.locked} onSelect={() => setSections((xs) => moveField(xs, f.api, x.id))}>
                              {x.title}
                            </MenuItem>
                          ))}
                        <MenuItem icon={EyeOff} onSelect={() => hide(f.api)}>
                          {f.hidden ? 'Show field' : 'Hide field'}
                        </MenuItem>
                        <MenuItem onSelect={() => setRule(true)}>Add show / hide rule</MenuItem>
                      </MenuContent>
                    </Menu>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <Card title="Locked sections">
            <p className="yx-plt-muted">Audit timeline and approval trail always show and can’t be removed.</p>
          </Card>
        </div>
        <Card title="Preview">
          <div className="yx-plt-stack">
            <FormField label="Preview as role">
              <Select options={[{ value: 'hr', label: 'HR Admin' }, { value: 'mgr', label: 'Line manager' }, { value: 'emp', label: 'Employee (self)' }]} value={asRole} onChange={setAsRole} />
            </FormField>
            <RadioGroup
              aria-label="Preview device"
              orientation="horizontal"
              value={mode}
              onChange={(v) => setMode(v as 'desk' | 'mobile')}
              options={[
                { value: 'desk', label: <span className="yx-plt-row"><Icon icon={Monitor} /> Desk</span> },
                { value: 'mobile', label: <span className="yx-plt-row"><Icon icon={Smartphone} /> Mobile</span> },
              ]}
            />
            <div className={mode === 'mobile' ? 'yx-plt-phone-preview' : 'yx-plt-stack'}>
              {sections.map((s) => (
                <div key={s.id} className="yx-plt-stack" data-gap="sm">
                  <strong>{s.title}</strong>
                  {s.fields.filter(visible).map((f) => (
                    <DescriptionList key={f.api} items={[{ label: f.label, value: f.api === 'pan' && asRole !== 'hr' ? 'XXXXXX234F' : 'Sample value' }]} />
                  ))}
                </div>
              ))}
            </div>
            <p className="yx-plt-muted">Sample record: Ravi Shankar, Hosur plant.</p>
          </div>
        </Card>
      </div>
      <Dialog open={rule} onOpenChange={setRule} title="Show Licence number when…" size="md" footer={<><Button onClick={() => setRule(false)}>Cancel</Button><Button variant="primary" onClick={() => setRule(false)}>Save rule</Button></>}>
        <ConditionBuilder schema={LAYOUT_SCHEMA} parts={['if']} defaultValue={{ trigger: null, actions: [], conditions: { ...emptyGroup(), items: [{ id: 'lc1', field: 'vehicle_type', operator: 'is', value: 'two' }] } } as Rule} />
      </Dialog>
    </DesktopFrame>
  );
}

/* ================================================================ PLT-24 Custom request-type builder */

export function RequestTypeBuilderScreen({ current = 'layout', effect = 'create' }: { current?: string; effect?: string }) {
  const [eff, setEff] = useState(effect);
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={custPanel()}>
      <PageHeader title="New request type · Uniform request" description="Employees ask for uniforms and PPE. It appears in the request sheet, approvals inbox and search." />
      <Stepper
        title="New request type"
        defaultCurrent={current}
        finishLabel="Activate request type"
        onSaveAndExit={() => {}}
        review={{ title: 'Review' }}
        steps={[
          {
            id: 'layout',
            title: 'Form layout',
            description: 'Fields and who can raise it',
            content: (
              <div className="yx-plt-stack">
                <FieldRow>
                  <FormField label="Name" required>
                    <TextField defaultValue="Uniform request" />
                  </FormField>
                  <FormField label="Risk level" helper="Only low-risk types can be bulk approved or approved from chat.">
                    <Select options={[{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }]} value="low" onChange={() => {}} />
                  </FormField>
                </FieldRow>
                <FormField label="Who can raise it">
                  <RadioGroup aria-label="Who can raise it" defaultValue="self-proxy" options={[{ value: 'self', label: 'Employees for themselves' }, { value: 'self-proxy', label: 'Employees, and HR on their behalf' }]} />
                </FormField>
                <Checkbox label="Available on mobile" defaultChecked />
                <Checkbox label="Attachments allowed" />
                <p className="yx-plt-muted">Fields: Item, Size, Quantity, Reason · layout from Uniform & PPE issue.</p>
              </div>
            ),
            summary: <p className="yx-plt-p">4 fields · low risk · self and HR on behalf · mobile</p>,
          },
          {
            id: 'policy',
            title: 'Approval policy',
            content: (
              <div className="yx-plt-stack">
                <InlineAlert tone="info" title="Starter chain: manager → HR">Edit the steps in the approval policy editor. Requests route from the employee, even when HR raises them.</InlineAlert>
                <div className="yx-plt-grid">
                  <Tile title="Step 1 · Reporting manager" badge={<Badge>Any one</Badge>}>SLA 1 working day</Tile>
                  <Tile title="Step 2 · Stores (named group)" badge={<Badge>Any one</Badge>}>SLA 2 working days · skip if item is Cap</Tile>
                </div>
                <Button>Open policy editor</Button>
              </div>
            ),
            summary: <p className="yx-plt-p">Manager → Stores</p>,
          },
          {
            id: 'effect',
            title: 'Effect on approval',
            content: (
              <div className="yx-plt-stack">
                <RadioGroup
                  aria-label="Effect"
                  value={eff}
                  onChange={setEff}
                  options={[
                    { value: 'create', label: 'Create a Uniform & PPE issue record', description: 'Fills Employee, Item and Size from the request.' },
                    { value: 'update', label: 'Update fields on a record' },
                    { value: 'notify', label: 'Notify only' },
                    { value: 'payroll', label: 'Deduct deposit from salary', description: 'Custom request types can’t write to payroll. Creates a one-time pay input for Payroll to review instead.' },
                  ]}
                />
                {eff === 'payroll' && (
                  <InlineAlert tone="warning" title="Goes to Payroll for review">
                    A one-time deduction input is created in Pay › One-time pay & holds. Payroll checks it before the run; nothing is deducted automatically.
                  </InlineAlert>
                )}
              </div>
            ),
            summary: <p className="yx-plt-p">{eff === 'create' ? 'Create Uniform & PPE issue record' : eff === 'payroll' ? 'One-time pay input for review' : eff === 'update' ? 'Update fields' : 'Notify only'}</p>,
          },
        ]}
      />
    </DesktopFrame>
  );
}

/* ================================================================ PLT-25 Customisation packages & promotion */

export interface PackageRow {
  id: string;
  version: string;
  created: Date;
  author: string;
  changes: number;
  status: 'Draft' | 'Awaiting approval' | 'Promoted' | 'Rejected';
  approver?: string;
}

export function PackagesScreen({ rows, openId, promoteId, state = 'ready' }: { rows: PackageRow[]; openId?: string; promoteId?: string; state?: 'ready' | 'loading' | 'error' }) {
  const [open, setOpen] = useState<string | null>(openId ?? null);
  const [promote, setPromote] = useState<string | null>(promoteId ?? null);
  const current = rows.find((r) => r.id === open);
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={custPanel()}>
      <ListPage
        title="Packages & promotion"
        description="Customisation built in the sandbox moves to production only through a reviewed package."
        facts="Promotion required: on for objects, off for layouts"
        actions={<Button variant="primary">Cut new version</Button>}
        label="Packages"
        columns={[
          { key: 'version', header: 'Version', type: 'id', value: (r: PackageRow) => r.version },
          { key: 'created', header: 'Created', type: 'date', value: (r) => r.created },
          { key: 'author', header: 'Built by', type: 'person', value: (r) => r.author, person: (r) => ({ name: r.author }) },
          { key: 'changes', header: 'Changes', type: 'number', value: (r) => r.changes },
          { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => toneFor(v) },
          { key: 'approver', header: 'Approver', value: (r) => r.approver ?? '' },
        ]}
        rows={rows}
        getRowId={(r) => r.id}
        state={state}
        empty={<EmptyState title="No packages yet." description="Build objects or layouts in the sandbox, then cut a version to promote them." />}
        onRowClick={(r) => setOpen(r.id)}
        activeRowId={open}
        rowButtons={(r) => (r.status === 'Draft' ? <Button size="sm" onClick={() => setPromote(r.id)}>Request promotion</Button> : null)}
      >
        {current && (
          <Drawer open onOpenChange={(o) => !o && setOpen(null)} title={`Version ${current.version}`} subtitle={`${current.changes} changes · built by ${current.author}`} size="lg" footer={current.status === 'Promoted' ? <Button>Roll back metadata</Button> : undefined}>
            <DiffTable
              caption={`Changes in ${current.version}`}
              rows={[
                { field: 'Object · Uniform & PPE issue', before: null, after: 'New · 9 fields · scope follows employee' },
                { field: 'Field · Serial number', before: 'Text', after: 'Text · unique · pattern KF-PPE-#####' },
                { field: 'Layout · Employee (Plant staff)', before: '3 sections', after: '3 sections · Uniform size shown for Operations' },
                { field: 'Request type · Uniform request', before: null, after: 'New · Manager → Stores' },
              ]}
            />
          </Drawer>
        )}
        {promote && (
          <ConfirmDialog
            open
            onOpenChange={(o) => !o && setPromote(null)}
            title={`Request promotion of ${rows.find((r) => r.id === promote)?.version}?`}
            consequence="Suresh Pillai reviews the diff and approves. You can't approve your own promotion. Production records are kept; removed fields are archived, not dropped."
            confirmLabel="Send for approval"
            onConfirm={() => setPromote(null)}
          />
        )}
      </ListPage>
    </DesktopFrame>
  );
}

/* ================================================================ PLT-26 Custom object list + record */

export interface UniformRecord {
  id: string;
  ref: string;
  employee: string;
  item: string;
  size: string;
  issued: Date;
  due: Date | null;
  site: string;
  status: 'Issued' | 'Returned' | 'Overdue';
}

const uniformColumns: TableColumn<UniformRecord>[] = [
  { key: 'ref', header: 'Reference', type: 'id', value: (r) => r.ref },
  { key: 'employee', header: 'Employee', type: 'person', value: (r) => r.employee, person: (r) => ({ name: r.employee }) },
  { key: 'item', header: 'Item', value: (r) => r.item },
  { key: 'size', header: 'Size', value: (r) => r.size },
  { key: 'issued', header: 'Issued on', type: 'date', value: (r) => r.issued },
  { key: 'due', header: 'Return due', type: 'date', value: (r) => r.due },
  { key: 'site', header: 'Site', value: (r) => r.site },
  { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Overdue' ? 'danger' : v === 'Returned' ? 'success' : 'info') },
];

function UniformRecordBody({ r }: { r: UniformRecord }) {
  return (
    <Workspace
      aside={
        <>
          <h2 className="yx-plt-h">Activity</h2>
          <Timeline
            today={TODAY}
            items={[
              { id: 'a1', actor: { name: 'Murugan K' }, action: 'issued Safety shoes, size 9', at: at(2, 10, 30) },
              { id: 'a2', actor: { name: 'Karthik Subramanian' }, action: 'approved uniform request UR-26-0091', at: at(1, 16, 5) },
            ]}
          />
        </>
      }
    >
      <DescriptionList
        columns={2}
        items={[
          { label: 'Employee', value: r.employee },
          { label: 'Item', value: r.item },
          { label: 'Size', value: r.size },
          { label: 'Issued on', value: formatDate(r.issued) },
          { label: 'Return due', value: r.due ? formatDate(r.due) : 'Not returnable' },
          { label: 'Serial number', value: 'KF-PPE-00412', mono: true },
          { label: 'Site', value: r.site },
          { label: 'Deposit', value: '₹500' },
        ]}
      />
      <Card title="PPE returns (related)">
        <EmptyState compact title="No returns yet." action={<Button size="sm">Record return</Button>} />
      </Card>
    </Workspace>
  );
}

export function CustomObjectScreen({ view, rows, importOpen, state = 'ready' }: { view: 'list' | 'record'; rows: UniformRecord[]; importOpen?: boolean; state?: 'ready' | 'loading' | 'error' }) {
  const [imp, setImp] = useState(Boolean(importOpen));
  const peoplePanel = [{ items: [{ label: 'Directory' }, { label: 'Org chart' }, { label: 'Onboarding' }, { label: 'Changes' }, { label: 'Exits' }, { label: 'Documents & letters' }, { label: 'Assets' }] }, { label: 'More', items: [{ label: 'Uniform & PPE issue', active: true }] }];
  return (
    <DesktopFrame area="people" panelTitle="People" panel={peoplePanel}>
      {view === 'list' ? (
        <ListPage
          title="Uniform & PPE issue"
          description="Custom object · generated list"
          facts={`${rows.length} records · ${rows.filter((r) => r.status === 'Overdue').length} overdue`}
          actions={
            <>
              <Button icon={Upload} onClick={() => setImp(true)}>
                Import
              </Button>
              <Button variant="primary" icon={Plus}>
                New issue
              </Button>
            </>
          }
          label="Uniform & PPE issues"
          columns={uniformColumns}
          rows={rows}
          getRowId={(r) => r.id}
          filters={[
            { key: 'item', label: 'Item', type: 'multi', options: ['Safety shoes', 'Helmet', 'Uniform shirt', 'Gloves'].map((v) => ({ value: v, label: v })) },
            { key: 'site', label: 'Site', type: 'multi', options: ['Hosur plant', 'Chennai office'].map((v) => ({ value: v, label: v })) },
            { key: 'status', label: 'Status', type: 'multi', options: ['Issued', 'Returned', 'Overdue'].map((v) => ({ value: v, label: v })) },
            { key: 'issued', label: 'Issued on', type: 'date' },
          ]}
          searchPlaceholder="Search employee or reference"
          views={[{ id: 'all', name: 'All issues' }, { id: 'overdue', name: 'Overdue returns', shared: true }]}
          selectable
          bulkActions={(ids) => <Button size="sm" icon={Download}>Export {ids.length}</Button>}
          onExport
          state={state}
          empty={<EmptyState title="No uniform or PPE issues yet." description="Record each item you hand out, or import past issues from Excel." action={<Button variant="primary">New issue</Button>} />}
        >
          <Dialog open={imp} onOpenChange={setImp} title="Import Uniform & PPE issues" description="Use the template: one column per field, employees by code or email. You see a preview before anything is saved." size="md" footer={<><Button onClick={() => setImp(false)}>Cancel</Button><Button variant="primary">Validate file</Button></>}>
            <div className="yx-plt-stack">
              <Button icon={Download}>Download template</Button>
              <FileUpload upload={() => Promise.resolve()} accept={['.xlsx', '.csv']} multiple={false} />
            </div>
          </Dialog>
        </ListPage>
      ) : (
        <>
          <ObjectHeader name={`${rows[0].ref} · ${rows[0].item}`} icon={Boxes} secondary={`Uniform & PPE issue · ${rows[0].employee}`} status={<Badge tone="info">{rows[0].status}</Badge>} actions={<><Button>Edit</Button><Button variant="primary">Record return</Button></>} />
          <UniformRecordBody r={rows[0]} />
        </>
      )}
    </DesktopFrame>
  );
}

export function CustomObjectPhone({ view, rows }: { view: 'list' | 'record'; rows: UniformRecord[] }) {
  const r = rows[0];
  return (
    <PhoneFrame tab="me" title={view === 'list' ? 'Uniform & PPE' : r.ref} back={view === 'record' ? <IconButton icon={ArrowLeft} label="Back to list" /> : undefined}>
      {view === 'list' ? (
        rows.length ? (
          <ul className="yx-plt-list">
            {rows.map((x) => (
              <li key={x.id}>
                <div className="yx-plt-list__main">
                  <strong>{x.item}</strong>
                  <span className="yx-plt-muted">
                    {x.employee} · issued {formatDate(x.issued)}
                  </span>
                </div>
                <Badge tone={x.status === 'Overdue' ? 'danger' : 'neutral'}>{x.status}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title="No items issued to you." />
        )
      ) : (
        <DescriptionList
          items={[
            { label: 'Item', value: r.item },
            { label: 'Size', value: r.size },
            { label: 'Issued on', value: formatDate(r.issued) },
            { label: 'Return due', value: r.due ? formatDate(r.due) : 'Not returnable' },
            { label: 'Site', value: r.site },
          ]}
        />
      )}
    </PhoneFrame>
  );
}
