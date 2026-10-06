import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AgentPlanDesk,
  AgentPlanPhone,
  AiBuildPanelScreen,
  RunDetailScreen,
  RunLogScreen,
  ScriptEditorScreen,
  TemplateGalleryScreen,
  TestPreviewDrawer,
  WorkflowStudioScreen,
  WorkflowVersionsScreen,
  type StepPolicy,
  type Template,
  type TraceStep,
  type WorkflowRun,
} from './studio-screens';
import type { Flow, FlowVersion } from '../../components/builder';
import type { AssistantMessage } from '../../components/notify';
import type { ImpactRow, PlanStep } from './platform-b-kit';
import { PEOPLE_SCHEMA, PROBATION_FLOW, RUN_STEPS, SAMPLE_EMPLOYEES, TRANSFER_PLAN, d } from './platform-b-data';

const meta: Meta = { title: 'Screens/Platform/PLT-55…64 · Workflow Studio & assistant', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

/* ---- PLT-55 ---- */
const POLICIES: StepPolicy[] = [
  { step: 'Tell the manager', onError: 'retry', retries: 3, irreversible: true },
  { step: 'Manager decides: confirm or extend', onError: 'stop' },
  { step: 'Set probation status: Confirmed', onError: 'fallback' },
  { step: 'Send confirmation letter', onError: 'retry', retries: 3, irreversible: true },
];
const studio = { name: 'Probation ending reminders', schema: PEOPLE_SCHEMA, flow: PROBATION_FLOW, version: 'v3', status: 'Draft' as const, policies: POLICIES, loops: [{ step: 'For each direct report', over: 'the manager’s team', max: 500 }] };
export const Plt55Canvas: S = { name: 'PLT-55 · Studio canvas', render: () => <WorkflowStudioScreen {...studio} /> };
export const Plt55Trigger: S = { name: 'PLT-55 · Studio · trigger (8 types)', render: () => <WorkflowStudioScreen {...studio} defaultTab="trigger" /> };
export const Plt55Errors: S = { name: 'PLT-55 · Studio · error handling per step', render: () => <WorkflowStudioScreen {...studio} defaultTab="errors" /> };
export const Plt55LoopMissing: S = { name: 'PLT-55 · Studio · loop without max (can’t save)', render: () => <WorkflowStudioScreen {...studio} defaultTab="limits" loops={[{ step: 'For each document', over: 'expiring documents', max: null }]} /> };
export const Plt55Paused: S = { name: 'PLT-55 · Studio · paused by kill switch', render: () => <WorkflowStudioScreen {...studio} status="Paused" paused /> };
export const Plt55Simple: S = {
  name: 'PLT-55 · Simple mode (P19 automation as one step)',
  render: () => (
    <WorkflowStudioScreen
      {...studio}
      name="Low leave balance alert"
      simple={{ rule: { trigger: 'leave.balance_changed', conditions: { id: 'g', join: 'and', items: [{ id: 'c', field: 'leave_balance', operator: 'lt', value: 2 }] }, actions: [{ id: 'a', type: 'notify', target: 'manager' }] } }}
    />
  ),
};

/* ---- PLT-56 ---- */
const TEMPLATES: Template[] = [
  { id: 't1', name: 'Probation ending reminders', module: 'People', description: '30 days before probation ends: ask the manager, confirm or extend, generate the letter.', steps: 7, used: true, update: { from: 'v3', to: 'v4', change: 'Adds a reminder to the manager after 5 days without a decision, and a timeout branch that alerts HR.' } },
  { id: 't2', name: 'Document expiry chase', module: 'People', description: 'Remind the employee 30, 15 and 5 days before a document expires; alert HR if it lapses.', steps: 6 },
  { id: 't3', name: 'Birthday and work-anniversary wishes', module: 'Engage', description: 'Post a wish on the feed and notify the manager on the day.', steps: 3 },
  { id: 't4', name: 'Monthly headcount report', module: 'Analytics', description: 'On the 1st, email the headcount report to the leadership team.', steps: 2 },
  { id: 't5', name: 'New-joiner IT request', module: 'People', description: 'When someone joins, create an IT task for laptop and access cards.', steps: 3, used: true },
  { id: 't6', name: 'Leave balance low alert', module: 'Time', description: 'Tell the manager when a team member’s balance drops below 2 days.', steps: 3 },
  { id: 't7', name: 'Candidate no-show follow-up', module: 'Hiring', description: 'If a candidate misses an interview, send a reschedule link and tell the recruiter.', steps: 4 },
];
export const Plt56: S = { name: 'PLT-56 · Template gallery', render: () => <TemplateGalleryScreen templates={TEMPLATES} /> };
export const Plt56Update: S = { name: 'PLT-56 · Template gallery · update offered', render: () => <TemplateGalleryScreen templates={TEMPLATES} updateOpen="t1" /> };
export const Plt56Filtered: S = { name: 'PLT-56 · Template gallery · filtered to Time', render: () => <TemplateGalleryScreen templates={TEMPLATES} filter="Time" /> };
export const Plt56Empty: S = { name: 'PLT-56 · Template gallery · filtered to nothing', render: () => <TemplateGalleryScreen templates={TEMPLATES} filter="Payroll" /> };

/* ---- PLT-57 ---- */
const TRACE_OK: TraceStep[] = [
  { step: '30 days before probation ends', status: 'passed', input: 'KF-0142 · probation ends 29 Oct 2026', output: 'Started' },
  { step: 'Tell the manager', status: 'passed', input: 'to: Karthik Subramanian', output: 'Would send in-app and email (not sent: test)' },
  { step: 'Manager decides: confirm or extend', status: 'passed', input: 'approver: Karthik Subramanian · expires in 10 days', output: 'Test answer: Confirmed' },
  { step: 'Confirmed?', status: 'passed', input: 'Probation status = Confirmed', output: 'Took Yes' },
  { step: 'Set probation status: Confirmed', status: 'passed', input: 'Probation status: On probation', output: 'Would set: Confirmed' },
  { step: 'Send confirmation letter', status: 'passed', input: 'template: Confirmation letter v2', output: 'Would generate CONF-2026-0142' },
];
const TRACE_FAIL: TraceStep[] = [
  ...TRACE_OK.slice(0, 1).map((t) => ({ ...t, input: 'KF-0199 · probation ends 2 Nov 2026' })),
  { step: 'Tell the manager', status: 'failed', input: 'to: reporting manager', output: 'No reporting manager is set for KF-0199. Set one in Job details.' },
];
const IMPACT: ImpactRow[] = [
  { id: 'p1', name: 'Murugan Selvam', department: 'Operations · Hosur plant', oldValue: 'On probation', newValue: 'Reminder on 29 Sep 2026' },
  { id: 'p2', name: 'Harish Rao', department: 'Sales · Bengaluru', oldValue: 'On probation', newValue: 'Reminder on 6 Oct 2026' },
  { id: 'p3', name: 'Lavanya Shetty', department: 'Finance · Bengaluru', oldValue: 'On probation', newValue: 'Reminder on 13 Oct 2026' },
];
const test = { name: 'Probation ending reminders', version: 'v3', samples: SAMPLE_EMPLOYEES };
export const Plt57NotRun: S = { name: 'PLT-57 · Test and preview · not run', render: () => <TestPreviewDrawer {...test} chosen={['KF-0142', 'KF-0199']} traces={null} impact={null} /> };
export const Plt57Running: S = { name: 'PLT-57 · Test and preview · running', render: () => <TestPreviewDrawer {...test} chosen={['KF-0142', 'KF-0199']} traces={null} impact={null} state="running" /> };
export const Plt57Trace: S = { name: 'PLT-57 · Test and preview · trace and impact', render: () => <TestPreviewDrawer {...test} chosen={['KF-0142']} traces={{ 'KF-0142': TRACE_OK }} impact={{ rows: IMPACT, runs: 14 }} /> };
export const Plt57Failed: S = { name: 'PLT-57 · Test and preview · a sample fails', render: () => <TestPreviewDrawer {...test} chosen={['KF-0199', 'KF-0142']} traces={{ 'KF-0199': TRACE_FAIL, 'KF-0142': TRACE_OK }} impact={{ rows: IMPACT, runs: 14 }} /> };
export const Plt57Stored: S = { name: 'PLT-57 · Test and preview · stored with version', render: () => <TestPreviewDrawer {...test} chosen={['KF-0142']} traces={{ 'KF-0142': TRACE_OK }} impact={{ rows: IMPACT, runs: 14 }} stored="29 Sep 2026, 9:38 am" /> };

/* ---- PLT-58 ---- */
const V2: Flow = { nodes: PROBATION_FLOW.nodes.filter((n) => n.id !== 'n2'), edges: PROBATION_FLOW.edges.filter((e) => e.to !== 'n2') };
const V1: Flow = { nodes: V2.nodes.filter((n) => n.id !== 'w1'), edges: V2.edges.filter((e) => e.to !== 'w1') };
const VERSIONS: FlowVersion[] = [
  { id: 'v3', number: 3, status: 'draft', date: d(9, 29), author: 'Lakshmi Venkatesan', note: 'Adds the confirmation letter', flow: PROBATION_FLOW },
  { id: 'v2', number: 2, status: 'published', date: d(9, 2), author: 'Lakshmi Venkatesan', note: 'Wait for extension review with 45-day timeout', flow: V2 },
  { id: 'v1', number: 1, status: 'archived', date: d(8, 10), author: 'Anand Krishnan', note: 'From the gallery template', flow: V1 },
];
const VMETA = [
  { id: 'v3', author: 'Lakshmi Venkatesan', approval: 'needed' as const },
  { id: 'v2', author: 'Lakshmi Venkatesan', approver: 'Anand Krishnan', approval: 'approved' as const },
  { id: 'v1', author: 'Anand Krishnan', approver: 'Lakshmi Venkatesan', approval: 'approved' as const },
];
export const Plt58Owner: S = { name: 'PLT-58 · Versions · owner (diff, re-publish)', render: () => <WorkflowVersionsScreen name="Probation ending reminders" schema={PEOPLE_SCHEMA} versions={VERSIONS} meta={VMETA} persona="owner" /> };
export const Plt58Approver: S = { name: 'PLT-58 · Versions · second approver', render: () => <WorkflowVersionsScreen name="Probation ending reminders" schema={PEOPLE_SCHEMA} versions={VERSIONS} meta={VMETA} persona="approver" /> };

/* ---- PLT-59 ---- */
const RUNS: WorkflowRun[] = [
  { id: 'WR-10482', workflow: 'Probation ending reminders', version: 'v2', status: 'Waiting', started: d(9, 29, 6, 0), startedBy: 'Date trigger', steps: 3, records: 1 },
  { id: 'WR-10481', workflow: 'Document expiry chase', version: 'v5', status: 'Failed', started: d(9, 29, 5, 30), startedBy: 'Schedule', steps: 2, records: 22, failedStep: 'Notify manager', error: 'Manager has no work email for KF-0199' },
  { id: 'WR-10479', workflow: 'Warehouse B cost centre fix', version: 'v1', status: 'Done', started: d(9, 28, 16, 10), startedBy: 'Lakshmi Venkatesan (manual)', steps: 5, records: 412 },
  { id: 'WR-10470', workflow: 'New-joiner IT request', version: 'v4', status: 'Running', started: d(9, 29, 9, 40), startedBy: 'Event: employee joined', steps: 1, records: 1 },
  { id: 'WR-10466', workflow: 'Monthly headcount report', version: 'v2', status: 'Stopped', started: d(9, 1, 7, 0), startedBy: 'Schedule', steps: 1, records: 0, failedStep: 'Run limit', error: 'Stopped at 500 records (per-run limit)' },
  { id: 'WR-10450', workflow: 'Leave balance low alert', version: 'v1', status: 'Undone', started: d(9, 25, 11, 0), startedBy: 'Field change', steps: 3, records: 37 },
];
const WFS = [
  { name: 'Probation ending reminders', on: true },
  { name: 'Document expiry chase', on: true },
  { name: 'New-joiner IT request', on: true },
  { name: 'Leave balance low alert', on: false },
];
export const Plt59: S = { name: 'PLT-59 · Run log', render: () => <RunLogScreen runs={RUNS} workflows={WFS} /> };
export const Plt59Failed: S = { name: 'PLT-59 · Failure queue (retry / skip)', render: () => <RunLogScreen runs={RUNS} workflows={WFS} defaultStatus="Failed" /> };
export const Plt59Paused: S = { name: 'PLT-59 · Run log · tenant kill switch on', render: () => <RunLogScreen runs={RUNS} workflows={WFS} allPaused /> };
export const Plt59Empty: S = { name: 'PLT-59 · Run log · empty', render: () => <RunLogScreen runs={[]} workflows={WFS} /> };
export const Plt59Loading: S = { name: 'PLT-59 · Run log · loading', render: () => <RunLogScreen runs={[]} workflows={WFS} state="loading" /> };
export const Plt59Error: S = { name: 'PLT-59 · Run log · error', render: () => <RunLogScreen runs={[]} workflows={WFS} state="error" /> };

/* ---- PLT-60 ---- */
const RUN_TRACE: TraceStep[] = [
  { step: 'Find employees in Warehouse B', status: 'passed', input: 'department = Warehouse B', output: '412 employees' },
  { step: 'Set cost centre to CC-OPS-HSR', status: 'passed', input: 'cost centre: CC-OPS-WHB', output: '412 updated' },
  { step: 'Email each employee', status: 'passed', input: 'template: Cost centre change', output: '412 emails sent' },
  { step: 'Create IT task for access cards', status: 'passed', input: 'queue: IT helpdesk', output: '12 tasks' },
  { step: 'Post to payroll connector', status: 'passed', input: 'endpoint: payroll-sync (approved)', output: '200 OK' },
];
const bulkRun = RUNS[2];
export const Plt60: S = { name: 'PLT-60 · Run detail · undo plan', render: () => <RunDetailScreen run={bulkRun} steps={RUN_STEPS} trace={RUN_TRACE} /> };
export const Plt60Confirm: S = { name: 'PLT-60 · Run detail · confirm undo', render: () => <RunDetailScreen run={bulkRun} steps={RUN_STEPS} trace={RUN_TRACE} phase="confirm" /> };
export const Plt60Conflict: S = {
  name: 'PLT-60 · Run detail · conflicts refused',
  render: () => <RunDetailScreen run={bulkRun} steps={RUN_STEPS.map((s) => (s.id === 's4' ? { ...s, conflict: '3 IT tasks were closed after the run' } : s))} trace={RUN_TRACE} phase="confirm" />,
};
export const Plt60Undone: S = { name: 'PLT-60 · Run detail · undone', render: () => <RunDetailScreen run={bulkRun} steps={RUN_STEPS} trace={RUN_TRACE} phase="undone" /> };

/* ---- PLT-61 ---- */
const CODE = `import { yx } from '@yukthix/sdk';

export default async function run({ employeeId }: { employeeId: string }) {
  const person = await yx.people.get(employeeId);
  const months = person.tenureMonths;
  const onClient = (await yx.projects.list({ client: 'Nilgiri Spices' })).length > 0;
  const eligible = months >= 6 && onClient;
  yx.log(\`\${employeeId}: tenure \${months} months, eligible \${eligible}\`);
  return { referralBonusEligible: eligible };
}`;
const CHECKS_OK = [
  { name: 'Types', ok: true, detail: 'No type errors' },
  { name: 'Banned APIs', ok: true, detail: 'No file system, eval or network calls' },
  { name: 'Secrets in code', ok: true, detail: 'None found' },
  { name: 'SDK scopes used', ok: true, detail: 'people.read, projects.read' },
];
export const Plt61: S = { name: 'PLT-61 · Script editor · checks pass', render: () => <ScriptEditorScreen code={CODE} checks={CHECKS_OK} identityScopes={['people.read', 'projects.read']} publisherScopes={['people.read', 'people.write', 'projects.read']} console={'> run({ employeeId: "KF-0142" })\nyx.people.get KF-0142 → 200 (38 ms)\nyx.projects.list → 1 project\nlog: KF-0142: tenure 19 months, eligible true\n← { referralBonusEligible: true } · 0.21 s CPU'} /> };
export const Plt61Fail: S = {
  name: 'PLT-61 · Script editor · static checks fail',
  render: () => (
    <ScriptEditorScreen
      code={`${CODE}\nconst key = 'sk_live_4f9a2b';\nawait fetch('https://pastebin.example/upload');`}
      checks={[CHECKS_OK[0], { name: 'Banned APIs', ok: false, detail: 'fetch to a URL that is not an approved connection (line 12)' }, { name: 'Secrets in code', ok: false, detail: 'Looks like an API key on line 11. Use the vault.' }, CHECKS_OK[3]]}
      problems={[{ line: 11, message: 'Secret pattern found. Store it in the vault and read it with yx.secrets.get.', severity: 'error' }, { line: 12, message: 'fetch is not allowed. Call an approved connection.', severity: 'error' }]}
      identityScopes={['people.read', 'projects.read']}
      publisherScopes={['people.read', 'projects.read']}
    />
  ),
};
export const Plt61Identity: S = { name: 'PLT-61 · Script editor · identity broader than publisher', render: () => <ScriptEditorScreen code={CODE} checks={CHECKS_OK} identityScopes={['people.read', 'projects.read', 'pay.write']} publisherScopes={['people.read', 'projects.read']} /> };

/* ---- PLT-62 ---- */
const LOW_BAL: Flow = {
  nodes: [
    { id: 't', kind: 'trigger', title: 'Leave balance changes', x: 320, y: 40, config: { trigger: 'leave.balance_changed' } },
    { id: 'b', kind: 'condition', title: 'Below 2 days?', x: 320, y: 224, config: { rule: { trigger: null, conditions: { id: 'g', join: 'and', items: [{ id: 'c', field: 'leave_balance', operator: 'lt', value: 2 }] }, actions: [] } } },
    { id: 'n', kind: 'notify', title: 'Tell the manager', x: 104, y: 408, config: { recipient: 'manager', message: '{employee} has {balance} days of casual leave left.' } },
  ],
  edges: [
    { id: 'e1', from: 't', to: 'b', port: 'next' },
    { id: 'e2', from: 'b', to: 'n', port: 'yes' },
  ],
};
const MSGS: AssistantMessage[] = [
  { id: 'm1', role: 'user', text: 'Remind managers when someone’s leave balance drops below 2 days' },
  {
    id: 'm2',
    role: 'assistant',
    text: 'I drafted a 3-step workflow: it starts when a leave balance changes, checks whether it is below 2 days, and tells the reporting manager. The impact preview estimates 37 alerts a month across 14 managers. Review it on the canvas; you publish it.',
    sources: [{ label: 'Leave policy v6', href: '#' }, { label: 'Event: leave balance changed', href: '#' }],
  },
];
export const Plt62Draft: S = { name: 'PLT-62 · AI build panel · draft with explanation and preview', render: () => <AiBuildPanelScreen name="Leave balance low alert" schema={PEOPLE_SCHEMA} flow={LOW_BAL} messages={MSGS} canPublish impact="Impact preview: 37 alerts a month to 14 managers." /> };
export const Plt62NoPublish: S = { name: 'PLT-62 · AI build panel · workflow owner without publish rights', render: () => <AiBuildPanelScreen name="Leave balance low alert" schema={PEOPLE_SCHEMA} flow={LOW_BAL} messages={MSGS} canPublish={false} impact="Impact preview: 37 alerts a month to 14 managers." /> };
export const Plt62Generating: S = { name: 'PLT-62 · AI build panel · generating', render: () => <AiBuildPanelScreen name="Untitled workflow" schema={PEOPLE_SCHEMA} flow={null} messages={[MSGS[0]]} canPublish generating /> };
export const Plt62Uncertain: S = {
  name: 'PLT-62 · AI build panel · uncertain answer',
  render: () => (
    <AiBuildPanelScreen
      name="Contract end follow-up"
      schema={PEOPLE_SCHEMA}
      flow={null}
      canPublish
      messages={[
        { id: 'u1', role: 'user', text: 'When a contract ends, stop their access' },
        { id: 'u2', role: 'assistant', text: 'I can draft the reminders, but access changes are not a workflow step.', uncertain: 'Access removal is done by the offboarding checklist. Check Settings › Exit & lifecycle policies.' },
      ]}
    />
  ),
};

/* ---- PLT-63 / PLT-64 ---- */
const PLAN: PlanStep[] = TRANSFER_PLAN.map((s) => ({ ...s, state: undefined, result: undefined }));
const PLAN_PAY: PlanStep[] = [
  ...PLAN,
  { id: 'p4', action: 'Change Chakan location allowance to ₹2,500 a month', records: '12 employees', api: 'Compensation screen', alwaysConfirm: 'pay-change', screen: 'Compensation' },
];
const req = 'Move the 12 people in the Pune warehouse to the new Chakan location from 1 Nov';
const as = 'as Lakshmi Venkatesan, with your permissions';
export const Plt63: S = { name: 'PLT-63 · Agent plan card', render: () => <AgentPlanDesk request={req} steps={PLAN} phase="plan" actingAs={as} /> };
export const Plt63Confirm: S = { name: 'PLT-63 · Agent plan card · always-confirm step', render: () => <AgentPlanDesk request={`${req}, with the Chakan allowance`} steps={PLAN_PAY} phase="plan" actingAs={as} /> };
export const Plt63Blocked: S = { name: 'PLT-63 · Agent plan card · outside your permissions', render: () => <AgentPlanDesk request="Release October payroll" steps={[{ id: 'x', action: 'Release October 2026 payroll', records: '248 payslips', api: 'Payroll run screen', alwaysConfirm: 'money', irreversible: true }]} phase="plan" actingAs="as Divya Raghunathan, with your permissions" blocked="You don't have payroll release rights. Ask Suresh Pillai, Payroll Manager." /> };
export const Plt63Phone: S = { ...phone, name: 'PLT-63 · Agent plan card · phone', render: () => <AgentPlanPhone request={req} steps={PLAN_PAY} phase="plan" actingAs={as} /> };
export const Plt64Progress: S = { name: 'PLT-64 · Plan progress', render: () => <AgentPlanDesk request={req} steps={TRANSFER_PLAN} phase="progress" actingAs={as} /> };
export const Plt64Handed: S = {
  name: 'PLT-64 · Plan progress · step handed to its own screen',
  render: () => <AgentPlanDesk request={req} steps={[...TRANSFER_PLAN.map((s) => ({ ...s, state: 'done' as const })), { ...PLAN_PAY[3], state: 'handed-off' }]} phase="progress" actingAs={as} onOpenScreen={() => {}} />,
};
export const Plt64Summary: S = {
  name: 'PLT-64 · Plan summary with undo',
  render: () => <AgentPlanDesk request={req} steps={TRANSFER_PLAN.map((s) => ({ ...s, state: 'done' as const, result: s.result ?? '3 managers notified' }))} phase="summary" actingAs={as} summary="Done: 12 transfer requests raised, 12 cost-centre changes scheduled, 3 managers notified. Undo withdraws the pending requests and cancels the scheduled changes; notifications stay sent." />,
};
export const Plt64Failed: S = {
  name: 'PLT-64 · Plan stopped on a failed step',
  render: () => <AgentPlanDesk request={req} steps={[TRANSFER_PLAN[0], { ...TRANSFER_PLAN[1], state: 'failed', result: 'Cost centre CC-OPS-CKN is closed. The plan stopped; nothing else ran.' }, { ...TRANSFER_PLAN[2], state: 'skipped' }]} phase="summary" actingAs={as} summary="Stopped after step 2. Undo withdraws the 12 transfer requests." />,
};
export const Plt64Phone: S = { ...phone, name: 'PLT-64 · Plan progress · phone', render: () => <AgentPlanPhone request={req} steps={TRANSFER_PLAN} phase="progress" actingAs={as} /> };
export const Plt64PhoneSummary: S = { ...phone, name: 'PLT-64 · Plan summary · phone', render: () => <AgentPlanPhone request={req} steps={TRANSFER_PLAN.map((s) => ({ ...s, state: 'done' as const }))} phase="summary" actingAs={as} summary="Done. 12 requests raised, 3 managers notified." /> };
