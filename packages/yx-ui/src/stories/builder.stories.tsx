import '../components/builder.css';
import '../components/condition.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import {
  BuilderCanvas,
  NodeCard,
  NODE_H,
  NODE_W,
  TestRunPanel,
  VersionCompare,
  type Flow,
  type FlowNode,
  type FlowVersion,
  type TestStepResult,
} from '../components/builder';
import { LEAVE_SCHEMA } from './condition.stories';
import { Section } from './story-kit';

const meta: Meta = { title: 'Builders/Workflow canvas', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const frame = (children: ReactNode, height = 760) => <div style={{ height, padding: 16, boxSizing: 'border-box' }}>{children}</div>;

const LEAVE_FLOW: Flow = {
  nodes: [
    { id: 't1', kind: 'trigger', title: 'Leave request submitted', x: 320, y: 40, config: { trigger: 'leave.submitted' } },
    {
      id: 'b1',
      kind: 'condition',
      title: 'More than 3 days?',
      x: 320,
      y: 224,
      config: { rule: { trigger: null, conditions: { id: 'g0', join: 'and', items: [{ id: 'c1', field: 'days', operator: 'gt', value: 3 }] }, actions: [] } },
    },
    { id: 'm1', kind: 'approval', title: 'Manager approval', x: 104, y: 408, config: { approver: 'manager', expiresDays: 3 } },
    { id: 'h1', kind: 'approval', title: 'HR approval', x: 104, y: 592, config: { approver: 'hrbp', expiresDays: 5 } },
    { id: 'n1', kind: 'notify', title: 'Notify employee', x: 536, y: 776, config: { recipient: 'employee', message: 'Your leave request has been decided.' } },
  ],
  edges: [
    { id: 'e1', from: 't1', to: 'b1', port: 'next' },
    { id: 'e2', from: 'b1', to: 'm1', port: 'yes' },
    { id: 'e3', from: 'b1', to: 'n1', port: 'no' },
    { id: 'e4', from: 'm1', to: 'h1', port: 'next' },
    { id: 'e5', from: 'h1', to: 'n1', port: 'next' },
  ],
};

const SAMPLES = [
  { value: 'LR-2291', label: 'LR-2291 · Priya Raghavan, 5 days casual leave' },
  { value: 'LR-2288', label: 'LR-2288 · Mohammed Irfan, 2 days sick leave' },
  { value: 'LR-2275', label: 'LR-2275 · Deepa Nair, 12 days earned leave' },
];

const RESULTS: TestStepResult[] = [
  { nodeId: 't1', status: 'passed', reason: 'LR-2291 submitted by Priya Raghavan on 28 Sep 2026' },
  { nodeId: 'b1', status: 'passed', reason: 'Days is 5, more than 3: took the Yes branch' },
  { nodeId: 'm1', status: 'passed', reason: 'Would ask Arjun Kulkarni (reporting manager)' },
  { nodeId: 'h1', status: 'failed', reason: 'No HR Business Partner is set for Chennai. Assign one in Settings, Approvers.' },
  { nodeId: 'n1', status: 'skipped', reason: 'Skipped because HR approval failed' },
];

const fakeRun = (): Promise<TestStepResult[]> => new Promise((res) => setTimeout(() => res(RESULTS), 1200));

const canvas = (props: Partial<Parameters<typeof BuilderCanvas>[0]> = {}) =>
  frame(
    <BuilderCanvas
      name="Leave approval over 3 days"
      schema={LEAVE_SCHEMA}
      defaultValue={LEAVE_FLOW}
      samples={SAMPLES}
      defaultSample="LR-2291"
      onTestRun={fakeRun}
      onPublish={() => {}}
      {...props}
    />,
  );

export const LeaveApproval: S = { name: 'Leave approval, step selected with properties open', render: () => canvas({ defaultSelectedId: 'm1' }) };
export const BranchSelected: S = { name: 'Branch step selected (condition builder)', render: () => canvas({ defaultSelectedId: 'b1' }) };

const WITH_ERROR: Flow = {
  nodes: [
    ...LEAVE_FLOW.nodes.map((n) => (n.id === 'h1' ? { ...n, config: { expiresDays: 5 } } : n)),
    { id: 'w1', kind: 'wait', title: 'Wait for documents', x: 536, y: 408, config: { waitDays: 2, timeoutDays: null } },
  ],
  edges: LEAVE_FLOW.edges,
};
export const NodeWithError: S = { name: 'Steps with errors', render: () => canvas({ defaultValue: WITH_ERROR, defaultSelectedId: 'h1' }) };
export const TestRunResults: S = {
  name: 'Test run results',
  render: () => canvas({ defaultTestOpen: true, defaultTestResults: RESULTS }),
};
export const PublishBlocked: S = {
  name: 'Test panel listing problems',
  render: () => canvas({ defaultValue: WITH_ERROR, defaultTestOpen: true }),
};

// A long onboarding flow, laid out on the grid without randomness.
function largeFlow(): Flow {
  const kinds: FlowNode['kind'][] = ['approval', 'notify', 'wait', 'update', 'notify', 'approval', 'wait', 'notify', 'update', 'approval', 'notify', 'update', 'notify', 'wait'];
  const titles = [
    'Manager confirms start date',
    'Send welcome email',
    'Wait until joining date',
    'Set status to Active',
    'Notify IT for laptop',
    'Buddy assignment approval',
    'Wait 30 days',
    'Ask for 30-day feedback',
    'Record feedback score',
    'HR check-in approval',
    'Notify payroll',
    'Add to PF register',
    'Remind about Form 11',
    'Wait for probation end',
  ];
  const nodes: FlowNode[] = [{ id: 'n0', kind: 'trigger', title: 'Employee joins', x: 40, y: 40, config: { trigger: 'employee.joined' } }];
  kinds.forEach((kind, i) => {
    const col = Math.floor((i + 1) / 5);
    const row = (i + 1) % 5;
    nodes.push({
      id: `n${i + 1}`,
      kind,
      title: titles[i],
      x: 40 + col * (NODE_W + 120),
      y: 40 + row * (NODE_H + 72),
      config:
        kind === 'approval'
          ? { approver: i % 2 ? 'hrbp' : 'manager' }
          : kind === 'notify'
            ? { recipient: i % 3 ? 'employee' : 'hrbp' }
            : kind === 'wait'
              ? { waitDays: 7 * (i % 4 || 1), timeoutDays: 45 }
              : { field: 'probation_status', value: 'Active' },
    });
  });
  const edges = nodes.slice(1).map((n, i) => ({ id: `e${i}`, from: nodes[i].id, to: n.id, port: 'next' as const }));
  return { nodes, edges };
}

export const LargeFlowMiniMap: S = {
  name: 'Large flow with mini-map',
  render: () => canvas({ name: 'New joiner onboarding', defaultValue: largeFlow(), defaultZoom: 0.75, samples: [{ value: 'E-1044', label: 'E-1044 · Karthik Subramanian, joins 5 Oct 2026' }], defaultSample: 'E-1044' }),
};

export const EmptyCanvas: S = { name: 'New workflow (empty)', render: () => canvas({ name: 'Untitled workflow', defaultValue: { nodes: [], edges: [] } }) };

const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Mobile: S = {
  ...phone,
  name: 'Phone: read-only outline',
  render: () => canvas({ version: 'v8', statusText: 'Published · v7 is live', defaultTestResults: RESULTS }),
};
export const MobileErrors: S = {
  ...phone,
  name: 'Phone: read-only outline with errors',
  render: () => canvas({ defaultValue: WITH_ERROR, version: 'v8', layout: 'read' }),
};
export const MobileNoTest: S = {
  ...phone,
  name: 'Phone: large flow, no test run yet',
  render: () => canvas({ name: 'New joiner onboarding', defaultValue: largeFlow(), version: 'v3', statusText: 'Draft · unpublished changes', layout: 'read' }),
};

/* ---- parts ---- */

const cardBox = (children: ReactNode) => <div style={{ position: 'relative', width: NODE_W, height: NODE_H + 24 }}>{children}</div>;
const cardStyle = { left: 0, top: 0, width: NODE_W, height: NODE_H };

export const NodeCards: S = {
  name: 'Node card states',
  parameters: { layout: 'padded', pseudo: { focusVisible: ['[data-focus-demo] .yx-node__main'] } },
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
      <Section title="Valid">{cardBox(<NodeCard kind="approval" title="Manager approval" summary="Reporting manager · expires after 3 days" style={cardStyle} />)}</Section>
      <Section title="Selected">{cardBox(<NodeCard kind="notify" title="Notify employee" summary="To The employee" selected style={cardStyle} />)}</Section>
      <Section title="Error">
        {cardBox(<NodeCard kind="approval" title="HR approval" summary="No approver chosen" status="error" error="Choose who approves" style={cardStyle} />)}
      </Section>
      <Section title="Disabled">{cardBox(<NodeCard kind="wait" title="Wait 30 days" summary="Wait 30 days · timeout after 45 days" status="disabled" style={cardStyle} />)}</Section>
      <Section title="Highlighted from test run">
        {cardBox(<NodeCard kind="condition" title="More than 3 days?" summary="Days is greater than 3" highlighted style={cardStyle} />)}
      </Section>
      <Section title="Long title">
        {cardBox(
          <NodeCard
            kind="update"
            title="Set probation status to Extended for employees at the Hosur plant"
            summary="Set Probation status to Extended pending review by HR Business Partner"
            style={cardStyle}
          />,
        )}
      </Section>
      <Section title="Focus"><div data-focus-demo>{cardBox(<NodeCard kind="trigger" title="Leave request submitted" summary="Leave request is submitted" style={cardStyle} />)}</div></Section>
    </div>
  ),
};

const panel = (children: ReactNode) => <div style={{ maxWidth: 960, border: '1px solid var(--yx-color-border)', borderRadius: 8 }}>{children}</div>;

export const TestPanelStates: S = {
  name: 'Test run panel: empty, running, results',
  parameters: { layout: 'padded' },
  render: () => (
    <>
      <Section title="Not run yet">{panel(<TestRunPanel samples={SAMPLES} results={null} onRun={() => {}} nodes={LEAVE_FLOW.nodes} />)}</Section>
      <Section title="Running">{panel(<TestRunPanel samples={SAMPLES} defaultSample="LR-2291" results={null} running onRun={() => {}} nodes={LEAVE_FLOW.nodes} />)}</Section>
      <Section title="Results">{panel(<TestRunPanel samples={SAMPLES} defaultSample="LR-2291" results={RESULTS} onRun={() => {}} nodes={LEAVE_FLOW.nodes} />)}</Section>
    </>
  ),
};

const V6_FLOW: Flow = {
  nodes: LEAVE_FLOW.nodes.filter((n) => n.id !== 'h1').map((n) => (n.id === 'n1' ? { ...n, title: 'Email employee' } : n)),
  edges: [...LEAVE_FLOW.edges.filter((e) => e.from !== 'h1' && e.to !== 'h1'), { id: 'e9', from: 'm1', to: 'n1', port: 'next' }],
};
const V7_FLOW: Flow = {
  ...V6_FLOW,
  nodes: V6_FLOW.nodes.map((n) => (n.id === 'm1' ? { ...n, config: { approver: 'manager', expiresDays: 5 } } : n.id === 'n1' ? { ...n, title: 'Notify employee' } : n)),
};
const V8_FLOW: Flow = {
  nodes: [...LEAVE_FLOW.nodes, { id: 'u1', kind: 'update', title: 'Mark as long leave', x: 536, y: 592, config: { field: 'reason', value: 'Long leave' } }],
  edges: LEAVE_FLOW.edges,
};

const VERSIONS: FlowVersion[] = [
  { id: 'v8', number: 8, status: 'draft', date: new Date(2026, 8, 29), author: 'Arjun Kulkarni', note: 'Adds HR approval for leave over 3 days', flow: V8_FLOW },
  { id: 'v7', number: 7, status: 'published', date: new Date(2026, 8, 28), author: 'Lakshmi Venkatesan', note: 'Manager approval expires after 5 days', flow: V7_FLOW },
  { id: 'v6', number: 6, status: 'archived', date: new Date(2026, 7, 12), author: 'Lakshmi Venkatesan', note: 'First version with a branch', flow: V6_FLOW },
];

export const Versions: S = {
  name: 'Version compare',
  parameters: { layout: 'padded' },
  render: () => <VersionCompare versions={VERSIONS} schema={LEAVE_SCHEMA} defaultFrom="v6" defaultTo="v8" onRollback={() => new Promise((r) => setTimeout(r, 800))} />,
};
export const VersionsSame: S = {
  name: 'Version compare, same version picked',
  parameters: { layout: 'padded' },
  render: () => <VersionCompare versions={VERSIONS} schema={LEAVE_SCHEMA} defaultFrom="v7" defaultTo="v7" />,
};
export const VersionsMobile: S = {
  name: 'Version compare, mobile',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  parameters: { layout: 'padded' },
  render: () => <VersionCompare versions={VERSIONS} schema={LEAVE_SCHEMA} onRollback={() => {}} />,
};
