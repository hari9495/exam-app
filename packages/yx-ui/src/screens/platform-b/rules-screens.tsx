// P19 rule screens: PLT-33 impact preview, PLT-34 lookup tables, PLT-35 automations, PLT-36 validation rules,
// PLT-37 "why" panel, PLT-44 notice-of-change and policy link.
import { useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Info, Pause, Play, Plus, Scale } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Icon } from '../../components/foundations';
import { Badge, PersonLabel } from '../../components/display';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, SavedViewMenu } from '../../components/filters';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { FormField } from '../../components/field';
import { Select } from '../../components/select';
import { RadioGroup, Switch, Checkbox } from '../../components/choice';
import { TextArea } from '../../components/inputs';
import { DatePicker } from '../../components/date';
import { FileUpload } from '../../components/upload';
import { BottomSheet } from '../../components/overlay';
import { ConditionBuilder } from '../../components/condition';
import { Timeline, type TimelineItem } from '../../components/timeline';
import { MenuItem } from '../../components/menu';
import { formatDate } from '../../lib/format';
import { summariseRule, type Rule, type RuleSchema } from '../../lib/rules';
import type { FilterValue } from '../../lib/table';
import { DesktopFrame, PhoneFrame } from '../_kit/frames';
import { TODAY } from '../_kit/data';
import { ImpactPreview, SettingsFrame, checkNotice, earliestEffective, type ImpactPreviewProps } from './platform-b-kit';

/* ================================================================== PLT-33 Impact preview drawer */

export interface ImpactPreviewDrawerProps extends Omit<ImpactPreviewProps, 'mode'> {
  ruleName: string;
  version: string;
  /** Author runs and submits; approver reviews and approves (maker ≠ checker). */
  persona: 'author' | 'approver';
  defaultMode?: 'live' | 'sandbox';
  employees: { value: string; label: string }[];
  /** Result for "test on one employee". */
  oneResult?: { employee: string; before: string; after: string; reason: string };
  rule: Rule;
  schema: RuleSchema;
  highRisk?: boolean;
}

// PLT-33
export function ImpactPreviewDrawer({ ruleName, version, persona, defaultMode = 'live', employees, oneResult, rule, schema, highRisk, ...preview }: ImpactPreviewDrawerProps) {
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<'live' | 'sandbox'>(defaultMode);
  const [who, setWho] = useState<string | null>(oneResult ? employees[0].value : null);
  const [tested, setTested] = useState(Boolean(oneResult));
  return (
    <SettingsFrame active="Policies & rules">
      <PageHeader title={ruleName} status={<Badge tone="info">{`Draft ${version}`}</Badge>} description={summariseRule(rule, schema)} actions={<Button onClick={() => setOpen(true)}>Impact preview</Button>} />
      <Card title="Conditions">
        <ConditionBuilder schema={schema} value={rule} readOnly parts={['if']} />
      </Card>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title="Impact preview"
        subtitle={`${ruleName} · ${version}`}
        footer={
          persona === 'author' ? (
            <>
              <Button onClick={() => setOpen(false)}>Close</Button>
              <Button variant="primary" disabled={preview.state !== 'ready'}>
                {highRisk ? 'Submit for approval' : 'Activate'}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setOpen(false)}>Close</Button>
              <Button>Send back</Button>
              <Button variant="primary" disabled={preview.state !== 'ready'}>
                Approve and activate
              </Button>
            </>
          )
        }
      >
        <div className="yxp-stack">
          {persona === 'approver' && (
            <InlineAlert tone="info" title="You are the second approver">
              Lakshmi Venkatesan wrote this version. The preview below is the one stored with it on 28 Sep 2026; you can re-run it on today's data.
            </InlineAlert>
          )}
          <RadioGroup
            aria-label="Run on"
            orientation="horizontal"
            value={mode}
            onChange={(v) => setMode(v as 'live' | 'sandbox')}
            options={[
              { value: 'live', label: 'Live data (read-only)' },
              { value: 'sandbox', label: 'Sandbox' },
            ]}
          />
          <ImpactPreview {...preview} mode={mode} />
          <Card title="Test on one employee">
            <div className="yxp-row">
              <FormField label="Employee">
                <Select options={employees} value={who} onChange={setWho} placeholder="Choose an employee" />
              </FormField>
              <Button onClick={() => setTested(Boolean(who))} disabled={!who}>
                Test
              </Button>
            </div>
            {tested && oneResult ? (
              <DescriptionList
                items={[
                  { label: 'Employee', value: oneResult.employee },
                  { label: 'Now', value: oneResult.before },
                  { label: 'With this version', value: oneResult.after },
                  { label: 'Why', value: oneResult.reason },
                ]}
              />
            ) : (
              <p className="yxp-muted">Pick one person to see their old and new value and the reason.</p>
            )}
          </Card>
        </div>
      </Drawer>
    </SettingsFrame>
  );
}

/* ================================================================== PLT-34 Lookup tables */

export interface LookupTable {
  id: string;
  name: string;
  keyLabel: string;
  valueLabel: string;
  rows: number;
  usedBy: string[];
  updated: Date;
  owner: string;
}

export interface LookupRow {
  id: string;
  key: string;
  value: string;
  validFrom: Date;
  validTo: Date | null;
}

// PLT-34 (list)
export function LookupTablesScreen({ tables, state = 'ready', filtered }: { tables: LookupTable[]; state?: 'ready' | 'loading' | 'error'; filtered?: boolean }) {
  const cols: TableColumn<LookupTable>[] = [
    { key: 'name', header: 'Table', value: (t) => t.name, render: (t) => <strong>{t.name}</strong> },
    { key: 'shape', header: 'Key → value', value: (t) => `${t.keyLabel} → ${t.valueLabel}` },
    { key: 'rows', header: 'Rows', type: 'number', value: (t) => t.rows },
    { key: 'used', header: 'Used by', value: (t) => t.usedBy.length, render: (t) => (t.usedBy.length ? `${t.usedBy.length} ${t.usedBy.length === 1 ? 'rule' : 'rules'}` : 'Not used') },
    { key: 'owner', header: 'Owner', type: 'person', value: (t) => t.owner, person: (t) => ({ name: t.owner }) },
    { key: 'updated', header: 'Last change', type: 'date', value: (t) => t.updated },
  ];
  return (
    <SettingsFrame active="Lookup tables">
      <PageHeader
        title="Lookup tables"
        description="Company tables that rules read, such as city tier to per diem. Every row has a valid-from date."
        actions={
          <>
            <Button icon={FileSpreadsheet}>Import from Excel</Button>
            <Button variant="primary" icon={Plus}>
              Add table
            </Button>
          </>
        }
      />
      <DataTable
        label="Lookup tables"
        columns={cols}
        rows={state === 'ready' ? tables : []}
        getRowId={(t) => t.id}
        state={state}
        errorTitle="We couldn't load lookup tables."
        errorReference="LKP-20931"
        onRetry={() => {}}
        filtered={filtered}
        onClearFilters={() => {}}
        onRowClick={() => {}}
        empty={<EmptyState title="No lookup tables yet." description="Add a table when a rule needs values by city, grade or site." action={<Button variant="primary">Add table</Button>} help={<Link href="#">How lookup tables work</Link>} />}
        toolbar={<FilterBar fields={[{ key: 'used', label: 'Used by rules', type: 'multi', options: [{ value: 'yes', label: 'Used' }, { value: 'no', label: 'Not used' }] }]} value={filtered ? [{ key: 'used', type: 'multi', values: ['no'] }] : []} onChange={() => {}} search={filtered ? 'fuel' : ''} onSearchChange={() => {}} searchPlaceholder="Search tables" />}
      />
    </SettingsFrame>
  );
}

// PLT-34 (record)
export function LookupTableScreen({ table, rows, importErrors, defaultTab = 'rows', importOpen = false }: { table: LookupTable; rows: LookupRow[]; importErrors?: { row: number; message: string }[]; defaultTab?: string; importOpen?: boolean }) {
  const [imp, setImp] = useState(importOpen);
  const active = rows.filter((r) => r.validFrom <= TODAY && (!r.validTo || r.validTo >= TODAY));
  const cols: TableColumn<LookupRow>[] = [
    { key: 'key', header: table.keyLabel, value: (r) => r.key },
    { key: 'value', header: table.valueLabel, value: (r) => r.value, editable: 'text' },
    { key: 'from', header: 'Valid from', type: 'date', value: (r) => r.validFrom },
    { key: 'to', header: 'Valid to', type: 'date', value: (r) => r.validTo, render: (r) => (r.validTo ? formatDate(r.validTo) : 'Open') },
    { key: 'status', header: 'Status', type: 'status', value: (r) => (active.includes(r) ? 'Current' : r.validFrom > TODAY ? 'Future' : 'Past'), statusTone: (v) => (v === 'Current' ? 'success' : v === 'Future' ? 'info' : 'neutral') },
  ];
  return (
    <SettingsFrame active="Lookup tables">
      <ObjectHeader
        name={table.name}
        icon={FileSpreadsheet}
        secondary={`${table.keyLabel} → ${table.valueLabel}`}
        facts={[
          { label: 'Rows', value: rows.length },
          { label: 'Current', value: active.length },
          { label: 'Used by', value: `${table.usedBy.length} rules` },
          { label: 'Owner', value: table.owner },
        ]}
        actions={
          <>
            <Button icon={FileSpreadsheet} onClick={() => setImp(true)}>
              Import from Excel
            </Button>
            <Button variant="primary" icon={Plus}>
              Add row
            </Button>
          </>
        }
        menu={<MenuItem>Download as Excel</MenuItem>}
      />
      <Tabs defaultValue={defaultTab}>
        <TabsList aria-label="Lookup table">
          <TabsTrigger value="rows" count={rows.length}>
            Rows
          </TabsTrigger>
          <TabsTrigger value="used" count={table.usedBy.length}>
            Used by
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="rows">
          <DataTable label={`${table.name} rows`} columns={cols} rows={rows} getRowId={(r) => r.id} defaultGroupBy={null} onCellEdit={() => {}} />
        </TabsContent>
        <TabsContent value="used">
          <ul className="yxp-plain">
            {table.usedBy.map((r) => (
              <li key={r} className="yxp-row">
                <Link href="#">{r}</Link>
                <Badge tone="success">Active</Badge>
              </li>
            ))}
          </ul>
          <InlineAlert tone="info" title="This table can't be deleted while active rules read it." />
        </TabsContent>
        <TabsContent value="history">
          <Timeline
            today={TODAY}
            items={[
              { id: 'h1', actor: { name: table.owner }, action: 'imported 38 rows from per-diem-2026-27.xlsx, valid from 1 Oct 2026', at: new Date(2026, 8, 28, 16, 5) },
              { id: 'h2', actor: { name: 'Suresh Pillai' }, action: 'changed Tier 1 from ₹1,800 to ₹2,000', at: new Date(2026, 3, 1, 11, 0) },
            ]}
          />
        </TabsContent>
      </Tabs>
      <Drawer
        open={imp}
        onOpenChange={setImp}
        title="Import rows from Excel"
        subtitle="New rows get the valid-from date you choose; current rows end the day before."
        footer={
          <>
            <Button onClick={() => setImp(false)}>Cancel</Button>
            <Button variant="primary" disabled={Boolean(importErrors?.length)}>
              Import 36 rows
            </Button>
          </>
        }
      >
        <div className="yxp-stack">
          <FormField label="Valid from" required>
            <DatePicker value={new Date(2026, 9, 1)} onChange={() => {}} />
          </FormField>
          <FileUpload accept={['.xlsx', '.csv']} upload={async () => {}} />
          {importErrors && importErrors.length > 0 && (
            <InlineAlert tone="danger" title={`Fix ${importErrors.length} rows in the file, then upload it again`}>
              <ul className="yxp-list">
                {importErrors.map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </InlineAlert>
          )}
          <Link href="#">Download the template with current rows</Link>
        </div>
      </Drawer>
    </SettingsFrame>
  );
}

/* ================================================================== PLT-35 Automations */

export interface Automation {
  id: string;
  name: string;
  trigger: string;
  status: 'Active' | 'Paused' | 'Draft' | 'Failing';
  runs30: number;
  failures: number;
  owner: string;
  lastRun: Date | null;
}

export interface AutomationRun {
  id: string;
  at: Date;
  record: string;
  result: 'Done' | 'Failed' | 'Skipped' | 'Loop stopped';
  detail: string;
  attempts: number;
}

const AUTO_TONE = { Active: 'success', Paused: 'neutral', Draft: 'info', Failing: 'danger' } as const;

// PLT-35 (list)
export function AutomationsScreen({ items, used, limit, state = 'ready' }: { items: Automation[]; used: number; limit: number; state?: 'ready' | 'loading' | 'error' }) {
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const cols: TableColumn<Automation>[] = [
    { key: 'name', header: 'Automation', value: (a) => a.name, render: (a) => <strong>{a.name}</strong> },
    { key: 'trigger', header: 'Trigger', value: (a) => a.trigger },
    { key: 'status', header: 'Status', type: 'status', value: (a) => a.status, statusTone: (v) => AUTO_TONE[v as Automation['status']] },
    { key: 'runs', header: 'Runs, 30 days', type: 'number', value: (a) => a.runs30 },
    { key: 'fail', header: 'Failures', type: 'number', value: (a) => a.failures },
    { key: 'owner', header: 'Owner', type: 'person', value: (a) => a.owner, person: (a) => ({ name: a.owner }) },
    { key: 'last', header: 'Last run', type: 'date', value: (a) => a.lastRun },
  ];
  const pct = Math.round((used / limit) * 100);
  const rows = items.filter((a) => {
    const f = filters.find((x) => x.key === 'status');
    return !f || f.type !== 'multi' || !f.values.length || f.values.includes(a.status);
  });
  return (
    <SettingsFrame active="Automations">
      <PageHeader
        title="Automations"
        description="When something happens, do something. Each automation is a one-step workflow; open it in Workflow Studio to add steps."
        actions={<Button variant="primary" icon={Plus}>Add automation</Button>}
      />
      <Card title="Usage today">
        <Meter label="Automation runs today" value={used} max={limit} valueText={`${used.toLocaleString('en-IN')} of ${limit.toLocaleString('en-IN')} runs (${pct}%)`} />
        {pct >= 80 && (
          <p className="yxp-muted">
            You have used {pct}% of today's fair-use runs. Runs in progress never stop; beyond 100% the workflow usage add-on applies. <Link href="#">See plan and add-ons</Link>
          </p>
        )}
      </Card>
      <DataTable
        label="Automations"
        columns={cols}
        rows={state === 'ready' ? rows : []}
        getRowId={(a) => a.id}
        state={state}
        errorTitle="We couldn't load automations."
        errorReference="AUT-55012"
        onRetry={() => {}}
        selectable
        bulkActions={() => (
          <>
            <Button size="sm" icon={Pause}>
              Pause
            </Button>
            <Button size="sm" icon={Play}>
              Resume
            </Button>
          </>
        )}
        onRowClick={() => {}}
        filtered={filters.length > 0}
        onClearFilters={() => setFilters([])}
        empty={<EmptyState title="No automations yet." description="Start from a template, such as a reminder before probation ends." action={<Button variant="primary">Add automation</Button>} />}
        toolbar={<FilterBar fields={[{ key: 'status', label: 'Status', type: 'multi', options: ['Active', 'Paused', 'Draft', 'Failing'].map((v) => ({ value: v, label: v })) }]} value={filters} onChange={setFilters} />}
        views={<SavedViewMenu views={[{ id: 'all', name: 'All automations' }, { id: 'fail', name: 'Failing', shared: true }]} currentId="all" onSelect={() => {}} />}
      />
    </SettingsFrame>
  );
}

export interface AutomationDetailProps {
  automation: Automation;
  schema: RuleSchema;
  rule: Rule;
  dryRun?: { events: number; wouldRun: number; wouldSkip: number; samples: string[] } | 'running' | null;
  runs: AutomationRun[];
  defaultTab?: 'build' | 'runs' | 'failures';
  /** Owner persona can edit; others read. */
  readOnly?: boolean;
}

// PLT-35 (record)
export function AutomationDetailScreen({ automation, schema, rule, dryRun, runs, defaultTab = 'build', readOnly }: AutomationDetailProps) {
  const [value, setValue] = useState(rule);
  const failures = runs.filter((r) => r.result === 'Failed' || r.result === 'Loop stopped');
  const runCols: TableColumn<AutomationRun>[] = [
    { key: 'at', header: 'When', type: 'date', value: (r) => r.at, render: (r) => `${formatDate(r.at)}, ${r.at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` },
    { key: 'record', header: 'Record', type: 'id', value: (r) => r.record },
    { key: 'result', header: 'Result', type: 'status', value: (r) => r.result, statusTone: (v) => (v === 'Done' ? 'success' : v === 'Skipped' ? 'neutral' : 'danger') },
    { key: 'detail', header: 'What happened', value: (r) => r.detail },
    { key: 'attempts', header: 'Attempts', type: 'number', value: (r) => r.attempts },
  ];
  return (
    <SettingsFrame active="Automations">
      <ObjectHeader
        name={automation.name}
        icon={Play}
        status={<Badge tone={AUTO_TONE[automation.status]}>{automation.status}</Badge>}
        facts={[
          { label: 'Runs, 30 days', value: automation.runs30 },
          { label: 'Failures', value: automation.failures },
          { label: 'Owner', value: automation.owner },
          { label: 'Loop protection', value: 'On' },
        ]}
        actions={
          readOnly ? undefined : (
            <>
              <Button>Open in Workflow Studio</Button>
              <Button variant="primary" disabled={!dryRun || dryRun === 'running'}>
                Activate
              </Button>
            </>
          )
        }
      />
      {readOnly && <InlineAlert tone="info" title="You can view this automation. Ask its owner, Lakshmi Venkatesan, to change it." />}
      <Tabs defaultValue={defaultTab}>
        <TabsList aria-label="Automation">
          <TabsTrigger value="build">Trigger, conditions, actions</TabsTrigger>
          <TabsTrigger value="runs" count={runs.length}>
            Run log
          </TabsTrigger>
          <TabsTrigger value="failures" count={failures.length}>
            Failure queue
          </TabsTrigger>
        </TabsList>
        <TabsContent value="build">
          <div className="yxp-stack">
            <ConditionBuilder schema={schema} value={value} onChange={setValue} readOnly={readOnly} />
            <Card title="Dry run on the last 30 days" actions={readOnly ? undefined : <Button size="sm" loading={dryRun === 'running'}>Run dry run</Button>}>
              {dryRun === 'running' ? (
                <p className="yxp-muted" aria-live="polite">
                  Replaying 30 days of events. Nothing is sent or changed.
                </p>
              ) : !dryRun ? (
                <p className="yxp-muted">Run a dry run before you activate. It replays the last 30 days of events without sending or changing anything.</p>
              ) : (
                <div className="yxp-stack--tight yxp-stack">
                  <p>
                    Of {dryRun.events} events, this automation would have run {dryRun.wouldRun} times and skipped {dryRun.wouldSkip}.
                  </p>
                  <ul className="yxp-list">
                    {dryRun.samples.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="runs">
          <DataTable label="Run log" columns={runCols} rows={runs} getRowId={(r) => r.id} pageSize={10} empty={<EmptyState compact title="No runs yet." description="Runs appear here once the automation is active." />} />
        </TabsContent>
        <TabsContent value="failures">
          <DataTable
            label="Failure queue"
            columns={runCols}
            rows={failures}
            getRowId={(r) => r.id}
            rowButtons={() => (
              <>
                <Button size="sm">Retry</Button>
                <Button size="sm">Skip</Button>
              </>
            )}
            empty={<EmptyState compact title="No failures." description="Failed runs wait here for a retry or skip." />}
          />
        </TabsContent>
      </Tabs>
    </SettingsFrame>
  );
}

/* ================================================================== PLT-36 Validation rules */

export interface ValidationRule {
  id: string;
  recordType: string;
  name: string;
  condition: string;
  message: string;
  mode: 'Block' | 'Warn';
  status: 'Active' | 'Draft' | 'Off';
  invalidExisting: number;
}

// PLT-36 (list)
export function ValidationRulesScreen({ rules, state = 'ready' }: { rules: ValidationRule[]; state?: 'ready' | 'loading' | 'error' }) {
  const cols: TableColumn<ValidationRule>[] = [
    { key: 'name', header: 'Rule', value: (r) => r.name, render: (r) => <strong>{r.name}</strong> },
    { key: 'type', header: 'Record type', value: (r) => r.recordType, groupable: true },
    { key: 'mode', header: 'On save', type: 'status', value: (r) => r.mode, statusTone: (v) => (v === 'Block' ? 'danger' : 'warning') },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Active' ? 'success' : v === 'Draft' ? 'info' : 'neutral') },
    { key: 'invalid', header: 'Existing invalid records', type: 'number', value: (r) => r.invalidExisting },
  ];
  return (
    <SettingsFrame active="Validation rules">
      <PageHeader title="Validation rules" description="Checks that run when a record is saved. Block stops the save; Warn lets the person continue." actions={<Button variant="primary" icon={Plus}>Add validation rule</Button>} />
      <DataTable
        label="Validation rules"
        columns={cols}
        rows={state === 'ready' ? rules : []}
        getRowId={(r) => r.id}
        state={state}
        errorTitle="We couldn't load validation rules."
        errorReference="VAL-11873"
        onRetry={() => {}}
        defaultGroupBy="type"
        onRowClick={() => {}}
        empty={<EmptyState title="No validation rules yet." description="Add one to stop wrong data at save, such as a joining date on a Sunday." action={<Button variant="primary">Add validation rule</Button>} />}
      />
    </SettingsFrame>
  );
}

// PLT-36 (record in a drawer)
export function ValidationRuleDrawer({ rule, schema, condition, invalid }: { rule: ValidationRule; schema: RuleSchema; condition: Rule; invalid: { id: string; name: string; value: string }[] }) {
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState(rule.mode);
  return (
    <SettingsFrame active="Validation rules">
      <PageHeader title="Validation rules" />
      <Drawer
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={rule.name}
        subtitle={`${rule.recordType} · ${rule.status}`}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button>Test on existing records</Button>
            <Button variant="primary">Activate</Button>
          </>
        }
      >
        <div className="yxp-stack">
          <FormField label="Record type" required>
            <Select options={[{ value: rule.recordType, label: rule.recordType }]} value={rule.recordType} onChange={() => {}} />
          </FormField>
          <FormField label="When this is true">
            <ConditionBuilder schema={schema} defaultValue={condition} parts={['if']} />
          </FormField>
          <FormField label="Message shown to the person" required helper="Say what to do: “Choose a weekday for the joining date.”">
            <TextArea defaultValue={rule.message} rows={2} />
          </FormField>
          <FormField label="On save">
            <RadioGroup
              value={mode}
              onChange={(v) => setMode(v as ValidationRule['mode'])}
              options={[
                { value: 'Block', label: 'Block the save', description: 'The record can’t be saved until it is fixed.' },
                { value: 'Warn', label: 'Warn and allow', description: 'The person sees the message and can continue.' },
              ]}
            />
          </FormField>
          <Card title={`Existing records that fail: ${invalid.length}`}>
            {invalid.length ? (
              <>
                <p className="yxp-muted">These records are listed, not blocked. The rule applies the next time each one is edited.</p>
                <ul className="yxp-plain">
                  {invalid.map((r) => (
                    <li key={r.id} className="yxp-row yxp-row--between">
                      <PersonLabel name={r.name} secondary={r.id} />
                      <span>{r.value}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="yxp-muted">No existing record fails this rule.</p>
            )}
          </Card>
        </div>
      </Drawer>
    </SettingsFrame>
  );
}

/* ================================================================== PLT-37 "Why" panel */

export interface WhyExplanation {
  /** "Casual leave: 14 days". */
  result: string;
  subject: string;
  steps: { text: string; kind: 'rule' | 'legal' | 'lookup' }[];
  ruleName: string;
  ruleVersion: string;
  effective: Date;
  policyLink?: string;
}

function WhyBody({ why }: { why: WhyExplanation }) {
  const legal = why.steps.some((s) => s.kind === 'legal');
  return (
    <div className="yxp-stack">
      <p className="yxp-why__result">{why.result}</p>
      <Badge tone={legal ? 'info' : 'neutral'}>{legal ? 'Company policy, then the law applied' : 'Company policy'}</Badge>
      <ol className="yxp-why__steps" aria-label="How this was worked out">
        {why.steps.map((s) => (
          <li key={s.text} data-legal={s.kind === 'legal' || undefined}>
            <span className="yxp-row">
              <Icon icon={s.kind === 'legal' ? Scale : s.kind === 'lookup' ? FileSpreadsheet : Info} />
              <strong>{s.kind === 'legal' ? 'Legal adjustment' : s.kind === 'lookup' ? 'Company table' : 'Company rule'}</strong>
            </span>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
      <DescriptionList
        items={[
          { label: 'Rule', value: `${why.ruleName} (${why.ruleVersion})` },
          { label: 'In effect from', value: formatDate(why.effective) },
        ]}
      />
      {why.policyLink && <Link href="#">Read the policy: {why.policyLink}</Link>}
      <p className="yxp-muted">This shows only your own result. Think it's wrong? Raise a query and HR will check it.</p>
    </div>
  );
}

// PLT-37 (desktop drawer)
export function WhyPanelDrawer({ why, persona }: { why: WhyExplanation; persona: 'employee' | 'manager' }) {
  const [open, setOpen] = useState(true);
  return (
    <DesktopFrame
      area="home"
      panelTitle={persona === 'manager' ? 'My team' : 'My time & leave'}
      panel={[{ items: (persona === 'manager' ? ['Team today', 'Team calendar', 'Balances', 'Requests'] : ['Balances', 'Apply leave', 'Attendance', 'Holidays']).map((l) => ({ label: l, active: l === 'Balances' })) }]}
    >
      <PageHeader title={persona === 'manager' ? `Leave balances · ${why.subject}` : 'My leave balances'} />
      <Card title={why.result} actions={<Button size="sm" onClick={() => setOpen(true)}>Why this number</Button>}>
        <p className="yxp-muted">Balance as on {formatDate(TODAY)}</p>
      </Card>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Why this number"
        subtitle={persona === 'manager' ? `${why.subject} · you see this because you are the reporting manager` : why.subject}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Close</Button>
            <Button>Raise a query</Button>
          </>
        }
      >
        <WhyBody why={why} />
      </Drawer>
    </DesktopFrame>
  );
}

// PLT-37 (phone)
export function WhyPanelSheet({ why }: { why: WhyExplanation }) {
  return (
    <PhoneFrame tab="time" title="Leave balances">
      <Card title={why.result}>
        <p className="yxp-muted">Balance as on {formatDate(TODAY)}</p>
      </Card>
      <BottomSheet defaultOpen title="Why this number" footer={<Button fullWidth>Raise a query</Button>}>
        <WhyBody why={why} />
      </BottomSheet>
    </PhoneFrame>
  );
}

/* ================================================================== PLT-44 Notice of change & policy link */

export interface NoticeOfChangePanelProps {
  ruleName: string;
  version: string;
  /** Conditions-of-service policy point that changes results for workmen. */
  noticeRequired: boolean;
  workersAffected: number;
  union?: string;
  noticeIssued: Date | null;
  effective: Date;
  exceptionRef?: string;
  policyVersion?: string;
  material?: boolean;
  periodDays?: number;
}

// PLT-44
export function NoticeOfChangePanel({ ruleName, version, noticeRequired, workersAffected, union, noticeIssued, effective, exceptionRef, policyVersion, material, periodDays = 21 }: NoticeOfChangePanelProps) {
  const [eff, setEff] = useState<Date | null>(effective);
  const check = noticeRequired && eff ? checkNotice(eff, noticeIssued, { periodDays, exceptionRef }) : { ok: true as const };
  const earliest = noticeIssued ? earliestEffective(noticeIssued, periodDays) : null;
  const noPolicy = !policyVersion;
  return (
    <SettingsFrame active="Policies & rules">
      <PageHeader title={ruleName} status={<Badge tone="info">{`Draft ${version}`}</Badge>} />
      <div className="yxp-split">
        <Card title="Scope and effective date">
          <FormField label="Effective from" required error={!check.ok ? (check.reason === 'no-notice' ? 'Issue the notice of change first' : `Choose ${formatDate(check.earliest!)} or later: the notice period runs until then`) : null}>
            <DatePicker value={eff} onChange={setEff} />
          </FormField>
          <p className="yxp-muted">Applies to Hosur plant · Shift A and B · {workersAffected} workmen</p>
        </Card>
        <aside className="yxp-stack" aria-label="Notice of change and policy link">
          <Card title="Notice of change">
            {!noticeRequired ? (
              <p className="yxp-row">
                <Icon icon={CheckCircle2} /> Not needed: this policy point is not a condition of service for workmen.
              </p>
            ) : exceptionRef ? (
              <InlineAlert tone="info" title="No notice period: settlement recorded">
                Change made under {exceptionRef}. The reference is stored with this version.
              </InlineAlert>
            ) : !noticeIssued ? (
              <div className="yxp-stack yxp-stack--tight">
                <InlineAlert tone="warning" title={`Notice required for ${workersAffected} workmen`}>
                  Shift timings are a condition of service. The change can take effect only {periodDays} days after the notice is issued (IR Code; verify with your counsel).
                </InlineAlert>
                <DescriptionList
                  items={[
                    { label: 'Goes to', value: `${workersAffected} affected workmen${union ? ` and ${union}` : ''}` },
                    { label: 'Earliest effective date if issued today', value: formatDate(earliestEffective(TODAY, periodDays)) },
                  ]}
                />
                <div className="yxp-row">
                  <Button>Preview notice</Button>
                  <Button variant="primary">Issue notice</Button>
                </div>
                <Checkbox label="Display on the Hosur plant notice board too" defaultChecked />
                <Link href="#">Record a settlement or award instead</Link>
              </div>
            ) : (
              <div className="yxp-stack yxp-stack--tight">
                <DescriptionList
                  items={[
                    { label: 'Issued', value: formatDate(noticeIssued) },
                    { label: 'Waiting period', value: `${periodDays} days` },
                    { label: 'Earliest effective date', value: formatDate(earliest!) },
                    { label: 'Days left', value: Math.max(0, Math.round((earliest!.getTime() - TODAY.getTime()) / 86400000)) },
                  ]}
                />
                <Badge tone={check.ok ? 'success' : 'danger'}>{check.ok ? 'Effective date allowed' : 'Effective date too early'}</Badge>
              </div>
            )}
          </Card>
          <Card title="Policy link">
            {noPolicy ? (
              <InlineAlert tone="danger" title="Link a policy version before you activate">
                This rule sets an employee-facing result, so it must name the policy it implements.
              </InlineAlert>
            ) : (
              <DescriptionList items={[{ label: 'Implements', value: <Link href="#">{policyVersion}</Link> }]} />
            )}
            <Switch label="Material change: ask employees to re-acknowledge" defaultChecked={material} description={material ? `${workersAffected} people will be asked when this version activates.` : undefined} />
          </Card>
        </aside>
      </div>
    </SettingsFrame>
  );
}
