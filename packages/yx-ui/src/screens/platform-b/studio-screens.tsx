// P22 Workflow Studio & AI assistant: PLT-55…64.
import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Code, Lock, Pause, Play, RotateCcw, SkipForward, Square, Undo2, Workflow } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Icon } from '../../components/foundations';
import { AiBadge, Badge, type BadgeTone } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar } from '../../components/filters';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { FormField } from '../../components/field';
import { Switch } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { NumberField } from '../../components/inputs';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { AssistantPanel, PageBanner, type AssistantMessage } from '../../components/notify';
import { ConditionBuilder } from '../../components/condition';
import { BuilderCanvas, VersionCompare, type Flow, type FlowVersion } from '../../components/builder';
import { formatDate } from '../../lib/format';
import type { Rule, RuleSchema } from '../../lib/rules';
import type { FilterValue } from '../../lib/table';
import { DesktopFrame, PhoneFrame } from '../_kit/frames';
import { AgentPlanCard, CodeEditor, ImpactPreview, SettingsFrame, planUndo, type AgentPlanCardProps, type ImpactRow, type RunStep } from './platform-b-kit';

const when = (dt: Date) => `${formatDate(dt)}, ${dt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;

/* ================================================================== PLT-55 Studio canvas */

export const TRIGGER_TYPES = [
  { value: 'event', label: 'Event (from the event catalogue)' },
  { value: 'field', label: 'Field change' },
  { value: 'date', label: 'Date or relative date' },
  { value: 'schedule', label: 'Schedule (daily, weekly, monthly)' },
  { value: 'form', label: 'Form submitted' },
  { value: 'email', label: 'Inbound email' },
  { value: 'manual', label: 'Manual run' },
  { value: 'webhook', label: 'Webhook in (signed)' },
];

export interface StepPolicy {
  step: string;
  onError: 'retry' | 'fallback' | 'stop';
  retries?: number;
  irreversible?: boolean;
}

export interface LoopStep {
  step: string;
  over: string;
  max: number | null;
}

export interface StudioProps {
  name: string;
  schema: RuleSchema;
  flow: Flow;
  version: string;
  status: 'Draft' | 'In review' | 'Published' | 'Paused';
  policies: StepPolicy[];
  loops: LoopStep[];
  defaultTab?: 'canvas' | 'trigger' | 'errors' | 'limits';
  paused?: boolean;
  /** Simple mode: a converted P19 automation shown in the one-step form. */
  simple?: { rule: Rule };
}

// PLT-55
export function WorkflowStudioScreen({ name, schema, flow, version, status, policies, loops, defaultTab = 'canvas', paused, simple }: StudioProps) {
  const [trigger, setTrigger] = useState<string | null>('date');
  const loopErrors = loops.filter((l) => !l.max);
  if (simple)
    return (
      <SettingsFrame active="Automations">
        <PageHeader
          title={name}
          status={<Badge tone="neutral">Simple mode · one step</Badge>}
          description="This automation runs as a one-step workflow and behaves exactly as before."
          actions={
            <>
              <Button icon={Workflow}>Open in Studio</Button>
              <Button variant="primary">Save</Button>
            </>
          }
        />
        <ConditionBuilder schema={schema} defaultValue={simple.rule} />
      </SettingsFrame>
    );
  return (
    <SettingsFrame active="Workflow Studio">
      {paused && (
        <PageBanner tone="warning" action={<Button size="sm" icon={Play}>Resume</Button>}>
          This workflow is paused. Runs in progress wait before their next step.
        </PageBanner>
      )}
      <Tabs defaultValue={defaultTab}>
        <TabsList aria-label="Workflow">
          <TabsTrigger value="canvas">Canvas</TabsTrigger>
          <TabsTrigger value="trigger">Trigger</TabsTrigger>
          <TabsTrigger value="errors" count={policies.length}>
            Error handling
          </TabsTrigger>
          <TabsTrigger value="limits" count={loopErrors.length || undefined}>
            Loops and limits
          </TabsTrigger>
        </TabsList>
        <TabsContent value="canvas">
          <div className="yxp-canvas">
            <BuilderCanvas layout="edit" name={name} schema={schema} defaultValue={flow} statusText={`${status} · ${version}`} samples={[]} onPublish={() => {}} />
          </div>
        </TabsContent>
        <TabsContent value="trigger">
          <Card title="Starts when">
            <div className="yxp-stack yxp-narrow">
              <FormField label="Trigger type" required>
                <Select options={TRIGGER_TYPES} value={trigger} onChange={setTrigger} />
              </FormField>
              {trigger === 'webhook' ? (
                <DescriptionList
                  items={[
                    { label: 'Endpoint', value: 'https://kaverifoods.in.yukthix.com/wf/in/7f31c2', mono: true, copyValue: 'https://kaverifoods.in.yukthix.com/wf/in/7f31c2' },
                    { label: 'Signature', value: 'HMAC with timestamp; requests older than 5 minutes are rejected' },
                    { label: 'Secret', value: 'Stored in the vault · rotated 12 Sep 2026' },
                  ]}
                />
              ) : trigger === 'email' ? (
                <DescriptionList items={[{ label: 'Address', value: 'wf-7f31c2@kaverifoods.in.yukthix', mono: true }, { label: 'Allowed senders', value: 'bgv@trustcheck.example, hr@kaverifoods.in' }]} />
              ) : (
                <DescriptionList items={[{ label: 'Date', value: '30 days before Probation end date' }, { label: 'Time zone', value: 'Asia/Kolkata (company)' }]} />
              )}
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="errors">
          <Card title="If a step fails">
            <ul className="yxp-plain">
              {policies.map((p) => (
                <li key={p.step} className="yxp-row yxp-row--between">
                  <span className="yxp-row">
                    <strong>{p.step}</strong>
                    {p.irreversible && (
                      <Badge tone="warning">
                        <Icon icon={Lock} /> Can't be undone
                      </Badge>
                    )}
                  </span>
                  <span>{p.onError === 'retry' ? `Retry ${p.retries ?? 3} times with backoff, then stop and alert the owner` : p.onError === 'fallback' ? 'Go to the fallback branch' : 'Stop and alert the owner'}</span>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>
        <TabsContent value="limits">
          <div className="yxp-stack">
            {loopErrors.length > 0 && (
              <InlineAlert tone="danger" title="This workflow can't be saved yet">
                Set a maximum item count for {loopErrors.map((l) => l.step).join(', ')}. Every loop needs one.
              </InlineAlert>
            )}
            <Card title="Loops">
              {loops.map((l) => (
                <FormField key={l.step} label={`${l.step} · over ${l.over}`} required error={!l.max ? 'Enter the most items this loop may process' : null}>
                  <NumberField value={l.max} onChange={() => {}} min={1} suffix="items" />
                </FormField>
              ))}
            </Card>
            <Card title="Limits per run">
              <DescriptionList
                columns={2}
                items={[
                  { label: 'Records touched', value: '500' },
                  { label: 'Steps executed', value: '50' },
                  { label: 'Duration', value: '15 minutes' },
                  { label: 'Loop protection', value: 'On: this workflow never re-triggers itself on the same record' },
                ]}
              />
              <p className="yxp-muted">A run that reaches a limit stops and alerts the owner.</p>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </SettingsFrame>
  );
}

/* ================================================================== PLT-56 Template gallery */

export interface Template {
  id: string;
  name: string;
  module: string;
  description: string;
  steps: number;
  used?: boolean;
  update?: { from: string; to: string; change: string };
}

// PLT-56
export function TemplateGalleryScreen({ templates, filter, updateOpen }: { templates: Template[]; filter?: string; updateOpen?: string }) {
  const [module, setModule] = useState<string | null>(filter ?? null);
  const [upd, setUpd] = useState<string | null>(updateOpen ?? null);
  const shown = templates.filter((t) => !module || t.module === module);
  const withUpdate = templates.filter((t) => t.update);
  const u = templates.find((t) => t.id === upd);
  return (
    <SettingsFrame active="Workflow Studio">
      <PageHeader title="Template gallery" description="Starter workflows. Each opens as an editable draft; nothing runs until you publish." />
      {withUpdate.length > 0 && (
        <InlineAlert tone="info" title={`YukthiX updated ${withUpdate.length} template${withUpdate.length === 1 ? '' : 's'} you use`}>
          Your workflows don't change unless you accept. <Link href="#" onClick={(e) => { e.preventDefault(); setUpd(withUpdate[0].id); }}>Review {withUpdate[0].name}</Link>
        </InlineAlert>
      )}
      <div className="yxp-row">
        <FormField label="Module">
          <Select options={[...new Set(templates.map((t) => t.module))].map((m) => ({ value: m, label: m }))} value={module} onChange={setModule} clearable placeholder="All modules" size="sm" />
        </FormField>
      </div>
      {shown.length === 0 ? (
        <EmptyState title="No templates for this module." description="Clear the filter to see all starters." action={<Button onClick={() => setModule(null)}>Clear filter</Button>} />
      ) : (
        <ul className="yxp-grid yxp-plain" aria-label="Templates">
          {shown.map((t) => (
            <li key={t.id} className="yxp-tile">
              <span className="yxp-row">
                <Badge tone="neutral">{t.module}</Badge>
                {t.used && <Badge tone="success">In use</Badge>}
                {t.update && <Badge tone="info">Update available</Badge>}
              </span>
              <h2 className="yxp-tile__title">{t.name}</h2>
              <p>{t.description}</p>
              <p className="yxp-muted">{t.steps} steps</p>
              <div className="yxp-tile__foot">
                <Button aria-label={`Use this: ${t.name}`}>Use this</Button>
                {t.update && <Button onClick={() => setUpd(t.id)}>See update</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={u != null}
        onOpenChange={(o) => !o && setUpd(null)}
        size="md"
        title={`Update ${u?.name ?? ''} from ${u?.update?.from} to ${u?.update?.to}?`}
        description="Accepting creates a new draft of your workflow with the change. You review, test and publish it as usual."
        footer={
          <>
            <Button onClick={() => setUpd(null)}>Keep mine</Button>
            <Button variant="primary">Accept as draft</Button>
          </>
        }
      >
        <p>{u?.update?.change}</p>
      </Dialog>
    </SettingsFrame>
  );
}

/* ================================================================== PLT-57 Test & preview panel */

export interface TraceStep {
  step: string;
  status: 'passed' | 'skipped' | 'failed';
  input: string;
  output: string;
}

// PLT-57
export function TestPreviewDrawer({
  name,
  version,
  samples,
  chosen,
  traces,
  impact,
  state = 'ready',
  stored,
}: {
  name: string;
  version: string;
  samples: { value: string; label: string }[];
  chosen: string[];
  traces: Record<string, TraceStep[]> | null;
  impact: { rows: ImpactRow[]; runs: number } | null;
  state?: 'ready' | 'running';
  stored?: string;
}) {
  const [pick, setPick] = useState<string[]>(chosen);
  const [record, setRecord] = useState<string | null>(chosen[0] ?? null);
  const trace = record && traces ? traces[record] : null;
  const failed = traces ? Object.values(traces).some((t) => t.some((s) => s.status === 'failed')) : false;
  return (
    <SettingsFrame active="Workflow Studio">
      <PageHeader title={name} status={<Badge tone="info">{`Draft ${version}`}</Badge>} />
      <Drawer
        open
        onOpenChange={() => {}}
        size="lg"
        title="Test and preview"
        subtitle={`${name} · ${version} · nothing is saved or sent`}
        footer={
          <>
            <Button>Close</Button>
            <Button variant="primary" disabled={!traces || !impact || failed}>
              Save results with {version}
            </Button>
          </>
        }
      >
        <div className="yxp-stack">
          {stored && <InlineAlert tone="success" title={`Test run and impact preview stored with ${version} on ${stored}`}>Publishing is now allowed.</InlineAlert>}
          <FormField label="Sample records" helper="Pick up to 5 real records. The test reads them; it never changes them.">
            <MultiSelect options={samples} value={pick} onChange={(v) => setPick(v.slice(0, 5))} />
          </FormField>
          <div className="yxp-row">
            <Button loading={state === 'running'} disabled={!pick.length}>
              Run test
            </Button>
          </div>
          {state === 'running' ? (
            <p className="yxp-muted" aria-live="polite">
              Running {pick.length} sample records through each step…
            </p>
          ) : !traces ? (
            <p className="yxp-muted">Run a test to see each step's input and output for every sample record.</p>
          ) : (
            <>
              <FormField label="Trace for">
                <Select options={samples.filter((s) => pick.includes(s.value))} value={record} onChange={setRecord} size="sm" />
              </FormField>
              <ol className="yxp-trace" aria-label="Step-by-step trace">
                {(trace ?? []).map((s) => (
                  <li key={s.step}>
                    <Badge tone={s.status === 'passed' ? 'success' : s.status === 'failed' ? 'danger' : 'neutral'}>{s.status === 'passed' ? 'Passed' : s.status === 'failed' ? 'Failed' : 'Skipped'}</Badge>
                    <strong>{s.step}</strong>
                    <div className="yxp-trace__io">
                      <div>
                        <p className="yxp-muted">Input</p>
                        <pre>{s.input}</pre>
                      </div>
                      <div>
                        <p className="yxp-muted">Output</p>
                        <pre>{s.output}</pre>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
          <h3 className="yxp-sub">Impact preview</h3>
          {impact ? (
            <ImpactPreview subject={`${name} · ${version} · next 60 days`} mode="live" rows={impact.rows} valueLabel="Probation status" automationRuns={impact.runs} canDownload />
          ) : (
            <p className="yxp-muted">The impact preview runs after the test. Both are stored with the version before you can publish.</p>
          )}
        </div>
      </Drawer>
    </SettingsFrame>
  );
}

/* ================================================================== PLT-58 Versions */

export interface VersionMeta {
  id: string;
  author: string;
  approver?: string;
  approval?: 'needed' | 'approved' | 'not needed';
}

// PLT-58
export function WorkflowVersionsScreen({ name, schema, versions, meta, persona }: { name: string; schema: RuleSchema; versions: FlowVersion[]; meta: VersionMeta[]; persona: 'owner' | 'approver' }) {
  const draft = versions.find((v) => v.status === 'draft');
  const m = (id: string) => meta.find((x) => x.id === id);
  const cols: TableColumn<FlowVersion>[] = [
    { key: 'v', header: 'Version', type: 'id', value: (v) => `v${v.number}` },
    { key: 'status', header: 'Status', type: 'status', value: (v) => v.status, statusTone: (s) => (s === 'published' ? 'success' : s === 'draft' ? 'info' : 'neutral') },
    { key: 'date', header: 'Date', type: 'date', value: (v) => v.date },
    { key: 'author', header: 'Author', type: 'person', value: (v) => v.author, person: (v) => ({ name: v.author }) },
    { key: 'approver', header: 'Second approver', value: (v) => m(v.id)?.approver ?? '', render: (v) => (m(v.id)?.approval === 'needed' ? <Badge tone="warning">Waiting for approval</Badge> : m(v.id)?.approver ?? 'Not needed') },
    { key: 'note', header: 'Change note', value: (v) => v.note ?? '' },
  ];
  return (
    <SettingsFrame active="Workflow Studio">
      <PageHeader
        title={`${name} · versions`}
        description="Every version is kept. Runs record the version they used."
        actions={
          persona === 'approver' && draft ? (
            <>
              <Button>Send back</Button>
              <Button variant="primary">Approve and publish {`v${draft.number}`}</Button>
            </>
          ) : undefined
        }
      />
      {persona === 'approver' && draft && (
        <InlineAlert tone="info" title={`${draft.author} wrote v${draft.number}. It updates leave balances, so a second person must approve.`}>
          You can't approve a version you wrote. The test run and impact preview are stored with it.
        </InlineAlert>
      )}
      <DataTable
        label="Versions"
        columns={cols}
        rows={[...versions].sort((a, b) => b.number - a.number)}
        getRowId={(v) => v.id}
        rowButtons={
          persona === 'owner'
            ? (v) =>
                v.status === 'archived' ? (
                  <ConfirmDialog trigger={<Button size="sm">Re-publish</Button>} title={`Re-publish v${v.number}?`} consequence={`This creates a new draft from v${v.number}. It needs a test run, impact preview and, for leave balances, a second approver before it goes live.`} confirmLabel={`Re-publish v${v.number}`} onConfirm={() => {}} />
                ) : null
            : undefined
        }
      />
      <Card title="Compare versions">
        <VersionCompare versions={versions} schema={schema} />
      </Card>
    </SettingsFrame>
  );
}

/* ================================================================== PLT-59 Run log & failure queue */

export type RunStatus = 'Running' | 'Waiting' | 'Done' | 'Failed' | 'Stopped' | 'Undone';
export interface WorkflowRun {
  id: string;
  workflow: string;
  version: string;
  status: RunStatus;
  started: Date;
  startedBy: string;
  steps: number;
  records: number;
  failedStep?: string;
  error?: string;
}
const RUN_TONE: Record<RunStatus, BadgeTone> = { Running: 'info', Waiting: 'warning', Done: 'success', Failed: 'danger', Stopped: 'neutral', Undone: 'neutral' };

// PLT-59
export function RunLogScreen({ runs, workflows, allPaused, state = 'ready', defaultStatus }: { runs: WorkflowRun[]; workflows: { name: string; on: boolean }[]; allPaused?: boolean; state?: 'ready' | 'loading' | 'error'; defaultStatus?: RunStatus }) {
  const [filters, setFilters] = useState<FilterValue[]>(defaultStatus ? [{ key: 'status', type: 'multi', values: [defaultStatus] }] : []);
  const statusF = filters.find((f) => f.key === 'status');
  const shown = runs.filter((r) => !statusF || statusF.type !== 'multi' || !statusF.values.length || statusF.values.includes(r.status));
  const cols: TableColumn<WorkflowRun>[] = [
    { key: 'id', header: 'Run', type: 'id', value: (r) => r.id },
    { key: 'wf', header: 'Workflow', value: (r) => `${r.workflow} · ${r.version}` },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => RUN_TONE[v as RunStatus] },
    { key: 'started', header: 'Started', value: (r) => r.started, render: (r) => when(r.started) },
    { key: 'by', header: 'Started by', value: (r) => r.startedBy },
    { key: 'records', header: 'Records', type: 'number', value: (r) => r.records },
    { key: 'err', header: 'Failed step and error', value: (r) => r.error ?? '', render: (r) => (r.error ? `${r.failedStep}: ${r.error}` : '') },
  ];
  return (
    <SettingsFrame active="Run log">
      <PageHeader
        title="Run log"
        description="Every workflow run and step. Failed runs wait in the failure queue with the step, input and error."
        actions={
          <ConfirmDialog
            trigger={<Button variant="danger" icon={Pause}>{allPaused ? 'All workflows paused' : 'Pause all workflows'}</Button>}
            destructive
            title="Pause all 30 workflows?"
            consequence="Every running workflow stops before its next step. Paused runs can be resumed or cancelled. This is audited."
            confirmLabel="Pause all workflows"
            onConfirm={() => {}}
          />
        }
      />
      {allPaused && (
        <PageBanner tone="danger" action={<Button size="sm" icon={Play}>Resume all</Button>}>
          All workflows are paused by Anand Krishnan since 29 Sep 2026, 9:10 am. 30 runs are waiting.
        </PageBanner>
      )}
      <Card title="Kill switch per workflow">
        <div className="yxp-grid">
          {workflows.map((w) => (
            <Switch key={w.name} label={w.name} defaultChecked={w.on && !allPaused} description={w.on && !allPaused ? 'Running' : 'Paused'} />
          ))}
        </div>
      </Card>
      <DataTable
        label="Workflow runs"
        columns={cols}
        rows={state === 'ready' ? shown : []}
        getRowId={(r) => r.id}
        state={state}
        errorTitle="We couldn't load the run log."
        errorReference="RUN-88104"
        onRetry={() => {}}
        onRowClick={() => {}}
        rowButtons={(r) =>
          r.status === 'Failed' ? (
            <>
              <Button size="sm" icon={RotateCcw}>
                Retry
              </Button>
              <Button size="sm" icon={SkipForward}>
                Skip
              </Button>
            </>
          ) : r.status === 'Running' || r.status === 'Waiting' ? (
            <Button size="sm" icon={Square}>
              Stop
            </Button>
          ) : null
        }
        filtered={filters.length > 0}
        onClearFilters={() => setFilters([])}
        empty={<EmptyState title="No runs yet." description="Runs appear here once a workflow is published." />}
        toolbar={<FilterBar fields={[{ key: 'status', label: 'Status', type: 'multi', options: (Object.keys(RUN_TONE) as RunStatus[]).map((v) => ({ value: v, label: v })) }]} value={filters} onChange={setFilters} />}
      />
    </SettingsFrame>
  );
}

/* ================================================================== PLT-60 Run detail with undo */

// PLT-60
export function RunDetailScreen({ run, steps, trace, phase = 'review' }: { run: WorkflowRun; steps: RunStep[]; trace: TraceStep[]; phase?: 'review' | 'confirm' | 'undone' }) {
  const plan = planUndo(steps);
  const [open, setOpen] = useState(phase === 'confirm');
  return (
    <SettingsFrame active="Run log">
      <ObjectHeader
        name={`Run ${run.id}`}
        icon={Workflow}
        status={<Badge tone={phase === 'undone' ? 'neutral' : RUN_TONE[run.status]}>{phase === 'undone' ? 'Undone' : run.status}</Badge>}
        secondary={`${run.workflow} · ${run.version}`}
        facts={[
          { label: 'Started', value: when(run.started) },
          { label: 'Started by', value: run.startedBy },
          { label: 'Records', value: run.records },
        ]}
        actions={phase === 'undone' ? <Button>View audit entry</Button> : <Button icon={Undo2} onClick={() => setOpen(true)} disabled={plan.undo.length === 0}>Undo run</Button>}
      />
      {phase === 'undone' && (
        <InlineAlert tone="success" title={`Undone: ${plan.records} values restored`}>
          Irreversible steps were left as they are. The undo is in the audit log.
        </InlineAlert>
      )}
      <div className="yxp-split">
        <Card title="Steps with input and output">
          <ol className="yxp-trace">
            {trace.map((s) => (
              <li key={s.step}>
                <Badge tone={s.status === 'passed' ? 'success' : s.status === 'failed' ? 'danger' : 'neutral'}>{s.status === 'passed' ? 'Done' : s.status === 'failed' ? 'Failed' : 'Skipped'}</Badge>
                <strong>{s.step}</strong>
                <div className="yxp-trace__io">
                  <div>
                    <p className="yxp-muted">Input</p>
                    <pre>{s.input}</pre>
                  </div>
                  <div>
                    <p className="yxp-muted">Output</p>
                    <pre>{s.output}</pre>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
        <aside className="yxp-stack" aria-label="Undo plan">
          <UndoLists plan={plan} />
        </aside>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        size="md"
        title={`Undo run ${run.id}?`}
        consequence={`${plan.undo.length} steps are reversed in reverse order, restoring ${plan.records} records. ${plan.irreversible.length} steps can't be undone and stay as they are.${plan.conflicts.length ? ` ${plan.conflicts.length} step is refused because its records changed since the run.` : ''}`}
        confirmLabel="Undo run"
        onConfirm={() => {}}
      >
        <UndoLists plan={plan} />
      </ConfirmDialog>
    </SettingsFrame>
  );
}

function UndoLists({ plan }: { plan: ReturnType<typeof planUndo> }) {
  const block = (title: string, list: RunStep[], icon: typeof CheckCircle2, extra?: (s: RunStep) => ReactNode) =>
    list.length > 0 && (
      <section className="yxp-stack yxp-stack--tight" aria-label={title}>
        <h3 className="yxp-sub">{title}</h3>
        <ul className="yxp-plain">
          {list.map((s) => (
            <li key={s.id} className="yxp-row">
              <Icon icon={icon} /> {s.title} · {s.count} {s.count === 1 ? 'record' : 'records'}
              {extra?.(s)}
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <>
      {block('Will be reversed (in this order)', plan.undo, Undo2)}
      {block("Can't be undone", plan.irreversible, Lock)}
      {plan.conflicts.length > 0 && (
        <InlineAlert tone="danger" title="Refused: records changed since the run">
          <ul className="yxp-list">
            {plan.conflicts.map((c) => (
              <li key={c.id}>
                {c.title}: {c.conflict}
              </li>
            ))}
          </ul>
        </InlineAlert>
      )}
    </>
  );
}

/* ================================================================== PLT-61 Script editor */

export interface StaticCheck {
  name: string;
  ok: boolean;
  detail: string;
}

// PLT-61
export function ScriptEditorScreen({ code, checks, identityScopes, publisherScopes, console: out, problems = [] }: { code: string; checks: StaticCheck[]; identityScopes: string[]; publisherScopes: string[]; console?: string; problems?: { line: number; message: string; severity: 'error' | 'warning' }[] }) {
  const [src, setSrc] = useState(code);
  const broader = identityScopes.filter((s) => !publisherScopes.includes(s));
  const failing = checks.filter((c) => !c.ok).length + broader.length;
  return (
    <SettingsFrame active="Scripts">
      <ObjectHeader
        name="Referral bonus eligibility"
        icon={Code}
        secondary="Script step in “Referral bonus” · v2 draft · TypeScript"
        status={<Badge tone={failing ? 'danger' : 'success'}>{failing ? `${failing} checks failing` : 'Checks passed'}</Badge>}
        facts={[
          { label: 'Runs as', value: 'wf-referral-bonus' },
          { label: 'Limits', value: '2 s CPU · 128 MB · 10 s' },
          { label: 'Second approver', value: 'Needed: reads pay data' },
        ]}
        actions={
          <>
            <Button icon={Play}>Run test</Button>
            <Button variant="primary" disabled={failing > 0}>
              Submit for review
            </Button>
          </>
        }
      />
      <div className="yxp-split">
        <div className="yxp-stack">
          <CodeEditor label="Script" value={src} onChange={setSrc} problems={problems} />
          <Card title="Test console">
            <pre className="yxp-console" aria-live="polite">
              {out ?? 'Run a test to see SDK calls, inputs and outputs. Scripts run in a sandbox: no files, no internet except approved connections.'}
            </pre>
          </Card>
        </div>
        <aside className="yxp-stack" aria-label="Checks, identity and SDK">
          <Card title="Static checks">
            <ul className="yxp-plain">
              {checks.map((c) => (
                <li key={c.name} className="yxp-row">
                  <Icon icon={c.ok ? CheckCircle2 : AlertTriangle} />
                  <span>
                    <strong>{c.name}</strong> · {c.detail}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Service identity and scopes">
            <p className="yxp-muted">The script can never do more than the admin who publishes it.</p>
            <ul className="yxp-plain">
              {identityScopes.map((s) => (
                <li key={s} className="yxp-row">
                  <code className="yxp-mono">{s}</code>
                  {broader.includes(s) ? <Badge tone="danger">Broader than your rights</Badge> : <Badge tone="success">Within your rights</Badge>}
                </li>
              ))}
            </ul>
            {broader.length > 0 && <InlineAlert tone="danger" title="Remove the scopes you don't hold, or ask an admin who holds them to publish." />}
            <p className="yxp-muted">Secrets: from the vault only (referral-api-key).</p>
          </Card>
          <Card title="SDK types">
            <pre className="yxp-console">{`yx.people.get(id): Person
yx.people.update(id, { custom }): void
yx.projects.list({ client }): Project[]
yx.log(message): void`}</pre>
          </Card>
        </aside>
      </div>
    </SettingsFrame>
  );
}

/* ================================================================== PLT-62 AI build panel */

// PLT-62
export function AiBuildPanelScreen({ name, schema, flow, messages, canPublish, generating, impact }: { name: string; schema: RuleSchema; flow: Flow | null; messages: AssistantMessage[]; canPublish: boolean; generating?: boolean; impact?: string }) {
  return (
    <SettingsFrame active="Workflow Studio">
      <div className="yxp-studio-ai">
        <div className="yxp-stack">
          {flow ? (
            <>
              <InlineAlert tone="info" title={<span className="yxp-row">Draft by the assistant <AiBadge /></span>}>
                {impact ?? 'Review each step.'} The assistant can't publish.{' '}
                {canPublish ? 'Test it, then publish it yourself.' : 'Ask a System Admin to review and publish it.'}
              </InlineAlert>
              <div className="yxp-canvas">
                <BuilderCanvas layout="edit" name={name} schema={schema} defaultValue={flow} statusText="Draft by the assistant · not published" samples={[]} onPublish={canPublish ? () => {} : undefined} />
              </div>
            </>
          ) : (
            <EmptyState title="Describe the automation you need." description="The assistant drafts the workflow here, explains it and runs the impact preview." />
          )}
        </div>
        <AssistantPanel messages={messages} onSend={() => {}} generating={generating} onStop={() => {}} onFeedback={() => {}} onClose={() => {}} defaultDraft={messages.length ? '' : 'Remind managers when someone’s leave balance drops below 2 days'} />
      </div>
    </SettingsFrame>
  );
}

/* ================================================================== PLT-63 / PLT-64 Agent plan (do mode) */

// PLT-63 / PLT-64 desktop
export function AgentPlanDesk(props: AgentPlanCardProps) {
  return (
    <DesktopFrame area="home" panelTitle="Home" panel={[{ items: [{ label: 'Home', active: true }, { label: 'Approvals' }, { label: 'Notifications' }] }]}>
      <PageHeader title="Ask YukthiX" description="Do mode: the assistant plans, you approve, it works with your own permissions." />
      <AgentPlanCard {...props} />
    </DesktopFrame>
  );
}

// PLT-63 / PLT-64 phone
export function AgentPlanPhone(props: AgentPlanCardProps) {
  return (
    <PhoneFrame tab="home" title="Ask YukthiX">
      <AgentPlanCard {...props} compact />
    </PhoneFrame>
  );
}

