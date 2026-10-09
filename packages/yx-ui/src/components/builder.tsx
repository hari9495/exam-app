import {
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Code,
  GitBranch,
  Hourglass,
  Lock,
  Maximize,
  PencilLine,
  Plus,
  UserCheck,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { countConditions, summariseConditions, type Rule, type RuleSchema } from '../lib/rules';
import { formatDate } from '../lib/format';
import { Button, IconButton, Link } from './button';
import { Heading, Icon, Spinner, VisuallyHidden, type IconComponent } from './foundations';
import { FormField } from './field';
import { NumberField, TextArea, TextField } from './inputs';
import { Select, type SelectOption } from './select';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from './menu';
import { Badge, type BadgeTone } from './display';
import { InlineAlert } from './feedback';
import { BottomSheet, ConfirmDialog, useControllable } from './overlay';
import { ConditionBuilder, emptyRule } from './condition';
import { useNarrow } from './stepper';

/* ================================================================== model */

export type NodeKind = 'trigger' | 'condition' | 'approval' | 'wait' | 'notify' | 'update' | 'script';
export type NodeStatus = 'valid' | 'error' | 'disabled';
/** `next` for ordinary steps; `yes` / `no` for a condition (branch). */
export type OutputPort = 'next' | 'yes' | 'no';

export interface NodeConfig {
  /** trigger */
  trigger?: string | null;
  /** condition */
  rule?: Rule;
  /** approval: recipient value; notify: recipient value */
  approver?: string | null;
  recipient?: string | null;
  expiresDays?: number | null;
  /** wait (P22 YX-WFS-06: every wait has a timeout) */
  waitDays?: number | null;
  timeoutDays?: number | null;
  message?: string;
  /** update record */
  field?: string | null;
  value?: string;
}

export interface FlowNode {
  id: string;
  kind: NodeKind;
  title: string;
  /** Canvas position in px, on the 8 px grid. */
  x: number;
  y: number;
  disabled?: boolean;
  config?: NodeConfig;
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  port: OutputPort;
}

export interface Flow {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export const BLOCKS: Record<NodeKind, { label: string; icon: IconComponent; locked?: string }> = {
  trigger: { label: 'Trigger', icon: Zap },
  condition: { label: 'Condition', icon: GitBranch },
  approval: { label: 'Approval step', icon: UserCheck },
  wait: { label: 'Wait', icon: Hourglass },
  notify: { label: 'Send notification', icon: Bell },
  update: { label: 'Update record', icon: PencilLine },
  script: { label: 'Script', icon: Code, locked: 'Wave 6' },
};
const KIND_ORDER: NodeKind[] = ['trigger', 'condition', 'approval', 'wait', 'notify', 'update', 'script'];

export const NODE_W = 240;
export const NODE_H = 112;
export const GRID = 8;
const GAP_Y = 72;
const PORT_LABEL: Record<OutputPort, string> = { next: 'Next', yes: 'Yes', no: 'No' };

export const snap = (n: number) => Math.round(n / GRID) * GRID;
export const portsFor = (kind: NodeKind): OutputPort[] => (kind === 'condition' ? ['yes', 'no'] : ['next']);
const portX = (port: OutputPort) => (port === 'yes' ? NODE_W * 0.25 : port === 'no' ? NODE_W * 0.75 : NODE_W / 2);

let seq = 0;
const newId = (p: string) => `${p}-new-${++seq}`;

const label = (opts: { value: string; label: string }[], v: string | null | undefined) => opts.find((o) => o.value === v)?.label;

/** One-line description shown on the node and in version diffs. */
export function nodeSummary(node: FlowNode, schema: RuleSchema): string {
  const c = node.config ?? {};
  switch (node.kind) {
    case 'trigger':
      return label(schema.triggers, c.trigger) ?? 'No event chosen';
    case 'condition':
      return (c.rule && summariseConditions(c.rule.conditions, schema.fields)) || 'No conditions yet';
    case 'approval': {
      const who = label(schema.recipients, c.approver);
      if (!who) return 'No approver chosen';
      return c.expiresDays ? `${who} · expires after ${c.expiresDays} days` : who;
    }
    case 'wait':
      return `Wait ${c.waitDays ?? 0} days · ${c.timeoutDays ? `timeout after ${c.timeoutDays} days` : 'no timeout'}`;
    case 'notify':
      return label(schema.recipients, c.recipient) ? `To ${label(schema.recipients, c.recipient)}` : 'No recipient chosen';
    case 'update': {
      const f = label(schema.fields.map((x) => ({ value: x.key, label: x.label })), c.field);
      return f ? `Set ${f} to ${c.value || '(blank)'}` : 'No field chosen';
    }
    default:
      return 'Scripts arrive in Wave 6';
  }
}

/** Problems per node id. A workflow with problems can be tested but not published (P22 YX-WFS-03). */
export function validateFlow(flow: Flow, schema: RuleSchema): Record<string, string> {
  const out: Record<string, string> = {};
  const incoming = new Set(flow.edges.map((e) => e.to));
  for (const n of flow.nodes) {
    if (n.disabled) continue;
    const c = n.config ?? {};
    let msg: string | null = null;
    if (n.kind === 'trigger' && !c.trigger) msg = 'Choose the event that starts this workflow';
    else if (n.kind === 'condition' && (!c.rule || countConditions(c.rule.conditions, schema.fields) === 0)) msg = 'Add at least one condition';
    else if (n.kind === 'approval' && !c.approver) msg = 'Choose who approves';
    else if (n.kind === 'wait' && !c.timeoutDays) msg = 'Set a timeout for this wait';
    else if (n.kind === 'notify' && !c.recipient) msg = 'Choose who to notify';
    else if (n.kind === 'update' && !c.field) msg = 'Choose the field to update';
    else if (n.kind !== 'trigger' && !incoming.has(n.id)) msg = 'Connect a step to this one';
    if (msg) out[n.id] = msg;
  }
  return out;
}

/** Connects `from`'s port to `to`, replacing whatever that port pointed at. */
export function connectNodes(flow: Flow, from: string, port: OutputPort, to: string): Flow {
  const edges = flow.edges.filter((e) => !(e.from === from && e.port === port));
  return { ...flow, edges: [...edges, { id: newId('e'), from, to, port }] };
}

/** Removes a node and every connector to or from it. */
export function removeNode(flow: Flow, id: string): Flow {
  return { nodes: flow.nodes.filter((n) => n.id !== id), edges: flow.edges.filter((e) => e.from !== id && e.to !== id) };
}

function freeSpot(flow: Flow, x: number, y: number) {
  let yy = y;
  while (flow.nodes.some((n) => Math.abs(n.x - x) < NODE_W && Math.abs(n.y - yy) < NODE_H)) yy += NODE_H + GRID * 4;
  return { x: snap(Math.max(0, x)), y: snap(yy) };
}

function makeNode(kind: NodeKind, x: number, y: number): FlowNode {
  const config: NodeConfig = kind === 'condition' ? { rule: emptyRule() } : kind === 'wait' ? { waitDays: 1, timeoutDays: null } : {};
  return { id: newId(kind), kind, title: BLOCKS[kind].label, x, y, config };
}

/** Adds a step after `from`'s port and connects it. */
export function addNodeAfter(flow: Flow, from: FlowNode, port: OutputPort, kind: NodeKind): { flow: Flow; node: FlowNode } {
  const pos = freeSpot(flow, from.x + portX(port) - NODE_W / 2 + (port === 'yes' ? -NODE_W / 2 - GRID * 2 : port === 'no' ? NODE_W / 2 + GRID * 2 : 0), from.y + NODE_H + GAP_Y);
  const node = makeNode(kind, pos.x, pos.y);
  return { flow: connectNodes({ ...flow, nodes: [...flow.nodes, node] }, from.id, port, node.id), node };
}

export interface FlowDiff {
  added: FlowNode[];
  removed: FlowNode[];
  changed: { before: FlowNode; after: FlowNode; what: string[] }[];
  connectionsAdded: FlowEdge[];
  connectionsRemoved: FlowEdge[];
}

const edgeKey = (e: FlowEdge) => `${e.from}|${e.port}|${e.to}`;

/** Compares two versions by node id. Moving a node on the canvas is not a change. */
export function diffFlows(before: Flow, after: Flow): FlowDiff {
  const old = new Map(before.nodes.map((n) => [n.id, n]));
  const now = new Map(after.nodes.map((n) => [n.id, n]));
  const changed: FlowDiff['changed'] = [];
  for (const n of after.nodes) {
    const o = old.get(n.id);
    if (!o) continue;
    const what: string[] = [];
    if (o.title !== n.title) what.push('name');
    if (JSON.stringify(o.config ?? {}) !== JSON.stringify(n.config ?? {})) what.push('settings');
    if (Boolean(o.disabled) !== Boolean(n.disabled)) what.push(n.disabled ? 'turned off' : 'turned on');
    if (what.length) changed.push({ before: o, after: n, what });
  }
  const oldEdges = new Set(before.edges.map(edgeKey));
  const newEdges = new Set(after.edges.map(edgeKey));
  return {
    added: after.nodes.filter((n) => !old.has(n.id)),
    removed: before.nodes.filter((n) => !now.has(n.id)),
    changed,
    connectionsAdded: after.edges.filter((e) => !oldEdges.has(edgeKey(e))),
    connectionsRemoved: before.edges.filter((e) => !newEdges.has(edgeKey(e))),
  };
}

/* ================================================================== NodeCard */

export interface NodeCardProps {
  kind: NodeKind;
  title: string;
  summary?: string;
  status?: NodeStatus;
  /** Shown on the node when status is error (§46). */
  error?: string;
  selected?: boolean;
  /** Linked from a test-run step (hover or focus). */
  highlighted?: boolean;
  /** Screen-reader text for where the outputs go, e.g. "Yes: Manager approval. No: Notify employee." */
  connections?: string;
  /** Output handles ("+" buttons). */
  outputs?: ReactNode;
  style?: CSSProperties;
  /** Props for the node's main button (select, drag, keyboard move). */
  buttonProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;
}

/** A workflow step: icon, type, title, one-line summary, status and output handles. */
export function NodeCard({ kind, title, summary, status = 'valid', error, selected, highlighted, connections, outputs, style, buttonProps }: NodeCardProps) {
  const errId = useId();
  const block = BLOCKS[kind];
  return (
    <div
      className="yx-node"
      data-kind={kind}
      data-status={status}
      data-selected={selected || undefined}
      data-highlighted={highlighted || undefined}
      style={style}
    >
      <button
        type="button"
        className="yx-node__main"
        aria-pressed={selected ?? false}
        aria-describedby={status === 'error' && error ? errId : undefined}
        {...buttonProps}
      >
        <span className="yx-node__type">
          <Icon icon={block.icon} />
          <span>{block.label}</span>
          <span className="yx-node__state">
            {status === 'valid' && (
              <>
                <Icon icon={CheckCircle2} /> Ready
              </>
            )}
            {status === 'disabled' && 'Turned off'}
            {status === 'error' && 'Needs fixing'}
          </span>
        </span>
        <span className="yx-node__title">{title}</span>
        <span className="yx-node__summary">{summary}</span>
        {status === 'error' && error && (
          <span className="yx-node__error" id={errId}>
            <Icon icon={AlertCircle} />
            <span>{error}</span>
          </span>
        )}
        {connections && <VisuallyHidden>{connections}</VisuallyHidden>}
      </button>
      {outputs}
    </div>
  );
}

/* ================================================================== PropertiesDrawer */

export interface PropertiesDrawerProps {
  node: FlowNode;
  schema: RuleSchema;
  error?: string;
  onChange: (node: FlowNode) => void;
  onClose: () => void;
  /** Asks to delete (the canvas confirms first). Not offered for the trigger. */
  onDelete?: () => void;
}

/** Right-hand panel that edits the selected step. Not modal: the canvas stays usable (§46). */
export function PropertiesDrawer({ node, schema, error, onChange, onClose, onDelete }: PropertiesDrawerProps) {
  const hid = useId();
  const c = node.config ?? {};
  const setC = (patch: Partial<NodeConfig>) => onChange({ ...node, config: { ...c, ...patch } });
  const recipients = schema.recipients;
  return (
    <aside className="yx-builder__props" aria-labelledby={hid}>
      <header className="yx-builder__props-head">
        <div>
          <span className="yx-builder__props-kind">
            <Icon icon={BLOCKS[node.kind].icon} /> {BLOCKS[node.kind].label}
          </span>
          <Heading level={2} as="h2" id={hid}>
            {node.title || 'Untitled step'}
          </Heading>
        </div>
        <IconButton icon={X} label="Close properties" onClick={onClose} />
      </header>
      <div className="yx-builder__props-body">
        {error && <InlineAlert tone="danger" title={error} />}
        <FormField label="Step name" required>
          <TextField value={node.title} onChange={(title) => onChange({ ...node, title })} />
        </FormField>
        {node.kind === 'trigger' && (
          <FormField label="Starts when" required>
            <Select options={schema.triggers} value={c.trigger ?? null} onChange={(trigger) => setC({ trigger })} placeholder="Event" />
          </FormField>
        )}
        {node.kind === 'condition' && (
          <div className="yx-builder__props-rule">
            <p className="yx-builder__props-note">Records that match go to Yes; all others go to No.</p>
            <ConditionBuilder schema={schema} parts={['if']} value={c.rule ?? emptyRule()} onChange={(rule) => setC({ rule })} showErrors={Boolean(error)} />
          </div>
        )}
        {node.kind === 'approval' && (
          <>
            <FormField label="Approver" required>
              <Select options={recipients} value={c.approver ?? null} onChange={(approver) => setC({ approver })} placeholder="Person or role" />
            </FormField>
            <FormField label="Expires after (days)" helper="If nobody acts in time, the request expires and the workflow stops.">
              <NumberField value={c.expiresDays ?? null} onChange={(expiresDays) => setC({ expiresDays })} min={1} />
            </FormField>
          </>
        )}
        {node.kind === 'wait' && (
          <>
            <FormField label="Wait for (days)" required>
              <NumberField value={c.waitDays ?? null} onChange={(waitDays) => setC({ waitDays })} min={0} />
            </FormField>
            <FormField label="Timeout (days)" required helper="Every wait needs a timeout so the workflow never waits forever.">
              <NumberField value={c.timeoutDays ?? null} onChange={(timeoutDays) => setC({ timeoutDays })} min={1} />
            </FormField>
          </>
        )}
        {node.kind === 'notify' && (
          <>
            <FormField label="Send to" required>
              <Select options={recipients} value={c.recipient ?? null} onChange={(recipient) => setC({ recipient })} placeholder="Person or role" />
            </FormField>
            <FormField label="Message">
              <TextArea value={c.message ?? ''} onChange={(message) => setC({ message })} rows={3} />
            </FormField>
          </>
        )}
        {node.kind === 'update' && (
          <>
            <FormField label="Field" required>
              <Select
                options={schema.fields.map((f) => ({ value: f.key, label: f.label }))}
                value={c.field ?? null}
                onChange={(field) => setC({ field })}
                placeholder="Field"
              />
            </FormField>
            <FormField label="New value">
              <TextField value={c.value ?? ''} onChange={(value) => setC({ value })} />
            </FormField>
          </>
        )}
      </div>
      {onDelete && node.kind !== 'trigger' && (
        <footer className="yx-builder__props-foot">
          <Button variant="danger" size="sm" onClick={onDelete}>
            Delete step
          </Button>
        </footer>
      )}
    </aside>
  );
}

/* ================================================================== TestRunPanel */

export type TestStepStatus = 'passed' | 'skipped' | 'failed';

export interface TestStepResult {
  nodeId: string;
  status: TestStepStatus;
  /** Plain reason: "Days is 5, more than 3", "Skipped: took the No branch". */
  reason: string;
}

export interface FlowIssue {
  nodeId: string;
  title: string;
  message: string;
}

export interface TestRunPanelProps {
  samples: SelectOption[];
  sample?: string | null;
  defaultSample?: string | null;
  onSampleChange?: (id: string | null) => void;
  /** null = not run yet. */
  results: TestStepResult[] | null;
  running?: boolean;
  onRun: (sampleId: string) => void;
  /** Titles for step results. */
  nodes: Pick<FlowNode, 'id' | 'title'>[];
  /** Validation problems, listed above the results (§46). */
  issues?: FlowIssue[];
  /** Hover or focus on a result highlights its node. */
  onHighlight?: (nodeId: string | null) => void;
  onSelectNode?: (nodeId: string) => void;
  onClose?: () => void;
}

const STEP_TONE: Record<TestStepStatus, BadgeTone> = { passed: 'success', skipped: 'neutral', failed: 'danger' };
const STEP_LABEL: Record<TestStepStatus, string> = { passed: 'Passed', skipped: 'Skipped', failed: 'Failed' };

/** Bottom panel: run the draft against a sample record and see what each step would do. */
export function TestRunPanel({ samples, sample, defaultSample = null, onSampleChange, results, running, onRun, nodes, issues = [], onHighlight, onSelectNode, onClose }: TestRunPanelProps) {
  const hid = useId();
  const [chosen, setChosen] = useControllable(sample, defaultSample, onSampleChange);
  const [missing, setMissing] = useState(false);
  const title = (id: string) => nodes.find((n) => n.id === id)?.title ?? 'Deleted step';
  const counts = results?.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {} as Record<TestStepStatus, number>);
  const sampleName = samples.find((s) => s.value === chosen)?.label;

  return (
    <section className="yx-testrun" aria-labelledby={hid}>
      <header className="yx-testrun__head">
        <Heading level={3} as="h2" id={hid}>
          Test run
        </Heading>
        <div className="yx-testrun__controls">
          <FormField label="Sample record" error={missing && !chosen ? 'Choose a sample record to test with' : null}>
            <Select options={samples} value={chosen} onChange={(v) => setChosen(v)} placeholder="Sample record" size="sm" />
          </FormField>
          <Button
            size="sm"
            loading={running}
            onClick={() => {
              if (!chosen) return setMissing(true);
              onRun(chosen);
            }}
          >
            Run test
          </Button>
          {onClose && <IconButton icon={X} label="Close test run" onClick={onClose} />}
        </div>
      </header>

      {issues.length > 0 && (
        <InlineAlert tone="danger" title={`Fix ${issues.length === 1 ? 'this problem' : `these ${issues.length} problems`} before you publish`}>
          <ul className="yx-testrun__issues">
            {issues.map((i) => (
              <li key={i.nodeId}>
                <Link
                  href={`#${i.nodeId}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onSelectNode?.(i.nodeId);
                  }}
                  onMouseEnter={() => onHighlight?.(i.nodeId)}
                  onMouseLeave={() => onHighlight?.(null)}
                  onFocus={() => onHighlight?.(i.nodeId)}
                  onBlur={() => onHighlight?.(null)}
                >
                  {i.title}
                </Link>
                : {i.message}
              </li>
            ))}
          </ul>
        </InlineAlert>
      )}

      <div className="yx-testrun__results" aria-live="polite" aria-busy={running || undefined}>
        {running ? (
          <p className="yx-testrun__status">
            <Spinner /> Running the draft on {sampleName ?? 'the sample record'}. Nothing is saved or sent.
          </p>
        ) : !results ? (
          <p className="yx-testrun__status">Choose a sample record and run a test to see what each step would do. Nothing is saved or sent.</p>
        ) : results.length === 0 ? (
          <p className="yx-testrun__status">No steps ran. Check that the trigger is connected to a step.</p>
        ) : (
          <>
            <p className="yx-testrun__status">
              {counts?.passed ?? 0} passed · {counts?.skipped ?? 0} skipped · {counts?.failed ?? 0} failed
            </p>
            <ol className="yx-testrun__steps">
              {results.map((r, i) => (
                <li
                  key={`${r.nodeId}-${i}`}
                  className="yx-testrun__step"
                  data-status={r.status}
                  tabIndex={0}
                  onMouseEnter={() => onHighlight?.(r.nodeId)}
                  onMouseLeave={() => onHighlight?.(null)}
                  onFocus={() => onHighlight?.(r.nodeId)}
                  onBlur={() => onHighlight?.(null)}
                >
                  <Badge tone={STEP_TONE[r.status]}>{STEP_LABEL[r.status]}</Badge>
                  <span className="yx-testrun__step-title">{title(r.nodeId)}</span>
                  <span className="yx-testrun__reason">{r.reason}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}

/* ================================================================== BuilderCanvas */

export interface BuilderCanvasProps {
  /** Workflow name, e.g. "Leave approval over 3 days". */
  name: string;
  schema: RuleSchema;
  value?: Flow;
  defaultValue?: Flow;
  onChange?: (flow: Flow) => void;
  selectedId?: string | null;
  defaultSelectedId?: string | null;
  onSelectedChange?: (id: string | null) => void;
  /** Status bar text. */
  statusText?: string;
  /** Sample records for the test run. */
  samples?: SelectOption[];
  onTestRun?: (sampleId: string, flow: Flow) => TestStepResult[] | Promise<TestStepResult[]>;
  defaultTestOpen?: boolean;
  defaultTestResults?: TestStepResult[];
  defaultSample?: string | null;
  /** Called only when the flow has no problems. */
  onPublish?: (flow: Flow) => void;
  defaultZoom?: number;
  /** Default: shown when the flow has more than 8 steps. */
  miniMap?: boolean;
  /** `auto` (default): read-only outline below 768 px, editor above (§37). `read`: always the outline. `edit`: always the editor. */
  layout?: 'auto' | 'read' | 'edit';
  /** Version badge in the read-only view, e.g. "v7". */
  version?: string;
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5];

/**
 * Workflow studio (§46, P22): palette on the left, canvas in the middle, properties on the right, test run at the bottom.
 * Every block can be added and connected with the keyboard ("+" menus); dragging is optional.
 */
function BuilderEditor({
  name,
  schema,
  value,
  defaultValue = { nodes: [], edges: [] },
  onChange,
  selectedId,
  defaultSelectedId = null,
  onSelectedChange,
  statusText = 'Draft · unpublished changes',
  samples = [],
  onTestRun,
  defaultTestOpen = false,
  defaultTestResults,
  defaultSample = null,
  onPublish,
  defaultZoom = 1,
  miniMap,
}: BuilderCanvasProps) {
  const [flow, setFlow] = useControllable(value, defaultValue, onChange);
  const [selected, setSelected] = useControllable(selectedId, defaultSelectedId, onSelectedChange);
  const [zoom, setZoom] = useState(defaultZoom);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(defaultTestOpen);
  const [results, setResults] = useState<TestStepResult[] | null>(defaultTestResults ?? null);
  const [running, setRunning] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [scroll, setScroll] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; nx: number; ny: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);

  const errors = useMemo(() => validateFlow(flow, schema), [flow, schema]);
  const issues: FlowIssue[] = flow.nodes.filter((n) => errors[n.id]).map((n) => ({ nodeId: n.id, title: n.title, message: errors[n.id] }));
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const selNode = selected ? byId.get(selected) : undefined;

  const W = Math.max(960, ...flow.nodes.map((n) => n.x + NODE_W + 160));
  const H = Math.max(560, ...flow.nodes.map((n) => n.y + NODE_H + 160));
  const showMini = miniMap ?? flow.nodes.length > 8;

  const select = (id: string | null) => setSelected(id);
  const updateNode = (n: FlowNode) => setFlow({ ...flow, nodes: flow.nodes.map((x) => (x.id === n.id ? n : x)) });
  const moveNode = (id: string, x: number, y: number) =>
    setFlow({ ...flow, nodes: flow.nodes.map((n) => (n.id === id ? { ...n, x: snap(Math.max(0, x)), y: snap(Math.max(0, y)) } : n)) });

  const addFromPalette = (kind: NodeKind, at?: { x: number; y: number }) => {
    if (at) {
      const node = makeNode(kind, snap(Math.max(0, at.x)), snap(Math.max(0, at.y)));
      setFlow({ ...flow, nodes: [...flow.nodes, node] });
      select(node.id);
      setAnnounce(`${BLOCKS[kind].label} added. Connect a step to it with a "+" button.`);
      return;
    }
    // Click: add after the selected step's first free output, else below everything.
    const from = selNode && selNode.kind !== 'script' ? selNode : undefined;
    const port = from && portsFor(from.kind).find((p) => !flow.edges.some((e) => e.from === from.id && e.port === p));
    if (from && port && kind !== 'trigger') {
      const r = addNodeAfter(flow, from, port, kind);
      setFlow(r.flow);
      select(r.node.id);
      setAnnounce(`${BLOCKS[kind].label} added after ${from.title}.`);
      return;
    }
    const pos = freeSpot(flow, flow.nodes[0]?.x ?? GRID * 5, Math.max(GRID * 5, ...flow.nodes.map((n) => n.y + NODE_H + GAP_Y)));
    const node = makeNode(kind, pos.x, pos.y);
    setFlow({ ...flow, nodes: [...flow.nodes, node] });
    select(node.id);
    setAnnounce(`${BLOCKS[kind].label} added.`);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const n = byId.get(pendingDelete);
    setFlow(removeNode(flow, pendingDelete));
    if (selected === pendingDelete) select(null);
    setAnnounce(`${n?.title ?? 'Step'} deleted with its connections.`);
    setPendingDelete(null);
  };

  const fit = () => {
    const vp = viewport.current;
    if (!vp || !vp.clientWidth) return setZoom(1);
    const maxX = Math.max(NODE_W, ...flow.nodes.map((n) => n.x + NODE_W)) + GRID * 5;
    const maxY = Math.max(NODE_H, ...flow.nodes.map((n) => n.y + NODE_H)) + GRID * 5;
    setZoom(Math.max(0.25, Math.min(1.5, vp.clientWidth / maxX, vp.clientHeight / maxY)));
    vp.scrollTo?.({ left: 0, top: 0 });
  };
  const zoomBy = (dir: 1 | -1) => {
    const i = ZOOMS.findIndex((z) => z >= zoom - 0.001);
    const next = dir > 0 ? ZOOMS.find((z) => z > zoom + 0.001) : [...ZOOMS].reverse().find((z) => z < zoom - 0.001);
    setZoom(next ?? ZOOMS[Math.max(0, i)]);
  };

  const runTest = async (sampleId: string) => {
    if (!onTestRun) return;
    setRunning(true);
    try {
      setResults(await onTestRun(sampleId, flow));
    } finally {
      setRunning(false);
    }
  };

  const publish = () => {
    if (issues.length) {
      setTestOpen(true);
      setAnnounce(`Fix ${issues.length} ${issues.length === 1 ? 'problem' : 'problems'} before you publish. They are listed in the test run panel.`);
      return;
    }
    onPublish?.(flow);
  };

  /* ---- node interaction ---- */
  const nodeHandlers = (n: FlowNode) => ({
    id: `node-${n.id}`,
    onClick: () => {
      if (justDragged.current) {
        justDragged.current = false;
        return;
      }
      select(n.id);
    },
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      drag.current = { id: n.id, sx: e.clientX, sy: e.clientY, nx: n.x, ny: n.y, moved: false };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      const d = drag.current;
      if (!d || d.id !== n.id) return;
      const dx = (e.clientX - d.sx) / zoom;
      const dy = (e.clientY - d.sy) / zoom;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      moveNode(n.id, d.nx + dx, d.ny + dy);
    },
    onPointerUp: () => {
      justDragged.current = Boolean(drag.current?.moved);
      drag.current = null;
    },
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      const step = e.shiftKey ? GRID * 4 : GRID;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key]) {
        e.preventDefault();
        moveNode(n.id, n.x + moves[e.key][0], n.y + moves[e.key][1]);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && n.kind !== 'trigger') {
        e.preventDefault();
        setPendingDelete(n.id);
      }
    },
  });

  const connectionsText = (n: FlowNode) =>
    portsFor(n.kind)
      .map((p) => {
        const e = flow.edges.find((x) => x.from === n.id && x.port === p);
        const to = e && byId.get(e.to)?.title;
        return `${PORT_LABEL[p]}: ${to ?? 'not connected'}.`;
      })
      .join(' ');

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    const kind = e.dataTransfer.getData('application/x-yx-block') as NodeKind;
    if (!kind || !BLOCKS[kind] || BLOCKS[kind].locked) return;
    e.preventDefault();
    const r = world.current?.getBoundingClientRect();
    if (!r) return;
    addFromPalette(kind, { x: (e.clientX - r.left) / zoom - NODE_W / 2, y: (e.clientY - r.top) / zoom - GRID * 3 });
  };

  const trackScroll = () => {
    const vp = viewport.current;
    if (vp) setScroll({ left: vp.scrollLeft, top: vp.scrollTop, width: vp.clientWidth, height: vp.clientHeight });
  };

  return (
    <div className="yx-builder">
      <header className="yx-builder__bar">
        <div className="yx-builder__name">
          <Heading level={2} as="h1">
            {name}
          </Heading>
          <span className="yx-builder__status">{statusText}</span>
        </div>
        <div className="yx-builder__actions">
          <Button onClick={() => setTestOpen((o) => !o)} aria-expanded={testOpen}>
            Test run
          </Button>
          <Button variant="primary" onClick={publish}>
            Publish
          </Button>
        </div>
      </header>
      <VisuallyHidden>
        <span aria-live="polite">{announce}</span>
      </VisuallyHidden>

      <div className="yx-builder__main" data-props={selNode ? true : undefined}>
        <nav className="yx-builder__palette" aria-label="Blocks">
          <p className="yx-builder__palette-title">Blocks</p>
          <p className="yx-builder__palette-hint">Click to add after the selected step, or drag onto the canvas.</p>
          <ul>
            {KIND_ORDER.map((k) => {
              const b = BLOCKS[k];
              return (
                <li key={k}>
                  <button
                    type="button"
                    className="yx-builder__block"
                    disabled={Boolean(b.locked)}
                    draggable={!b.locked}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-yx-block', k);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => addFromPalette(k)}
                    aria-label={b.locked ? `${b.label}, available in ${b.locked}` : `Add ${b.label.toLowerCase()}`}
                  >
                    <Icon icon={b.icon} />
                    <span>{b.label}</span>
                    {b.locked && (
                      <Badge tone="neutral" className="yx-builder__lock">
                        <Icon icon={Lock} /> {b.locked}
                      </Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="yx-builder__stage">
          <div className="yx-builder__zoom" role="group" aria-label="Zoom">
            <IconButton icon={ZoomOut} label="Zoom out" variant="secondary" size="sm" onClick={() => zoomBy(-1)} disabled={zoom <= ZOOMS[0]} />
            <span className="yx-builder__zoom-value" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <IconButton icon={ZoomIn} label="Zoom in" variant="secondary" size="sm" onClick={() => zoomBy(1)} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} />
            <IconButton icon={Maximize} label="Fit to screen" variant="secondary" size="sm" onClick={fit} />
          </div>
          <div
            ref={viewport}
            className="yx-builder__viewport"
            role="region"
            aria-label={`Canvas: ${flow.nodes.length} steps`}
            tabIndex={0}
            onScroll={trackScroll}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('application/x-yx-block')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }
            }}
            onDrop={onDrop}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('yx-builder__world')) select(null);
            }}
          >
            {flow.nodes.length === 0 && (
              <p className="yx-builder__empty">Add a trigger from the blocks on the left to start this workflow.</p>
            )}
            <div className="yx-builder__sizer" style={{ width: W * zoom, height: H * zoom }}>
              <div ref={world} className="yx-builder__world" style={{ width: W, height: H, transform: `scale(${zoom})` }}>
                <svg className="yx-builder__edges" width={W} height={H} aria-hidden="true">
                  <defs>
                    <marker id="yx-builder-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
                      <path d="M0,0 L8,4 L0,8 z" className="yx-builder__arrow" />
                    </marker>
                  </defs>
                  {flow.edges.map((e) => {
                    const a = byId.get(e.from);
                    const b = byId.get(e.to);
                    if (!a || !b) return null;
                    const sx = a.x + portX(e.port);
                    const sy = a.y + NODE_H;
                    const tx = b.x + NODE_W / 2;
                    const ty = b.y;
                    const dy = Math.max(40, Math.abs(ty - sy) / 2);
                    const hot = highlight != null && (highlight === a.id || highlight === b.id);
                    return (
                      <g key={e.id} data-port={e.port} data-edge={`${e.from}->${e.to}`} className="yx-builder__edge" data-hot={hot || undefined}>
                        <path d={`M${sx},${sy} C${sx},${sy + dy} ${tx},${ty - dy} ${tx},${ty - 2}`} markerEnd="url(#yx-builder-arrow)" />
                      </g>
                    );
                  })}
                </svg>
                {flow.nodes.map((n) => {
                  const err = errors[n.id];
                  return (
                    <NodeCard
                      key={n.id}
                      kind={n.kind}
                      title={n.title}
                      summary={nodeSummary(n, schema)}
                      status={n.disabled ? 'disabled' : err ? 'error' : 'valid'}
                      error={err}
                      selected={selected === n.id}
                      highlighted={highlight === n.id}
                      connections={connectionsText(n)}
                      style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
                      buttonProps={nodeHandlers(n)}
                      outputs={portsFor(n.kind).map((p) => (
                        <OutputHandle
                          key={p}
                          node={n}
                          port={p}
                          flow={flow}
                          onAdd={(kind) => {
                            const r = addNodeAfter(flow, n, p, kind);
                            setFlow(r.flow);
                            select(r.node.id);
                            setAnnounce(`${BLOCKS[kind].label} added after ${n.title}${p === 'next' ? '' : ` (${PORT_LABEL[p]})`}.`);
                          }}
                          onConnect={(to) => {
                            setFlow(connectNodes(flow, n.id, p, to));
                            setAnnounce(`${n.title}${p === 'next' ? '' : ` ${PORT_LABEL[p]}`} now goes to ${byId.get(to)?.title}.`);
                          }}
                        />
                      ))}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          {showMini && (
            <MiniMap
              flow={flow}
              width={W}
              height={H}
              zoom={zoom}
              scroll={scroll}
              selected={selected}
              errors={errors}
              onJump={(x, y) => {
                const vp = viewport.current;
                vp?.scrollTo?.({ left: x * zoom - vp.clientWidth / 2, top: y * zoom - vp.clientHeight / 2 });
              }}
            />
          )}
        </div>

        {selNode && (
          <PropertiesDrawer
            node={selNode}
            schema={schema}
            error={errors[selNode.id]}
            onChange={updateNode}
            onClose={() => {
              select(null);
              document.getElementById(`node-${selNode.id}`)?.focus();
            }}
            onDelete={() => setPendingDelete(selNode.id)}
          />
        )}
      </div>

      {testOpen && (
        <TestRunPanel
          samples={samples}
          defaultSample={defaultSample}
          results={results}
          running={running}
          onRun={runTest}
          nodes={flow.nodes}
          issues={issues}
          onHighlight={setHighlight}
          onSelectNode={(id) => {
            select(id);
            document.getElementById(`node-${id}`)?.focus();
          }}
          onClose={() => setTestOpen(false)}
        />
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={`Delete step ${byId.get(pendingDelete ?? '')?.title ?? ''}?`}
        consequence={`Its ${flow.edges.filter((e) => e.from === pendingDelete || e.to === pendingDelete).length} connections are removed too. The change stays in this draft until you publish.`}
        confirmLabel="Delete step"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function OutputHandle({ node, port, flow, onAdd, onConnect }: { node: FlowNode; port: OutputPort; flow: Flow; onAdd: (k: NodeKind) => void; onConnect: (to: string) => void }) {
  const current = flow.edges.find((e) => e.from === node.id && e.port === port)?.to;
  const targets = flow.nodes.filter((n) => n.id !== node.id && n.kind !== 'trigger' && n.id !== current);
  const where = port === 'next' ? '' : ` for ${PORT_LABEL[port]}`;
  return (
    <div className="yx-node__port" data-port={port} style={{ left: portX(port) }}>
      {port !== 'next' && <span className="yx-node__port-label">{PORT_LABEL[port]}</span>}
      <Menu>
        <MenuTrigger asChild>
          <IconButton icon={Plus} label={`Add or connect next step${where} after ${node.title}`} variant="secondary" size="sm" className="yx-node__add" />
        </MenuTrigger>
        <MenuContent align="center">
          <MenuLabel>Add a step</MenuLabel>
          {KIND_ORDER.filter((k) => k !== 'trigger').map((k) => (
            <MenuItem key={k} icon={BLOCKS[k].icon} disabled={Boolean(BLOCKS[k].locked)} onSelect={() => onAdd(k)} shortcut={BLOCKS[k].locked}>
              {BLOCKS[k].label}
            </MenuItem>
          ))}
          {targets.length > 0 && (
            <>
              <MenuSeparator />
              <MenuLabel>Connect to an existing step</MenuLabel>
              {targets.slice(0, 8).map((t) => (
                <MenuItem key={t.id} onSelect={() => onConnect(t.id)}>
                  {t.title}
                </MenuItem>
              ))}
            </>
          )}
        </MenuContent>
      </Menu>
    </div>
  );
}

function MiniMap({
  flow,
  width,
  height,
  zoom,
  scroll,
  selected,
  errors,
  onJump,
}: {
  flow: Flow;
  width: number;
  height: number;
  zoom: number;
  scroll: { left: number; top: number; width: number; height: number };
  selected: string | null;
  errors: Record<string, string>;
  onJump: (x: number, y: number) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  return (
    <div className="yx-builder__minimap">
      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Mini-map of ${flow.nodes.length} steps. Click to move the view.`}
        onPointerDown={(e) => {
          const r = ref.current?.getBoundingClientRect();
          if (!r || !r.width) return;
          onJump(((e.clientX - r.left) / r.width) * width, ((e.clientY - r.top) / r.height) * height);
        }}
      >
        {flow.nodes.map((n) => (
          <rect
            key={n.id}
            x={n.x}
            y={n.y}
            width={NODE_W}
            height={NODE_H}
            rx={8}
            className="yx-builder__mini-node"
            data-selected={selected === n.id || undefined}
            data-error={errors[n.id] ? true : undefined}
          />
        ))}
        {scroll.width > 0 && (
          <rect x={scroll.left / zoom} y={scroll.top / zoom} width={scroll.width / zoom} height={scroll.height / zoom} className="yx-builder__mini-view" />
        )}
      </svg>
    </div>
  );
}

/**
 * Workflow studio (§46, P22). Below 768 px, or with `layout="read"`, it shows the read-only outline (§37):
 * admin-heavy builders are desktop-first with a read-only phone view.
 */
export function BuilderCanvas(props: BuilderCanvasProps) {
  const narrow = useNarrow();
  const { layout = 'auto' } = props;
  return layout === 'read' || (layout === 'auto' && narrow) ? <WorkflowOutline {...props} /> : <BuilderEditor {...props} />;
}

/* ================================================================== WorkflowOutline (read-only phone view) */

export type OutlineItem = { node: FlowNode } | { ref: FlowNode } | { branch: FlowNode; yes: OutlineItem[]; no: OutlineItem[] };

/**
 * Orders the flow for reading: trigger first, then each step along "next"; a condition's Yes and No paths
 * become nested groups. A step already listed shows as "Then goes to …" so merges are not repeated.
 */
export function outlineFlow(flow: Flow): { items: OutlineItem[]; unconnected: FlowNode[] } {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const nextOf = (from: string, port: OutputPort) => flow.edges.find((e) => e.from === from && e.port === port)?.to;
  const walk = (id: string | undefined): OutlineItem[] => {
    const list: OutlineItem[] = [];
    let cur = id ? byId.get(id) : undefined;
    while (cur) {
      if (seen.has(cur.id)) {
        list.push({ ref: cur });
        break;
      }
      seen.add(cur.id);
      if (cur.kind === 'condition') {
        const b = cur;
        list.push({ branch: b, yes: walk(nextOf(b.id, 'yes')), no: walk(nextOf(b.id, 'no')) });
        break;
      }
      list.push({ node: cur });
      const next = nextOf(cur.id, 'next');
      cur = next ? byId.get(next) : undefined;
    }
    return list;
  };
  const items = flow.nodes.filter((n) => n.kind === 'trigger').flatMap((t) => walk(t.id));
  return { items, unconnected: flow.nodes.filter((n) => !seen.has(n.id)) };
}

function WorkflowOutline({
  name,
  schema,
  value,
  defaultValue = { nodes: [], edges: [] },
  statusText = 'Draft · unpublished changes',
  version,
  defaultTestResults,
  samples = [],
  defaultSample,
}: BuilderCanvasProps) {
  const flow = value ?? defaultValue;
  const errors = useMemo(() => validateFlow(flow, schema), [flow, schema]);
  const { items, unconnected } = useMemo(() => outlineFlow(flow), [flow]);
  const [open, setOpen] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const openNode = open ? byId.get(open) : undefined;
  const errorCount = Object.keys(errors).length;
  const sampleName = samples.find((s) => s.value === defaultSample)?.label;

  const card = (n: FlowNode) => (
    <li key={n.id} className="yx-outline__step">
      <NodeCard
        kind={n.kind}
        title={n.title}
        summary={nodeSummary(n, schema)}
        status={n.disabled ? 'disabled' : errors[n.id] ? 'error' : 'valid'}
        error={errors[n.id]}
        buttonProps={{ onClick: () => setOpen(n.id), 'aria-haspopup': 'dialog', 'aria-pressed': undefined }}
      />
    </li>
  );
  const renderItems = (list: OutlineItem[]): ReactNode =>
    list.map((it) => {
      if ('node' in it) return card(it.node);
      if ('ref' in it)
        return (
          <li key={`ref-${it.ref.id}`} className="yx-outline__ref">
            Then goes to <strong>{it.ref.title}</strong>
          </li>
        );
      return (
        <li key={it.branch.id} className="yx-outline__branchwrap">
          <ol className="yx-outline__list">{card(it.branch)}</ol>
          {(['yes', 'no'] as const).map((p) => (
            <section key={p} className="yx-outline__branch" aria-label={`${it.branch.title}: if ${p}`}>
              <p className="yx-outline__branch-label">If {p}</p>
              {it[p].length ? <ol className="yx-outline__list">{renderItems(it[p])}</ol> : <p className="yx-outline__ref">No step. The workflow ends here.</p>}
            </section>
          ))}
        </li>
      );
    });

  return (
    <div className="yx-outline">
      <header className="yx-outline__head">
        <Heading level={2} as="h1">
          {name}
        </Heading>
        <div className="yx-outline__meta">
          {version && <Badge tone="neutral">{version}</Badge>}
          <span className="yx-builder__status">{statusText}</span>
          {errorCount > 0 && <Badge tone="danger">{errorCount === 1 ? '1 step needs fixing' : `${errorCount} steps need fixing`}</Badge>}
        </div>
      </header>
      <InlineAlert tone="info" title="Edit this workflow on a computer">
        On a phone you can read the steps and see the last test run. Open Workflow Studio on a computer to change it.
      </InlineAlert>
      <div>
        <Button onClick={() => setTestOpen(true)}>Test run</Button>
      </div>

      {flow.nodes.length === 0 ? (
        <p className="yx-outline__ref">This workflow has no steps yet.</p>
      ) : (
        <ol className="yx-outline__list" aria-label={`${flow.nodes.length} steps in order`}>
          {renderItems(items)}
        </ol>
      )}
      {unconnected.length > 0 && (
        <section className="yx-outline__branchwrap" aria-label="Steps not connected">
          <p className="yx-outline__branch-label">Not connected to the workflow</p>
          <ol className="yx-outline__list">{unconnected.map(card)}</ol>
        </section>
      )}

      <BottomSheet open={openNode != null} onOpenChange={(o) => !o && setOpen(null)} title={openNode?.title ?? ''} description={openNode ? BLOCKS[openNode.kind].label : undefined}>
        {openNode && (
          <div className="yx-outline__detail">
            {errors[openNode.id] && <InlineAlert tone="danger" title={errors[openNode.id]} />}
            <dl>
              <dt>Status</dt>
              <dd>{openNode.disabled ? 'Turned off' : errors[openNode.id] ? 'Needs fixing' : 'Ready'}</dd>
              <dt>What it does</dt>
              <dd>{nodeSummary(openNode, schema)}</dd>
              {openNode.config?.message && (
                <>
                  <dt>Message</dt>
                  <dd>{openNode.config.message}</dd>
                </>
              )}
              <dt>Goes to</dt>
              <dd>
                {portsFor(openNode.kind)
                  .map((p) => {
                    const e = flow.edges.find((x) => x.from === openNode.id && x.port === p);
                    const to = (e && byId.get(e.to)?.title) ?? 'nothing (the workflow ends)';
                    return p === 'next' ? to : `${PORT_LABEL[p]}: ${to}`;
                  })
                  .join(' · ')}
              </dd>
            </dl>
            <p className="yx-outline__ref">Read only. Edit this step on a computer.</p>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={testOpen} onOpenChange={setTestOpen} title="Last test run" description={sampleName ? `Sample record: ${sampleName}` : undefined}>
        {!defaultTestResults || defaultTestResults.length === 0 ? (
          <p className="yx-outline__ref">No test has been run on this version yet. Run a test on a computer.</p>
        ) : (
          <ol className="yx-testrun__steps">
            {defaultTestResults.map((r, i) => (
              <li key={`${r.nodeId}-${i}`} className="yx-testrun__step" data-status={r.status}>
                <Badge tone={STEP_TONE[r.status]}>{STEP_LABEL[r.status]}</Badge>
                <span className="yx-testrun__step-title">{byId.get(r.nodeId)?.title ?? 'Deleted step'}</span>
                <span className="yx-testrun__reason">{r.reason}</span>
              </li>
            ))}
          </ol>
        )}
      </BottomSheet>
    </div>
  );
}

/* ================================================================== VersionCompare */

export type VersionStatus = 'published' | 'draft' | 'archived';

export interface FlowVersion {
  id: string;
  number: number;
  status: VersionStatus;
  date: Date;
  author: string;
  /** Change note. */
  note?: string;
  flow: Flow;
}

export interface VersionCompareProps {
  versions: FlowVersion[];
  schema: RuleSchema;
  /** Older version id. Default: the second-newest. */
  defaultFrom?: string;
  /** Newer version id. Default: the newest. */
  defaultTo?: string;
  /** Creates a new draft from that version (P22 YX-WFS-05). */
  onRollback?: (version: FlowVersion) => void | Promise<void>;
}

const VERSION_TONE: Record<VersionStatus, BadgeTone> = { published: 'success', draft: 'info', archived: 'neutral' };
const VERSION_LABEL: Record<VersionStatus, string> = { published: 'Published', draft: 'Draft', archived: 'Archived' };

/** Version history with a side-by-side diff and roll back (§46). */
export function VersionCompare({ versions, schema, defaultFrom, defaultTo, onRollback }: VersionCompareProps) {
  const sorted = [...versions].sort((a, b) => b.number - a.number);
  const [fromId, setFromId] = useState<string | null>(defaultFrom ?? sorted[1]?.id ?? null);
  const [toId, setToId] = useState<string | null>(defaultTo ?? sorted[0]?.id ?? null);
  const opts = sorted.map((v) => ({ value: v.id, label: `v${v.number} · ${VERSION_LABEL[v.status]}` }));
  const pair = [versions.find((v) => v.id === fromId), versions.find((v) => v.id === toId)];
  const [older, newer] = pair[0] && pair[1] && pair[0].number > pair[1].number ? [pair[1], pair[0]] : pair;
  const diff = older && newer && older.id !== newer.id ? diffFlows(older.flow, newer.flow) : null;
  const title = (id: string) => newer?.flow.nodes.find((n) => n.id === id)?.title ?? older?.flow.nodes.find((n) => n.id === id)?.title ?? id;
  const total = diff ? diff.added.length + diff.removed.length + diff.changed.length + diff.connectionsAdded.length + diff.connectionsRemoved.length : 0;

  return (
    <div className="yx-versions">
      <section className="yx-versions__list" aria-label="Versions">
        <ol>
          {sorted.map((v) => (
            <li key={v.id} className="yx-versions__item" data-compared={v.id === older?.id || v.id === newer?.id || undefined}>
              <span className="yx-versions__num">v{v.number}</span>
              <Badge tone={VERSION_TONE[v.status]}>{VERSION_LABEL[v.status]}</Badge>
              <span className="yx-versions__meta">
                {formatDate(v.date)} by {v.author}
              </span>
              {v.note && <span className="yx-versions__note">{v.note}</span>}
            </li>
          ))}
        </ol>
      </section>

      <section className="yx-versions__compare" aria-label="Compare versions">
        <div className="yx-versions__pick">
          <FormField label="Compare">
            <Select options={opts} value={fromId} onChange={setFromId} size="sm" />
          </FormField>
          <FormField label="With">
            <Select options={opts} value={toId} onChange={setToId} size="sm" />
          </FormField>
          {older && newer && older.id !== newer.id && older.status !== 'draft' && onRollback && (
            <ConfirmDialog
              trigger={<Button size="sm">{`Roll back to v${older.number}`}</Button>}
              title={`Roll back to v${older.number}?`}
              consequence={`This creates a new draft from v${older.number}. Employees keep using the published version until you publish the draft.`}
              confirmLabel={`Roll back to v${older.number}`}
              onConfirm={() => onRollback(older)}
            />
          )}
        </div>

        <div aria-live="polite">
          {!diff ? (
            <p className="yx-versions__none">Choose two different versions to compare.</p>
          ) : total === 0 ? (
            <p className="yx-versions__none">
              v{older!.number} and v{newer!.number} have the same steps and connections.
            </p>
          ) : (
            <>
              <p className="yx-versions__none">
                Changes from v{older!.number} to v{newer!.number}: {diff.added.length} added, {diff.removed.length} removed, {diff.changed.length} changed.
              </p>
              <ul className="yx-versions__diff">
                {diff.added.map((n) => (
                  <li key={`a-${n.id}`} data-change="added">
                    <Badge tone="success">Added</Badge>
                    <span className="yx-versions__what">
                      <strong>{n.title}</strong> · {BLOCKS[n.kind].label}
                      <span className="yx-versions__detail">{nodeSummary(n, schema)}</span>
                    </span>
                  </li>
                ))}
                {diff.removed.map((n) => (
                  <li key={`r-${n.id}`} data-change="removed">
                    <Badge tone="danger">Removed</Badge>
                    <span className="yx-versions__what">
                      <strong>{n.title}</strong> · {BLOCKS[n.kind].label}
                      <span className="yx-versions__detail">{nodeSummary(n, schema)}</span>
                    </span>
                  </li>
                ))}
                {diff.changed.map(({ before, after, what }) => (
                  <li key={`c-${after.id}`} data-change="changed">
                    <Badge tone="warning">Changed</Badge>
                    <span className="yx-versions__what">
                      <strong>{after.title}</strong> · {what.join(', ')}
                      {before.title !== after.title && <span className="yx-versions__detail">Name was {before.title}</span>}
                      {what.includes('settings') && (
                        <span className="yx-versions__detail">
                          Before: {nodeSummary(before, schema)} · After: {nodeSummary(after, schema)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
                {diff.connectionsAdded.map((e) => (
                  <li key={`ca-${e.id}`} data-change="added">
                    <Badge tone="success">Connection added</Badge>
                    <span className="yx-versions__what">
                      {title(e.from)}
                      {e.port !== 'next' && ` (${PORT_LABEL[e.port]})`} to {title(e.to)}
                    </span>
                  </li>
                ))}
                {diff.connectionsRemoved.map((e) => (
                  <li key={`cr-${e.id}`} data-change="removed">
                    <Badge tone="danger">Connection removed</Badge>
                    <span className="yx-versions__what">
                      {title(e.from)}
                      {e.port !== 'next' && ` (${PORT_LABEL[e.port]})`} to {title(e.to)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
